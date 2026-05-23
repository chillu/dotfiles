# Dotfiles

Managed with [chezmoi](https://www.chezmoi.io/). **Everything is manual — no auto-apply, no auto-install.**

## Security Model

These tools have full access to your home directory. To mitigate supply chain risk:

- **chezmoi** and **mackup** are installed via `safe-brew` which enforces a **minimum formula age** (default: 7 days)
- **No auto-run scripts** — `chezmoi apply` and `mackup backup/restore` are run manually after review
- **mackup** only syncs an explicit allowlist of apps to iCloud
- **opencode** auth tokens (`auth.json`) are explicitly excluded from sync

## What's in here

- Shell: `.zshrc`, `.zprofile`
- Editor: Neovim config (`.config/nvim`) — LazyVim-based
- Terminal multiplexer: cmux config (`.config/cmux`)
- Git: `.gitconfig` (templated for per-machine email)
- Hardened installer: `safe-brew`

## What's NOT in here

- **SSH config** — machine-specific and potentially sensitive
- **lazy-lock.json** — causes merge conflicts, regenerated on sync
- **Mac app configs** (lazygit, Ghostty, VS Code, etc.) — these live in `~/Library/Application Support` and are synced separately via [mackup](https://github.com/lra/mackup) to iCloud
- **Auto-install scripts** — nothing runs automatically on `chezmoi apply`

## Setup on a new machine

```bash
# 1. Install chezmoi (via safe-brew or download from GitHub)
safe-brew install chezmoi

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

# 6. Install mackup and restore app configs
safe-brew install mackup
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

## safe-brew: Hardened Homebrew Installer

`safe-brew` is a wrapper that checks the age of a Homebrew formula before installing.

### Why?

Homebrew formulae are in a public git repo. If a maintainer account is compromised, a malicious formula could be pushed. A **cooling-off period** means the compromise is more likely to be detected by the community before you install it.

### Usage

```bash
# Check formula age without installing
safe-brew check chezmoi
# Output: "Formula age: 45 days ✅"

# Install with age verification (default: 7 days minimum)
safe-brew install chezmoi

# Override (not recommended)
SAFE_BREW_FORCE=yes safe-brew install chezmoi

# Adjust minimum age
SAFE_BREW_MIN_AGE=14 safe-brew install mackup
```

### How it works

`safe-brew` queries the GitHub API for the last commit to the formula file in `homebrew/core`. If that commit is newer than `SAFE_BREW_MIN_AGE` days (default: 7), it refuses to install and suggests:

1. Waiting a few days
2. Downloading directly from the vendor's official release
3. Using `SAFE_BREW_FORCE=yes` to override

### For critical tools: bypass Homebrew entirely

For maximum paranoia, install chezmoi and mackup directly from GitHub releases with checksum verification:

```bash
# chezmoi: official install script (verifies checksums)
curl -fsLS https://chezmoi.io/get | sh

# mackup: download release from GitHub, verify SHA256
# See: https://github.com/lra/mackup/releases
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

## Local Overrides

Machine-specific config goes in `~/.zshrc.local` (sourced at end of `.zshrc`). This file is **never** managed by chezmoi, so brew installers and manual tweaks can safely modify it.
