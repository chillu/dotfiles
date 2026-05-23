# Dotfiles

Managed with [chezmoi](https://www.chezmoi.io/).

## What's in here

- Shell: `.zshrc`, `.zprofile`
- Editor: Neovim config (`.config/nvim`) — LazyVim-based
- Terminal multiplexer: cmux config (`.config/cmux`)
- Git: `.gitconfig` (templated for per-machine email)

## What's NOT in here

- **SSH config** — machine-specific and potentially sensitive
- **lazy-lock.json** — causes merge conflicts, regenerated on sync
- **Mac app configs** (lazygit, Ghostty, VS Code, etc.) — these live in `~/Library/Application Support` and are synced separately via [mackup](https://github.com/lra/mackup)

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
