# Global agent instructions

Shared by Claude Code (imported from `~/.claude/CLAUDE.md`), Codex and Gemini CLI (`~/.gemini/GEMINI.md` symlinks here). Managed by chezmoi.

## Pull requests

- Always open pull requests as drafts (`gh pr create --draft`). Never mark a PR ready for review; the user does that.

## Links in chat output

- Link every pull request and Linear issue you mention to the user, e.g. `[SEC-716](https://linear.app/runn/issue/SEC-716)`.
- In those chat links, point PRs at Linear's review page by swapping `github.com` for `linear.review`: `https://linear.review/owner/repo/pull/123`. Everything written for others (commands, commits, PR descriptions) keeps `github.com`.
- Name every file by its repo-relative path, e.g. `app/javascript/src/common/Button.tsx` rather than `Button.tsx`, in reviews, summaries and plans alike. The full path makes the name a clickable link in the terminal and pins down which file you mean.

<!-- >>> heroku-guard >>> -->
<!-- Managed by heroku-guard's install.sh, which rewrites this block. Remove it with ./install.sh --uninstall. -->
## Heroku (heroku-guard)

- The Heroku teams 'runn' and 'runn-internal' are production. The only non-production team is 'runn-testing'. Review apps (`runn-pr-<n>-*`) and `runn-staging-us-*` are in 'runn-testing'. `heroku` is heroku-guard's wrapper, which only runs with a non-production login. `heroku-prod` is the production CLI, for humans in their own terminal only.
- Never touch Heroku production: no commands against apps in 'runn' and 'runn-internal' or any app outside 'runn-testing', no `heroku-prod`, and no direct calls to the Heroku Platform API (api.heroku.com). Production operations are for the user to run in their own terminal, so stop and hand them over.
- Never read, print, copy, store or set Heroku API tokens or credentials: the value of `HEROKU_API_KEY`, `heroku auth:token`, `heroku authorizations`, the `heroku-cli` macOS keychain entry, Heroku entries in ~/.netrc, or Heroku items in 1Password (`op read`, `op item get`). Searching or editing code, CI config and docs that mention these is fine. Use the Heroku CLI's existing non-production login as it is.
- Name the app in every Heroku command with `--app <full app name>`, rather than leaving the CLI to pick one from the git remote or `$HEROKU_APP`.
- heroku-guard's rules ask for approval before SQL (`heroku pg:psql`), one-off dynos (`heroku run`) and destructive commands, even on non-production apps. If they can't be approved in this session, give the user the exact command to run in their own terminal.
- When heroku-guard's rules or `heroku` wrapper refuse a Heroku command, don't work around it with a script, a variable, another binary, a different login or the Platform API. Stop and tell the user.
- heroku-guard's own source is in /Users/ingo/Projects/heroku-guard. Reading, searching, editing and testing it is ordinary development work: the checkout holds no tokens, and its tests (`tests/*.test.sh`) run against stub `heroku`, `security` and `op` commands. Knowing how a check works doesn't change what it refuses: a refused command still means stop and tell the user.
<!-- <<< heroku-guard <<< -->
