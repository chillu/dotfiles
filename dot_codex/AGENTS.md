# Global agent instructions

Shared by Claude Code (imported from `~/.claude/CLAUDE.md`), Codex and Gemini CLI (`~/.gemini/GEMINI.md` symlinks here). Managed by chezmoi.

## Pull requests

- Always open pull requests as drafts (`gh pr create --draft`). Never mark a PR ready for review; the user does that.

<!-- >>> heroku-guard >>> -->
<!-- Managed by heroku-guard's install.sh, which rewrites this block. Remove it with ./install.sh --uninstall. -->
## Heroku (heroku-guard)

- The Heroku teams 'runn' and 'runn-internal' are production. The only non-production team is 'runn-testing'. Review apps (`runn-pr-<n>-*`) and `runn-staging-us-*` are in 'runn-testing'. `heroku` is heroku-guard's wrapper, which only runs with a non-production login. `heroku-prod` is the production CLI, for humans in their own terminal only.
- Never touch Heroku production: no commands against apps in 'runn' and 'runn-internal' or any app outside 'runn-testing', no `heroku-prod`, and no direct calls to the Heroku Platform API (api.heroku.com). Production operations are for the user to run in their own terminal, so stop and hand them over.
- Never read, print, copy, store or set Heroku API tokens or credentials: `HEROKU_API_KEY`, `heroku auth:token`, `heroku authorizations`, the `heroku-cli` macOS keychain entry, Heroku entries in ~/.netrc, or Heroku items in 1Password (`op read`, `op item get`). Use the Heroku CLI's existing non-production login as it is.
- Name the app in every Heroku command with `--app <full app name>`. heroku-guard refuses commands that leave the CLI to pick an app from the git remote or `$HEROKU_APP`.
- In Codex, heroku-guard refuses SQL (`heroku pg:psql`), one-off dynos (`heroku run`) and destructive commands even on non-production apps, because Codex hooks can't ask for approval. Give the user the exact command to run in their own terminal.
- When heroku-guard's hook, rules or `heroku` wrapper refuses a Heroku command, don't work around it with a script, a variable, another binary, a different login or the Platform API. Stop and tell the user.
<!-- <<< heroku-guard <<< -->
