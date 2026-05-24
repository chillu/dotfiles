# Dotfiles

Managed with [chezmoi](https://www.chezmoi.io/).

## Philosophy

**Everything is manual.** `chezmoi apply`, `mackup backup`, and `mackup restore` are run by hand after reviewing diffs. This mitigates supply chain risk — these tools have full access to your home directory, and running them automatically on every shell startup or dotfiles sync would silently apply any compromised changes from upstream.

Homebrew bottles are [cryptographically signed and verified](https://github.com/Homebrew/brew/issues/21421) by default, so no custom wrappers are needed there.

## What's in here

- Shell: `.zshrc`, `.zprofile`
- Editor: Neovim config (`.config/nvim`) — LazyVim-based
- Terminal multiplexer: cmux config (`.config/cmux`)
- Git: `.gitconfig` (templated for per-machine email)
- `Brewfile` — intentionally installed formulae and casks (templated; work-only packages excluded on personal machines)

## What's NOT in here

- **SSH config** — machine-specific and potentially sensitive
- **lazy-lock.json** — causes merge conflicts, regenerated on sync
- **Mac app configs** (lazygit, Ghostty, VS Code, etc.) — these live in `~/Library/Application Support` and are synced separately via [mackup](https://github.com/lra/mackup) to iCloud
- **Auto-install scripts** — nothing runs automatically on `chezmoi apply`

## Setup on a new machine

```bash
# 1. Install chezmoi
brew install chezmoi

# 2. Clone dotfiles
chezmoi init https://github.com/chillu/dotfiles.git

# 3. Set machine-specific data
# Edit ~/.config/chezmoi/chezmoi.toml:
# [data]
# email = "your-email@company.com"

# 4. Review what chezmoi will change
chezmoi diff

# 5. Apply manually
chezmoi apply

# 6. Install packages from Brewfile
# Review Brewfile first — legacy/optional packages are commented out
brew bundle

# 7. Install mackup and restore app configs
brew install mackup
mackup restore
```

## Manual Workflows

### Pulling changes down (chezmoi)

```bash
chezmoi cd                    # Enter source directory
git pull origin master        # Fetch latest
cd ~                          # Return home
chezmoi diff                  # Review ALL changes before applying
chezmoi apply                 # Apply only after review
```

### Pushing changes up (chezmoi)

```bash
# If you edited ~/.zshrc directly:
chezmoi re-add ~/.zshrc       # Capture current file into source
chezmoi diff                  # Review the diff
chezmoi cd
git add dot_zshrc
git commit -m "Update zshrc"
git push
```

### Syncing Mac app configs (mackup)

```bash
# Review what mackup will do BEFORE running it
mackup --dry-run backup       # See what would be backed up
mackup --dry-run restore      # See what would be restored

# Then run for real
mackup backup                 # Push local → iCloud
mackup restore                # Pull iCloud → local
```

## Adding Apps to mackup Sync

```bash
# 1. Check if supported
mackup list | grep -i myapp

# 2. Edit .mackup.cfg
chezmoi edit ~/.mackup.cfg
# Add app name under [applications_to_sync]

# 3. Commit and push
chezmoi re-add ~/.mackup.cfg
chezmoi cd && git commit && git push

# 4. Run mackup manually
mackup --dry-run backup
mackup backup
```

## Managing the Brewfile

`Brewfile` is managed by chezmoi and deployed to `~/Brewfile`, so `brew bundle` works from any directory. Work-only packages (heroku, trufflehog) are excluded on personal machines via the `machineType` template variable. Not run automatically — review and run manually.

```bash
# Install everything on a new machine (review the file first)
brew bundle

# Check what's in Brewfile but not installed, or installed but not in Brewfile
brew bundle check --verbose

# Add a new package and record it
brew install <package>
# Then manually add it to Brewfile and commit
```

Legacy or project-specific packages are commented out in the Brewfile — uncomment them only if a project needs them.

## Local Overrides

Machine-specific config goes in `~/.zshrc.local` (sourced at end of `.zshrc`). This file is **never** managed by chezmoi, so brew installers and manual tweaks can safely modify it.
