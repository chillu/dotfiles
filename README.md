# Dotfiles

Managed with [chezmoi](https://www.chezmoi.io/).

## What's in here

- Shell: `.zshrc`, `.zprofile`
- Editor: Neovim config (`.config/nvim`) — LazyVim-based
- Terminal multiplexer: cmux config (`.config/cmux`)
- Git: `.gitconfig` (templated for per-machine email)

## Mac App Configs (mackup)

Mac apps store configs in `~/Library/Application Support` and `~/.config`. These are synced via **mackup** to **iCloud**:

- ghostty
- lazygit
- lazydocker
- vscode
- sublime-text
- opencode (custom config excludes `auth.json` — tokens stay local)

Mackup config is managed by chezmoi (`.mackup.cfg` and `.mackup/opencode.cfg`).

### Setup on a new machine

```bash
# Install mackup
brew install mackup

# The .mackup.cfg is already deployed by chezmoi
# It uses iCloud and only syncs the apps listed above

# Restore app configs from iCloud
mackup restore
```

### How it works

Mackup copies configs to `~/Library/Mobile Documents/com~apple~CloudDocs/Mackup/`.
To add an app to the sync list:

1. Check if it's supported: `mackup list`
2. Add the name to `.mackup.cfg` under `[applications_to_sync]`
3. Run `chezmoi re-add ~/.mackup.cfg && chezmoi cd && git commit && git push`
4. Run `mackup backup` on your main machine
5. Run `mackup restore` on other machines

## What's NOT in here

- **SSH config** — machine-specific and potentially sensitive
- **lazy-lock.json** — causes merge conflicts, regenerated on sync
- **Mac app configs** (lazygit, Ghostty, VS Code, etc.) — these live in `~/Library/Application Support` and are synced separately via [mackup](https://github.com/lra/mackup) to iCloud

## Setup on a new machine

```bash
# Install chezmoi
brew install chezmoi

# Initialize from this repo
chezmoi init https://github.com/chillu/dotfiles.git

# Before applying, set your machine-specific data:
# Edit ~/.config/chezmoi/chezmoi.toml and add:
# [data]
# email = "your-email@example.com"

# Apply the dotfiles
chezmoi apply
```

## Usage

```bash
chezmoi edit ~/.zshrc     # Edit source file
chezmoi diff               # See what would change
chezmoi apply              # Apply changes
chezmoi cd                 # Jump to source directory
```
