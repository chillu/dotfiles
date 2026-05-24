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

- **SSH keys** — private keys are machine-specific and never committed
- **SSH config** — managed by chezmoi, but only contains safe, non-sensitive entries (1Password SSH agent, OrbStack include)
- **lazy-lock.json** — causes merge conflicts, regenerated on sync
- **Mac app configs** (lazygit, Ghostty, VS Code, etc.) — these live in `~/Library/Application Support` and are synced separately via [mackup](https://github.com/lra/mackup) to iCloud
- **Auto-install scripts** — nothing runs automatically on `chezmoi apply`

## Setup on a new machine

### 1. Install Oh My Zsh

`.zshrc` depends on Oh My Zsh. Install it first:

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

See the [Oh My Zsh Wiki](https://github.com/ohmyzsh/ohmyzsh/wiki) for alternatives (wget, fetch, or the mirrored installer).

### 2. Install chezmoi and apply dotfiles

```bash
brew install chezmoi
chezmoi init https://github.com/chillu/dotfiles.git

# Set machine-specific data
cat > ~/.config/chezmoi/chezmoi.toml << 'EOF'
[data]
email = "your-email@company.com"
machineType = "personal"  # or "work"
EOF

chezmoi diff
chezmoi apply
```

### 3. Install packages from Brewfile

```bash
# Review the file first
brew bundle
```

### 4. Install native apps

These are referenced in aliases or config but not in Brewfile:

- [Tailscale](https://tailscale.com)
- [Claude Code](https://claude.ai/code)
- [cmux](https://manaflow.com)
- [VS Code](https://code.visualstudio.com)
- [1Password](https://1password.com)
- [Little Snitch](https://www.obdev.at/products/littlesnitch)
- [Obsidian](https://obsidian.md)
- [Raycast](https://www.raycast.com)
- [Signal](https://signal.org)
- [WhatsApp](https://www.whatsapp.com)
- [Voice Type (Careless Whisper)](https://carelesswhisper.app)

### 5. First-run notes

- **Neovim / LazyVim**: First launch bootstraps `lazy.nvim` from GitHub, then downloads all plugins and LSP servers. Takes a few minutes. Just open `nvim` and wait.
- **cmux**: Config is already deployed. Install the app and it reads `.config/cmux/cmux.json`.

### 6. Restore Mac app configs from iCloud

```bash
brew install mackup
mackup --dry-run restore
mackup restore
```

### 7. Authenticate CLI tools

Run these once after install:

```bash
# GitHub CLI
gh auth login

# AWS (if you use it)
aws configure

# 1Password CLI
op account add
op plugin init gh
op plugin init aws
# ... then restart shell so ~/.config/op/plugins.sh is sourced

# Heroku (work machines only)
heroku login
```

### 8. Enable 1Password SSH agent

This dotfiles repo includes `~/.ssh/config` pointing the SSH agent to 1Password.

1. Open **1Password → Settings → Developer**
2. Turn on **"Use the SSH agent"**
3. (Optional) Turn on **"Biometric unlock for 1Password CLI"** for `op` shell plugins
4. **Generate or import an SSH key** in 1Password:
   - 1Password app → your vault → `+` → **SSH Key** → Generate (Ed25519 is fine)
   - Or import an existing key and delete the local copy from `~/.ssh`
5. **Add the public key to GitHub**: https://github.com/settings/ssh/new

Then verify it works:

```bash
ssh-add -l  # Should list your 1Password-managed SSH keys
ssh -T git@github.com  # Should say "Hi <user>! You've successfully authenticated..."
```

If `ssh -T` prompts you to authorize via 1Password, approve it. After that, git operations over SSH will work across all your repos.

### 9. Shell integration

```bash
# worktrunk completions
wt config shell init zsh
```

### 10. Trust local HTTPS certs (if you use mkcert)

```bash
mkcert -install
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
