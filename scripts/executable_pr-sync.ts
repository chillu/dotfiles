#!/usr/bin/env node
// pr-sync — keep cmux workspaces in lockstep with Runn-Fast open PRs.
//
// Run:  pr-sync [--dry-run] [--verbose|-v]
//
// Subcommand:
//   pr-sync --refresh-container [path]
//     Recompute and apply the workspace-title container indicator (🟢/🔴) for
//     the PR whose worktree contains `path` (default: cwd). No state write,
//     no full sync. Intended to wrap `runn up` / `runn down`:
//       runn up && ~/scripts/pr-sync.ts --refresh-container
//
// One pass = sync (author + reviewer PRs in Runn-Fast/runn and Runn-Fast/runn-cli)
// followed by cleanup (any worktree whose PR is closed/merged is removed and its
// workspace is renamed "CLOSED …" with its color cleared).

import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------- config ----------
const PALETTE = [
  "#2b59c3", "#4869a6", "#0096c7", "#3f7187",
  "#178085", "#6a4c93", "#7f6bb4", "#8338ec",
  "#a253b6", "#ab4b86", "#976e1b", "#90630b",
];
const REVIEWER_COLOR = "#3a7d44";        // muted green, outside the palette
const TITLE_MAX = 40;                    // chars before truncation with "…" (applies to PR title portion only)

// Emoji prefixes — title: "<container-or-cli-emoji?> <title>" (closed: "🪦 <title>", stale: "🚫 <title>")
//                  description: "<ci-emoji> [👀 ]<github-url>" (closed/stale: plain URL)
const CI_EMOJI: Record<string, string> = {
  passed: "✅",
  failed: "❌",
  pending: "🟡",
  running: "🟡",
  cancelled: "⛔",
  conflicts: "⚠️",
  "no-ci": "⚪",
};
const CI_EMOJI_DEFAULT = "❔";
const REVIEWER_EMOJI = "👀";
const CLI_EMOJI = "🖥️";                  // any PR in Runn-Fast/runn-cli, overrides gitflow type
const CONTAINER_RUNNING_EMOJI = "🟢";
const CONTAINER_STOPPED_EMOJI = "🔴";
const CLOSED_EMOJI = "🪦";
const STALE_EMOJI = "🚫";
const STALE_LABEL = "Stale";
const REPOS = [
  { full: "Runn-Fast/runn", path: path.join(os.homedir(), "Projects/runn") },
  { full: "Runn-Fast/runn-cli", path: path.join(os.homedir(), "Projects/runn-cli") },
];
const STATE_DIR = path.join(os.homedir(), ".config/pr-sync");
const STATE_PATH = path.join(STATE_DIR, "state.json");
const LOCK_PATH = path.join(STATE_DIR, "lock");
const ICED_PATH = path.join(STATE_DIR, "iced.json");   // PRs put "on ice": hidden from workspaces, still draft on GitHub

// ---------- types ----------
type Role = "author" | "reviewer";
type Status = "active" | "closed" | "stale";

interface PrEntry {
  repo: string;
  number: number;
  role: Role;
  branch: string;
  worktree_path: string;
  workspace_ref: string | null;
  color: string;
  title: string;
  status: Status;
  updated_at: string;       // when pr-sync last touched this entry
  pr_updated_at?: string;   // GitHub's PR.updatedAt — advances on commits/comments/reviews/labels; used for sort ordering
}
interface State { prs: Record<string, PrEntry> }

interface GhPr {
  number: number;
  title: string;
  headRefName: string;
  isDraft: boolean;
  state: string;
  labels: { name: string }[];
  headRepository: { name: string } | null;
  updatedAt: string;
}
interface CmuxWs {
  ref: string;
  title: string;
  current_directory: string | null;
  custom_color: string | null;
  description: string | null;
}
interface WtEntry {
  branch: string;
  path: string;
  is_main?: boolean;
  working_tree?: {
    staged: boolean; modified: boolean; untracked: boolean;
    renamed: boolean; deleted: boolean;
  };
  ci?: { status: string; source: string; stale: boolean; url: string };
}

// ---------- args ----------
const ARGS = process.argv.slice(2);
const DRY = ARGS.includes("--dry-run");
const VERBOSE = ARGS.includes("--verbose") || ARGS.includes("-v");

// ---------- helpers ----------
function log(...m: unknown[]) { console.log("[pr-sync]", ...m); }
function vlog(...m: unknown[]) { if (VERBOSE) console.log("[pr-sync]", ...m); }
function warn(...m: unknown[]) { console.warn("[pr-sync] WARN:", ...m); }

function exec(cmd: string, args: string[], opts: SpawnSyncOptions = {}): SpawnSyncReturns<string> {
  vlog("$", cmd, args.join(" "), opts.cwd ? `(cwd=${opts.cwd})` : "");
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}
function execOk(cmd: string, args: string[], opts: SpawnSyncOptions = {}): string {
  const r = exec(cmd, args, opts);
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (exit ${r.status}): ${r.stderr?.trim()}`);
  }
  return r.stdout;
}

function loadState(): State {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as State; }
  catch { return { prs: {} }; }
}
function saveState(s: State) {
  if (DRY) { vlog("(dry) skipped state write"); return; }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

// Ice list — keys (`<repo>#<n>`) the user has parked. Sync skips them and their
// workspace is removed; the worktree is kept so they can be un-iced later.
function loadIced(): Set<string> {
  try { return new Set(JSON.parse(fs.readFileSync(ICED_PATH, "utf8")) as string[]); }
  catch { return new Set(); }
}
function saveIced(s: Set<string>) {
  if (DRY) { vlog("(dry) skipped iced write"); return; }
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(ICED_PATH, JSON.stringify([...s].sort(), null, 2));
}

// Lock so two runs can't trample each other.
function acquireLock(): () => void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  while (true) {
    try {
      const fd = fs.openSync(LOCK_PATH, "wx");
      fs.writeFileSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      return () => { try { fs.unlinkSync(LOCK_PATH); } catch { } };
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") throw err;
      // Stale lock? Check the recorded pid.
      let pid = NaN;
      try { pid = parseInt(fs.readFileSync(LOCK_PATH, "utf8").trim(), 10); } catch { }
      if (pid && processAlive(pid)) {
        throw new Error(`Another pr-sync (pid ${pid}) is running. Lock: ${LOCK_PATH}`);
      }
      warn(`Removing stale lock at ${LOCK_PATH}`);
      try { fs.unlinkSync(LOCK_PATH); } catch { }
    }
  }
}
function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// ---------- gh ----------
type SearchKind = "author" | "reviewer" | "assignee" | "reviewed";
function listOpenPrs(repo: string, kind: SearchKind): GhPr[] {
  const search =
    kind === "author" ? "is:pr is:open author:@me -label:Stale"
      : kind === "reviewer" ? "is:pr is:open review-requested:@me -label:Stale -is:draft"
        : kind === "assignee" ? "is:pr is:open assignee:@me -label:Stale -is:draft"
          : /* reviewed */        "is:pr is:open reviewed-by:@me -author:@me -label:Stale -is:draft";
  const out = execOk("gh", [
    "pr", "list", "--repo", repo,
    "--search", search,
    "--limit", "200",
    "--json", "number,title,headRefName,isDraft,state,labels,headRepository,updatedAt",
  ]);
  const prs = JSON.parse(out) as GhPr[];
  vlog(`gh search [${repo} ${kind}] "${search}" → ${prs.length} match(es): ${prs.map(p => `#${p.number}`).join(", ") || "(none)"}`);
  return prs;
}
interface PrLookup {
  number: number;
  state: string;
  title: string;
  labels: { name: string }[];
  updatedAt: string;
}
function lookupPrByBranch(repo: string, branch: string): PrLookup | null {
  const r = exec("gh", [
    "pr", "list", "--repo", repo,
    "--head", branch,
    "--state", "all",
    "--limit", "5",
    "--json", "number,title,state,labels,updatedAt",
  ]);
  if (r.status !== 0 || !r.stdout) return null;
  let list: PrLookup[] = [];
  try { list = JSON.parse(r.stdout); } catch { return null; }
  if (!list.length) return null;
  // Prefer an OPEN PR if there are multiple (rare).
  const open = list.find(p => p.state === "OPEN");
  return open ?? list[0];
}
function hasStaleLabel(labels: { name: string }[] | undefined): boolean {
  return !!labels?.some(l => l.name === STALE_LABEL);
}

// ---------- cmux ----------
function listWorkspaces(): CmuxWs[] {
  const out = execOk("cmux", ["list-workspaces", "--json"]);
  const data = JSON.parse(out);
  return (data.workspaces ?? []).map((w: any) => ({
    ref: w.ref,
    title: w.title ?? "",
    current_directory: w.current_directory ?? null,
    custom_color: w.custom_color ?? null,
    description: w.description ?? null,
  }));
}
// Canonical workspace description: the PR URL. Identity is derived from parsing it.
function descriptionFor(repo: string, n: number): string {
  return `https://github.com/${repo}/pull/${n}`;
}
// Parse a workspace description back to its (repo, prNumber). Accepts the new
// URL form (canonical) and the legacy `pr-sync:<repo>#<n>` form for migration.
function parseMarker(desc: string | null): { repo: string; num: number } | null {
  if (!desc) return null;
  const url = /https?:\/\/github\.com\/([^\/\s]+\/[^\/\s]+)\/pull\/(\d+)/.exec(desc);
  if (url) return { repo: url[1], num: parseInt(url[2], 10) };
  const legacy = /^pr-sync:(.+)#(\d+)$/.exec(desc);
  if (legacy) return { repo: legacy[1], num: parseInt(legacy[2], 10) };
  return null;
}
function realpathOrSelf(p: string): string {
  try { return fs.realpathSync(p); } catch { return p; }
}
// True when a workspace's working directory lives inside this PR's worktree
// (exact match, or a subdirectory of it). The worktree path is 1:1 with the PR's
// branch, so this is a deterministic branch-identity check: any workspace cwd'd
// into the worktree IS this PR's workspace, regardless of how it was titled.
function cwdInWorktree(wsCwd: string | null, worktreePath: string): boolean {
  if (!wsCwd) return false;
  const a = realpathOrSelf(wsCwd);
  const b = realpathOrSelf(worktreePath);
  return a === b || a.startsWith(b + path.sep);
}
// Adoption order: worktree (branch) → PR-URL marker → state ref.
//
// The WORKTREE comes first because it's the only filesystem-grounded identity:
// every PR has a unique worktree (unique branch), and a workspace whose cwd is
// inside that worktree is unambiguously this PR's workspace. The marker and the
// cmux "workspace:N" ref are both corruptible — cmux recycles refs when you delete
// a workspace, and the old recycled-ref bug stamped PR markers onto the wrong
// workspaces. Worktree-first both avoids duplicates and self-heals those drifted
// markers (syncPr re-stamps the adopted workspace's description afterwards).
//
// `prevRef` is the last resort and is rejected if cmux has recycled it onto a
// workspace now carrying a *different* PR's marker.
function adoptWorkspace(
  workspaces: CmuxWs[],
  repoFull: string,
  prNumber: number,
  worktreePath: string,
  prevRef: string | null,
): CmuxWs | null {
  const tag = `${repoFull}#${prNumber}`;
  const claimedByOther = (w: CmuxWs): boolean => {
    const m = parseMarker(w.description);
    return m !== null && !(m.repo === repoFull && m.num === prNumber);
  };

  // A worktree can momentarily hold more than one workspace (e.g. a stray tombstone
  // from a closed PR whose cwd points here). Rank candidates so we pick THIS PR's own
  // workspace, then an unmarked/hand-made one, then any live one whose marker merely
  // drifted — only falling back to a foreign tombstone if it's the sole candidate (so
  // a single mismarked workspace still gets repaired).
  const inWt = workspaces.filter(w => cwdInWorktree(w.current_directory, worktreePath));
  const byWorktree =
    inWt.find(w => { const m = parseMarker(w.description); return m !== null && m.repo === repoFull && m.num === prNumber; }) ||
    inWt.find(w => parseMarker(w.description) === null) ||
    inWt.find(w => !isClosedTitle(w.title)) ||
    inWt[0] || null;
  if (byWorktree) {
    vlog(`adopt ${tag}: matched worktree cwd on ${byWorktree.ref} ("${byWorktree.title}")${inWt.length > 1 ? ` [${inWt.length} workspaces share this worktree]` : ""}`);
    return byWorktree;
  }

  const byMarker = workspaces.find(w => {
    const m = parseMarker(w.description);
    return m !== null && m.repo === repoFull && m.num === prNumber;
  });
  if (byMarker) { vlog(`adopt ${tag}: matched URL marker on ${byMarker.ref}`); return byMarker; }

  if (prevRef) {
    const known = workspaces.find(w => w.ref === prevRef);
    if (known && !claimedByOther(known)) { vlog(`adopt ${tag}: matched state ref ${prevRef}`); return known; }
    if (known) vlog(`adopt ${tag}: state ref ${prevRef} now carries another PR's marker — ignoring (cmux recycled the ref)`);
    else vlog(`adopt ${tag}: state ref ${prevRef} no longer exists`);
  }

  vlog(`adopt ${tag}: no existing workspace (no cwd in ${worktreePath}, marker, or valid state ref) — will create new`);
  return null;
}
function createWorkspace(name: string, cwd: string, color: string, description: string): string {
  if (DRY) { log(`(dry) new-workspace name="${name}" cwd=${cwd} color=${color} desc=${description}`); return "workspace:dry"; }
  // cmux new-workspace has no --color flag; color is applied via workspace-action set-color.
  const out = execOk("cmux", [
    "new-workspace",
    "--name", name,
    "--cwd", cwd,
    "--description", description,
    "--command", "'./scripts/setup-worktree.sh && pnnpm i'",
  ]);
  const m = out.match(/workspace:\d+/);
  if (!m) throw new Error(`Could not parse new-workspace output: ${out}`);
  const ref = m[0];
  setWorkspaceColor(ref, color);
  return ref;
}
function renameWorkspace(ref: string, title: string) {
  if (DRY) { log(`(dry) rename ${ref} → "${title}"`); return; }
  execOk("cmux", ["rename-workspace", "--workspace", ref, title]);
}
function setWorkspaceColor(ref: string, color: string) {
  if (DRY) { log(`(dry) set-color ${ref} ${color}`); return; }
  execOk("cmux", ["workspace-action", "--action", "set-color", "--workspace", ref, "--color", color]);
}
function clearWorkspaceColor(ref: string) {
  if (DRY) { log(`(dry) clear-color ${ref}`); return; }
  execOk("cmux", ["workspace-action", "--action", "clear-color", "--workspace", ref]);
}
function setWorkspaceDescription(ref: string, description: string) {
  if (DRY) { log(`(dry) set-description ${ref} → ${description}`); return; }
  execOk("cmux", ["workspace-action", "--action", "set-description", "--workspace", ref, "--description", description]);
}
function moveWorkspaceToIndex(ref: string, index: number) {
  if (DRY) { log(`(dry) reorder ${ref} → index ${index}`); return; }
  // Non-fatal: cmux recycles refs and may close a workspace mid-run (e.g. when its
  // worktree is removed during cleanup), so a ref can vanish between listing and
  // reordering. Reordering is cosmetic — never let it abort the run (and thus skip
  // saveState). Warn and continue.
  const r = exec("cmux", ["reorder-workspace", "--workspace", ref, "--index", String(index)]);
  if (r.status !== 0) vlog(`reorder ${ref} → index ${index} skipped: ${r.stderr?.trim()}`);
}
// Fully remove a single workspace. cmux has no single-workspace delete verb — only
// close-above/below/others — so we isolate the target at the top, then close-above
// its neighbour (which closes exactly the one workspace now above it). Heavily
// asserted: if move-top doesn't land it at index 0, or close doesn't remove exactly
// one, we abort without touching anything else. Returns true on confirmed removal.
function removeWorkspaceCompletely(ref: string): boolean {
  if (DRY) { log(`(dry) remove workspace ${ref} (move-top + close-above)`); return true; }
  execOk("cmux", ["workspace-action", "--action", "move-top", "--workspace", ref]);
  const list = listWorkspaces();
  if (list[0]?.ref !== ref) { warn(`ice: ${ref} did not move to top (top is ${list[0]?.ref ?? "none"}) — aborting removal`); return false; }
  const neighbour = list[1]?.ref;
  if (!neighbour) { warn(`ice: ${ref} is the only workspace — refusing to close-above`); return false; }
  const before = list.length;
  execOk("cmux", ["workspace-action", "--action", "close-above", "--workspace", neighbour]);
  const after = listWorkspaces();
  if (after.length !== before - 1 || after.some(w => w.ref === ref)) {
    warn(`ice: removing ${ref} closed ${before - after.length} workspace(s), expected 1 — check the sidebar`);
    return false;
  }
  return true;
}

// Sort managed workspaces (those with a recognized PR marker) into the leading slots
// of the sidebar, then park every unrelated workspace immediately below them.
// Managed order: active PRs first (most recently updated on GitHub), then stale/closed.
// Unrelated workspaces keep their existing relative order and start at index N (the
// count of managed workspaces) — so workspaces created outside the sync loop are
// pushed down, never overwritten or interleaved.
function reorderManagedWorkspaces(state: State, workspaces: CmuxWs[]) {
  const managed = workspaces
    .map(w => ({ w, key: parseMarker(w.description) }))
    .filter((x): x is { w: CmuxWs; key: { repo: string; num: number } } => x.key !== null);
  if (managed.length === 0) return;

  // Order: active PRs first (sorted by most recently updated on GitHub),
  // then stale/closed below (also sorted by most recently updated within).
  const groupOf = (k: { repo: string; num: number }): number => {
    const e = state.prs[`${k.repo}#${k.num}`];
    if (!e || e.status === "closed" || e.status === "stale") return 1;
    return 0;
  };
  const updatedTs = (k: { repo: string; num: number }): number => {
    const e = state.prs[`${k.repo}#${k.num}`];
    const t = e?.pr_updated_at ? Date.parse(e.pr_updated_at) : 0;
    return Number.isNaN(t) ? 0 : t;
  };
  managed.sort((a, b) => {
    const ga = groupOf(a.key), gb = groupOf(b.key);
    if (ga !== gb) return ga - gb;
    const diff = updatedTs(b.key) - updatedTs(a.key);   // desc
    if (diff !== 0) return diff;
    // Tie-break for stability: repo asc, then PR number desc.
    if (a.key.repo !== b.key.repo) return a.key.repo.localeCompare(b.key.repo);
    return b.key.num - a.key.num;
  });

  // Unrelated workspaces: everything without a PR marker, in their current order.
  const managedRefs = new Set(managed.map(x => x.w.ref));
  const unrelated = workspaces.filter(w => !managedRefs.has(w.ref));

  // Apply one absolute placement per workspace in target-index order: managed
  // block (0…N-1) followed by the unrelated block (N…M-1). Placing in ascending
  // index order means each move never disturbs an already-placed lower slot.
  const ordered = [...managed.map(x => x.w), ...unrelated];
  ordered.forEach((w, i) => moveWorkspaceToIndex(w.ref, i));
}

// ---------- worktrunk ----------
function wtList(repoPath: string): WtEntry[] {
  // wt emits diagnostic chatter on stderr for stale worktrees; stdout JSON is fine.
  const r = exec("wt", ["list", "--format", "json"], { cwd: repoPath });
  if (!r.stdout) return [];
  try { return JSON.parse(r.stdout) as WtEntry[]; } catch { return []; }
}
// --full includes CI status; cache per repo per run.
const wtFullCache = new Map<string, WtEntry[]>();
function wtListFull(repoPath: string, refresh = false): WtEntry[] {
  if (!refresh && wtFullCache.has(repoPath)) return wtFullCache.get(repoPath)!;
  const r = exec("wt", ["list", "--full", "--format=json"], { cwd: repoPath });
  let entries: WtEntry[] = [];
  if (r.stdout) { try { entries = JSON.parse(r.stdout) as WtEntry[]; } catch { entries = []; } }
  wtFullCache.set(repoPath, entries);
  return entries;
}
function invalidateWtFull(repoPath: string) { wtFullCache.delete(repoPath); }
function ciStatusFor(repoPath: string, branch: string): string {
  const entries = wtListFull(repoPath);
  return entries.find(w => w.branch === branch)?.ci?.status ?? "no-ci";
}
function isDirty(w: WtEntry): boolean {
  const t = w.working_tree;
  if (!t) return false;
  return t.staged || t.modified || t.untracked || t.renamed || t.deleted;
}
function wtSwitchPr(repoPath: string, prNumber: number): { path: string; branch: string } | null {
  if (DRY) { log(`(dry) wt switch pr:${prNumber}`); return null; }
  const before = new Set(wtList(repoPath).map(w => w.path));
  const r = exec("wt", ["switch", `pr:${prNumber}`, "--no-cd", "--format", "json"], { cwd: repoPath });
  if (r.status !== 0) {
    warn(`wt switch pr:${prNumber} failed: ${r.stderr.trim()}`);
    return null;
  }
  // Try to parse structured output first.
  try {
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    const p = (parsed.worktree_path ?? parsed.path) as string | undefined;
    const b = (parsed.branch ?? parsed.branch_name) as string | undefined;
    if (p) return { path: p, branch: b ?? "" };
  } catch { /* fall through to discovery */ }
  // Fallback: discover the newly-created entry by diffing wt list.
  const after = wtList(repoPath);
  const created = after.find(w => !before.has(w.path) && !w.is_main);
  if (created) return { path: created.path, branch: created.branch };
  return null;
}
function wtRemove(repoPath: string, branch: string): boolean {
  if (DRY) { log(`(dry) wt remove ${branch}`); return true; }
  const r = exec("wt", ["remove", branch, "--foreground"], { cwd: repoPath });
  if (r.status !== 0) {
    warn(`wt remove ${branch} failed: ${r.stderr.trim()}`);
    return false;
  }
  return true;
}

// ---------- .env.local ----------
function writeThemeColor(worktreePath: string, color: string) {
  const file = path.join(worktreePath, ".env.local");
  let body = "";
  try { body = fs.readFileSync(file, "utf8"); } catch { /* missing file is fine */ }
  const line = `THEME_COLOR=${color}`;
  let updated: string;
  if (/^THEME_COLOR=.*/m.test(body)) {
    updated = body.replace(/^THEME_COLOR=.*$/m, line);
  } else if (body.length === 0) {
    updated = `${line}\n`;
  } else {
    updated = body.endsWith("\n") ? `${body}${line}\n` : `${body}\n${line}\n`;
  }
  if (updated === body) return;
  if (DRY) { log(`(dry) write ${line} → ${file}`); return; }
  fs.writeFileSync(file, updated);
}

// ---------- color picker ----------
function gatherUsedColors(state: State, workspaces: CmuxWs[]): Set<string> {
  const used = new Set<string>();
  for (const w of workspaces) if (w.custom_color) used.add(w.custom_color.toLowerCase());
  for (const p of Object.values(state.prs)) if (p.status === "active") used.add(p.color.toLowerCase());
  used.add(REVIEWER_COLOR.toLowerCase());   // never draw reviewer color from author pool
  return used;
}
function pickAuthorColor(used: Set<string>): string {
  const free = PALETTE.find(c => !used.has(c.toLowerCase()));
  if (free) return free;
  // Exhausted: any palette color (duplicates allowed, per design).
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

// ---------- truncate ----------
function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function ciEmojiFor(status: string): string {
  return CI_EMOJI[status] ?? CI_EMOJI_DEFAULT;
}
// Reads `<worktree>/.runn/project.env` to find COMPOSE_PROJECT_NAME, then
// queries `docker compose -p <name> ps -q --status running`. Read-only — does
// not allocate ports or otherwise mutate the worktree. Returns null for repos
// that don't have a docker-compose project (e.g. runn-cli).
function containerStatusEmoji(repoFull: string, worktreePath: string): string | null {
  if (repoFull !== "Runn-Fast/runn") return null;
  const envPath = path.join(worktreePath, ".runn/project.env");
  if (!fs.existsSync(envPath)) return CONTAINER_STOPPED_EMOJI;
  const m = /^COMPOSE_PROJECT_NAME=(.+)$/m.exec(fs.readFileSync(envPath, "utf8"));
  if (!m) return CONTAINER_STOPPED_EMOJI;
  const r = exec("docker", ["compose", "-p", m[1].trim(), "ps", "-q", "--status", "running"]);
  if (r.status !== 0) return CONTAINER_STOPPED_EMOJI;
  return r.stdout.trim() ? CONTAINER_RUNNING_EMOJI : CONTAINER_STOPPED_EMOJI;
}
function buildTitle(repoFull: string, worktreePath: string, prTitle: string): string {
  const truncated = truncate(prTitle, TITLE_MAX);
  const container = containerStatusEmoji(repoFull, worktreePath);
  if (container) return `${container} ${truncated}`;
  if (repoFull === "Runn-Fast/runn-cli") return `${CLI_EMOJI} ${truncated}`;
  return truncated;
}
// Active PR description: "<ci-emoji> [👀 ]<github-url>" — reviewer emoji only;
// gitflow type emojis removed (not useful enough). parseMarker is regex-unanchored
// so prefix tokens don't confuse adoption.
function buildDescription(role: Role, repoFull: string, prNumber: number, ciStatus: string): string {
  const ci = ciEmojiFor(ciStatus);
  const url = descriptionFor(repoFull, prNumber);
  return role === "reviewer" ? `${ci} ${REVIEWER_EMOJI} ${url}` : `${ci} ${url}`;
}
function buildClosedTitle(prTitle: string): string {
  return `${CLOSED_EMOJI} ${truncate(prTitle, TITLE_MAX)}`;
}
function isClosedTitle(t: string): boolean {
  return t.startsWith(`${CLOSED_EMOJI} `) || t.startsWith("CLOSED ");
}
function buildStaleTitle(prTitle: string): string {
  return `${STALE_EMOJI} ${truncate(prTitle, TITLE_MAX)}`;
}
function isStaleTitle(t: string): boolean {
  return t.startsWith(`${STALE_EMOJI} `);
}

// ---------- sync one PR ----------
function syncPr(
  repo: { full: string; path: string },
  pr: GhPr,
  role: Role,
  state: State,
  workspaces: CmuxWs[],
) {
  const key = `${repo.full}#${pr.number}`;
  const existing = state.prs[key];
  vlog(`syncPr ${key} role=${role} branch=${pr.headRefName} draft=${pr.isDraft} prev=${existing ? existing.status : "none"}`);

  // Hard rule: never resurrect a PR we've already marked closed. cmux/search lag
  // can make a just-merged PR briefly reappear in an `is:open` search; without this
  // guard adoptWorkspace finds nothing (the 🪦 workspace was deleted) and creates a
  // fresh active workspace for a dead PR. If a PR is genuinely re-opened, delete its
  // entry from state.json to let it sync again.
  if (existing?.status === "closed") {
    log(`Skipping ${key}: marked closed in state — not recreating (delete its state.json entry to re-enable).`);
    return;
  }

  // 1. Worktree
  let wtEntries = wtList(repo.path);
  let preExisting = wtEntries.find(w => w.branch === pr.headRefName) ?? null;
  let wtPath: string;
  let wtBranch: string;

  if (preExisting) {
    wtPath = preExisting.path;
    wtBranch = preExisting.branch;
    vlog(`worktree exists for ${pr.headRefName} at ${wtPath}`);
  } else if (existing && fs.existsSync(existing.worktree_path)) {
    wtPath = existing.worktree_path;
    wtBranch = existing.branch;
    vlog(`worktree from state exists at ${wtPath}`);
  } else {
    log(`Creating worktree for ${repo.full}#${pr.number} (${pr.headRefName})`);
    const created = wtSwitchPr(repo.path, pr.number);
    if (!created) { warn(`could not create worktree for #${pr.number}; skipping`); return; }
    wtPath = created.path || "";
    wtBranch = created.branch || pr.headRefName;
    if (!wtPath) {
      // last-ditch: rescan
      const after = wtList(repo.path);
      const found = after.find(w => w.branch === wtBranch || w.branch === pr.headRefName);
      if (found) { wtPath = found.path; wtBranch = found.branch; }
    }
    if (!wtPath) { warn(`worktree path unresolved for #${pr.number}; skipping`); return; }
  }

  // 2. Color
  const used = gatherUsedColors(state, workspaces);
  let color: string;
  if (role === "reviewer") {
    color = REVIEWER_COLOR;
  } else if (existing?.color && PALETTE.includes(existing.color)) {
    color = existing.color;  // sticky: keep what this PR already had
  } else {
    color = pickAuthorColor(used);
  }

  // 3. THEME_COLOR
  writeThemeColor(wtPath, color);

  // 4. Workspace — state ref → matching marker → cwd+auto-title bootstrap → create.
  // Stale label is the only stale trigger (listOpenPrs filters -label:Stale anyway,
  // so a Stale-labelled PR shouldn't reach syncPr; if it does — e.g. labelled mid-run
  // — we still demote it cleanly here.)
  invalidateWtFull(repo.path);   // ensure the just-created worktree appears in --full
  const ciStatus = ciStatusFor(repo.path, wtBranch);
  const isStale = hasStaleLabel(pr.labels);
  const title = isStale ? buildStaleTitle(pr.title) : buildTitle(repo.full, wtPath, pr.title);
  const effectiveColor = isStale ? null : color;
  const description = isStale ? descriptionFor(repo.full, pr.number) : buildDescription(role, repo.full, pr.number, ciStatus);
  // Adopt-by-worktree means we may land on a workspace whose title/marker drifted
  // (even a stale 🪦 from an unrelated PR's closure). That's fine — the PR is open,
  // so we MERGE into it: the rename/description writes below re-stamp it correctly.
  // We never delete a workspace; "never resurrect closed" is enforced by the
  // state-status guard at the top of syncPr, not by the live (corruptible) title.
  const ws = adoptWorkspace(workspaces, repo.full, pr.number, wtPath, existing?.workspace_ref ?? null);

  let wsRef: string;
  if (ws) {
    if (ws.title !== title) renameWorkspace(ws.ref, title);
    if (effectiveColor) {
      if ((ws.custom_color?.toLowerCase() ?? "") !== effectiveColor.toLowerCase()) setWorkspaceColor(ws.ref, effectiveColor);
    } else if (ws.custom_color) {
      clearWorkspaceColor(ws.ref);
    }
    if (ws.description !== description) setWorkspaceDescription(ws.ref, description);
    wsRef = ws.ref;
    ws.title = title;
    ws.custom_color = effectiveColor;
    ws.description = description;
  } else {
    log(`Creating workspace for #${pr.number}: "${title}"`);
    wsRef = createWorkspace(title, wtPath, color, description);
    if (!effectiveColor) clearWorkspaceColor(wsRef);
    workspaces.push({ ref: wsRef, title, current_directory: wtPath, custom_color: effectiveColor, description });
  }

  // 5. State — preserve `color` (used to restore palette color when un-staled).
  state.prs[key] = {
    repo: repo.full,
    number: pr.number,
    role,
    branch: wtBranch,
    worktree_path: wtPath,
    workspace_ref: wsRef,
    color,
    title: pr.title,
    status: isStale ? "stale" : "active",
    updated_at: new Date().toISOString(),
    pr_updated_at: pr.updatedAt,
  };
}

// ---------- cleanup ----------
// Resolve the workspace that genuinely belongs to this PR for tombstoning. Cleanup
// must NOT trust the tracked cmux ref: a closed PR's worktree is gone, and cmux
// recycles "workspace:N" refs, so a stale ref can point at a *different* (live) PR's
// workspace — tombstoning that would clobber an unrelated PR. The PR-URL marker is
// the only reliable identity here. If no workspace carries this PR's marker, there's
// nothing to tombstone (it was deleted/recycled) — leave everything alone.
function findMarkedWorkspace(workspaces: CmuxWs[], repoFull: string, prNumber: number): CmuxWs | null {
  return workspaces.find(w => {
    const m = parseMarker(w.description);
    return m !== null && m.repo === repoFull && m.num === prNumber;
  }) ?? null;
}
function staleWorkspace(state: State, workspaces: CmuxWs[], repoFull: string, prNumber: number) {
  const key = `${repoFull}#${prNumber}`;
  const ws = findMarkedWorkspace(workspaces, repoFull, prNumber);
  if (ws) {
    const rawTitle = state.prs[key]?.title ?? ws.title.replace(/^\S+\s+\S+\s+/, "");
    const stale = buildStaleTitle(rawTitle);
    if (!isStaleTitle(ws.title)) renameWorkspace(ws.ref, stale);
    if (ws.custom_color) clearWorkspaceColor(ws.ref);
    const desc = descriptionFor(repoFull, prNumber);
    if (ws.description !== desc) setWorkspaceDescription(ws.ref, desc);
    ws.title = stale;
    ws.description = desc;
    ws.custom_color = null;
  }
  if (state.prs[key]) {
    state.prs[key].status = "stale";
    state.prs[key].updated_at = new Date().toISOString();
  }
}

function closeWorkspace(state: State, workspaces: CmuxWs[], repoFull: string, prNumber: number) {
  const key = `${repoFull}#${prNumber}`;
  const ws = findMarkedWorkspace(workspaces, repoFull, prNumber);
  if (ws) {
    // Use the raw PR title from state if we have it, else strip any existing
    // CI/role emoji prefix from the live title before adding the 🪦 prefix.
    const rawTitle = state.prs[key]?.title ?? ws.title.replace(/^\S+\s+\S+\s+/, "");
    const closed = buildClosedTitle(rawTitle);
    if (!isClosedTitle(ws.title)) renameWorkspace(ws.ref, closed);
    if (ws.custom_color) clearWorkspaceColor(ws.ref);
    // Normalize description to canonical URL form (migrates legacy `pr-sync:` markers).
    const desc = descriptionFor(repoFull, prNumber);
    if (ws.description !== desc) setWorkspaceDescription(ws.ref, desc);
    ws.title = closed;
    ws.description = desc;
  }
  if (state.prs[key]) {
    state.prs[key].status = "closed";
    state.prs[key].updated_at = new Date().toISOString();
  }
}

function cleanup(state: State, workspaces: CmuxWs[]) {
  // Track which (repo,pr) keys we've already handled so the second pass doesn't duplicate work.
  const handled = new Set<string>();

  // Pass A — walk worktrees: act on any whose PR is closed/merged or Stale-labelled.
  for (const repo of REPOS) {
    const entries = wtList(repo.path);
    for (const w of entries) {
      if (w.is_main) continue;
      const pr = lookupPrByBranch(repo.full, w.branch);
      if (!pr) { vlog(`no PR for ${w.branch} → leaving`); continue; }
      const key = `${repo.full}#${pr.number}`;
      if (state.prs[key] && pr.updatedAt) state.prs[key].pr_updated_at = pr.updatedAt;

      if (pr.state === "OPEN") {
        if (hasStaleLabel(pr.labels)) {
          log(`PR ${key} (${w.branch}) is Stale-labelled — flagging workspace 🚫`);
          staleWorkspace(state, workspaces, repo.full, pr.number);
          handled.add(key);
        }
        continue;
      }

      if (isDirty(w)) {
        warn(`Dirty worktree for closed PR #${pr.number} (${w.branch}) at ${w.path} — skipping delete.`);
        continue;
      }
      log(`Removing worktree for closed PR #${pr.number} (${w.branch})`);
      if (!wtRemove(repo.path, w.branch)) continue;

      closeWorkspace(state, workspaces, repo.full, pr.number);
      handled.add(key);
    }
  }

  // Pass B — walk state.prs entries that aren't already closed: catch PRs whose
  // worktree was deleted externally (e.g. merge auto-cleaned the dir) or whose
  // Stale label was applied without an entry in our worktree walk.
  for (const [key, entry] of Object.entries(state.prs)) {
    if (handled.has(key)) continue;
    if (entry.status === "closed") {
      // Self-heal: a prior closeWorkspace() may have set status="closed" without
      // actually tombstoning the workspace. Retry ONLY if a workspace carrying this
      // PR's own marker is still live — resolved by marker, never by the tracked ref
      // (which cmux may have recycled onto a different, live PR's workspace).
      const ws = findMarkedWorkspace(workspaces, entry.repo, entry.number);
      if (ws && !isClosedTitle(ws.title)) {
        log(`PR ${key} marked closed but workspace title is live — retrying tombstone`);
        closeWorkspace(state, workspaces, entry.repo, entry.number);
      }
      continue;
    }
    const r = exec("gh", [
      "pr", "view", String(entry.number),
      "--repo", entry.repo,
      "--json", "state,labels,updatedAt",
    ]);
    if (r.status !== 0) { vlog(`gh pr view ${key} failed: ${r.stderr.trim()}`); continue; }
    let view: { state: string; labels: { name: string }[]; updatedAt: string };
    try { view = JSON.parse(r.stdout); } catch { continue; }
    if (view.updatedAt) entry.pr_updated_at = view.updatedAt;
    if (view.state !== "OPEN") {
      log(`PR ${key} is ${view.state} (worktree already gone) — closing workspace`);
      closeWorkspace(state, workspaces, entry.repo, entry.number);
      continue;
    }
    if (hasStaleLabel(view.labels) && entry.status !== "stale") {
      log(`PR ${key} is Stale-labelled — flagging workspace 🚫`);
      staleWorkspace(state, workspaces, entry.repo, entry.number);
    }
  }
}

// ---------- refresh-container subcommand ----------
function refreshContainerIndicator(targetPath: string) {
  let resolved: string;
  try { resolved = fs.realpathSync(targetPath); }
  catch { console.error(`[pr-sync] refresh: ${targetPath} does not exist`); process.exit(1); }

  const state = loadState();
  const entry = Object.values(state.prs).find(p => {
    try { return fs.realpathSync(p.worktree_path) === resolved; }
    catch { return false; }
  });
  if (!entry) { console.error(`[pr-sync] refresh: no PR for ${resolved}`); process.exit(1); }
  if (entry.status !== "active") { vlog(`refresh: PR is ${entry.status} — leaving title alone`); return; }

  const workspaces = listWorkspaces();
  const ws = workspaces.find(w => w.ref === entry.workspace_ref);
  if (!ws) { console.error(`[pr-sync] refresh: workspace ${entry.workspace_ref} not found`); process.exit(1); }

  const newTitle = buildTitle(entry.repo, entry.worktree_path, entry.title);
  if (ws.title === newTitle) { vlog(`refresh: title already up to date (${ws.title})`); return; }
  log(`refresh: "${ws.title}" → "${newTitle}"`);
  renameWorkspace(ws.ref, newTitle);
}

// ---------- ice subcommand ----------
// Resolve a `<repo>#<n>` key from a filesystem path by matching it against tracked
// worktrees (exact dir or a subdirectory of one).
function resolvePrKeyFromPath(targetPath: string, state: State): string | null {
  let resolved: string;
  try { resolved = fs.realpathSync(targetPath); } catch { return null; }
  for (const p of Object.values(state.prs)) {
    let wt: string;
    try { wt = fs.realpathSync(p.worktree_path); } catch { continue; }
    if (resolved === wt || resolved.startsWith(wt + path.sep)) return `${p.repo}#${p.number}`;
  }
  return null;
}
const PR_KEY_RE = /^[^#\s]+\/[^#\s]+#\d+$/;   // e.g. Runn-Fast/runn#20016
// `pr-sync --ice [<repo>#<n>|<path>]` parks a PR (default: the worktree at cwd);
// `--unice` brings it back. Iced PRs are skipped by sync and their workspace removed;
// the worktree is preserved so the work resumes on un-ice.
function iceCommand(target: string, unice: boolean) {
  const release = acquireLock();
  try {
    const state = loadState();
    const key = PR_KEY_RE.test(target) ? target : resolvePrKeyFromPath(target, state);
    if (!key) {
      console.error(`[pr-sync] ${unice ? "unice" : "ice"}: could not resolve a PR from "${target}". Pass an explicit <repo>#<n>, e.g. Runn-Fast/runn#20016.`);
      process.exit(1);
    }
    const iced = loadIced();
    if (unice) {
      if (iced.delete(key)) { saveIced(iced); log(`Un-iced ${key} — it'll reappear on the next sync.`); }
      else log(`${key} was not on ice.`);
      return;
    }
    iced.add(key);
    saveIced(iced);
    log(`Iced ${key} (still draft on GitHub; worktree kept).`);
    const hash = key.lastIndexOf("#");
    const repo = key.slice(0, hash), num = parseInt(key.slice(hash + 1), 10);
    const ws = findMarkedWorkspace(listWorkspaces(), repo, num);
    if (ws) { if (removeWorkspaceCompletely(ws.ref)) log(`Removed workspace ${ws.ref}.`); }
    else vlog(`No live workspace for ${key} to remove.`);
  } finally {
    release();
  }
}
// Reconcile: ensure no on-ice PR still has a workspace (e.g. one was re-created
// manually, or a prior removal was aborted). Returns true if anything was removed.
function enforceIced(iced: Set<string>, workspaces: CmuxWs[]): boolean {
  let removed = false;
  for (const key of iced) {
    const hash = key.lastIndexOf("#");
    if (hash < 0) continue;
    const ws = findMarkedWorkspace(workspaces, key.slice(0, hash), parseInt(key.slice(hash + 1), 10));
    if (ws) {
      log(`On-ice ${key} still has workspace ${ws.ref} — removing it.`);
      if (removeWorkspaceCompletely(ws.ref)) removed = true;
    }
  }
  return removed;
}

// ---------- main ----------
function main() {
  const release = acquireLock();
  try {
    const state = loadState();
    const workspaces = listWorkspaces();
    const iced = loadIced();
    if (iced.size) vlog(`On ice (skipped): ${[...iced].join(", ")}`);

    for (const repo of REPOS) {
      log(`Scanning ${repo.full} …`);
      const authorPrs = listOpenPrs(repo.full, "author");
      const reviewerPrs = listOpenPrs(repo.full, "reviewer");
      const assigneePrs = listOpenPrs(repo.full, "assignee");
      const reviewedPrs = listOpenPrs(repo.full, "reviewed");
      vlog(`  ${authorPrs.length} author, ${reviewerPrs.length} reviewer, ${assigneePrs.length} assignee, ${reviewedPrs.length} reviewed PR(s)`);

      // Keys synced so far this pass — used to dedup the reviewer-style queries
      // (reviewer / assignee / reviewed) against each other and against author.
      const seen = new Set<string>();

      for (const pr of authorPrs) {
        const key = `${repo.full}#${pr.number}`;
        seen.add(key);
        if (iced.has(key)) { vlog(`skip ${key}: on ice`); continue; }
        try { syncPr(repo, pr, "author", state, workspaces); }
        catch (e) { warn(`sync ${key} failed: ${(e as Error).message}`); }
      }
      // Reviewer-style queries, in priority order. A PR matching several only syncs
      // once, under whichever query reaches it first (and keeps an existing author role).
      const reviewerStyle: { kind: SearchKind; prs: GhPr[] }[] = [
        { kind: "reviewer", prs: reviewerPrs },   // review formally requested from me
        { kind: "assignee", prs: assigneePrs },   // assigned to me
        { kind: "reviewed", prs: reviewedPrs },   // I've already submitted a review
      ];
      for (const { kind, prs } of reviewerStyle) {
        for (const pr of prs) {
          const key = `${repo.full}#${pr.number}`;
          if (iced.has(key)) { vlog(`skip ${kind} ${key}: on ice`); continue; }
          if (state.prs[key]?.role === "author") { vlog(`skip ${kind} ${key}: tracked as author`); continue; }
          if (seen.has(key)) { vlog(`skip ${kind} ${key}: already synced this pass`); continue; }
          seen.add(key);
          try { syncPr(repo, pr, "reviewer", state, workspaces); }
          catch (e) { warn(`sync ${key} failed: ${(e as Error).message}`); }
        }
      }
    }

    log("Cleaning up closed PRs …");
    cleanup(state, workspaces);

    // Make sure nothing on ice still shows a workspace.
    enforceIced(iced, workspaces);

    // Reorder against a FRESH snapshot: sync + cleanup (worktree removals) and the
    // ice pass all mutate cmux and recycle refs, so the cached `workspaces` array has
    // drifted and may name workspaces that no longer exist.
    log("Reordering managed workspaces to top of sidebar …");
    reorderManagedWorkspaces(state, listWorkspaces());

    saveState(state);
    log(DRY ? "Done (dry-run, no changes written)." : "Done.");
  } finally {
    release();
  }
}

// The target (a path or <repo>#<n>) is the sole positional arg — i.e. the first one
// that isn't a flag — so it can appear anywhere relative to --dry-run/-v.
const argTarget = (): string => ARGS.find(a => !a.startsWith("-")) ?? process.cwd();
if (ARGS.includes("--unice")) {
  iceCommand(argTarget(), true);
} else if (ARGS.includes("--ice")) {
  iceCommand(argTarget(), false);
} else if (ARGS.includes("--refresh-container")) {
  refreshContainerIndicator(argTarget());
} else {
  main();
}
