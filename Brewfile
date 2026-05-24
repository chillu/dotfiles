# Brewfile — reference list of intentionally installed packages
# Install everything: brew bundle
# Install one section at a time by commenting others out.
#
# Note: per the dotfiles philosophy this is NOT run automatically.
# Run it manually after reviewing on a new machine.

# ── Taps ──────────────────────────────────────────────────────────────────────
tap "heroku/brew"
tap "jesseduffield/lazydocker"
tap "jorgelbg/tap"
tap "mutagen-io/mutagen"
tap "speakeasy-api/tap"
tap "worktrunk/tap"

# ── Shell & terminal ──────────────────────────────────────────────────────────
brew "bat"           # better cat
brew "chezmoi"       # dotfiles manager
brew "fd"            # better find
brew "gh"            # GitHub CLI
brew "git"
brew "git-delta"     # better git diffs (delta pager)
brew "jq"            # JSON processor
brew "lazygit"
brew "jesseduffield/lazydocker/lazydocker"
brew "mackup"        # Mac app config sync (iCloud)
brew "nvm"           # Node version manager
brew "sd"            # better sed
brew "tmux"
brew "tree"
brew "uv"            # fast Python package manager
brew "worktrunk"     # git worktree manager (wt)

# ── Editors & code tools ──────────────────────────────────────────────────────
brew "neovim"

# ── Dev utilities ─────────────────────────────────────────────────────────────
brew "act"           # run GitHub Actions locally
brew "actionlint"    # GitHub Actions linter
brew "cloc"          # count lines of code
brew "scc"           # fast code counter
brew "gh"            # GitHub CLI (already above, brew bundle dedupes)
brew "httpie"        # HTTP client
brew "k6"            # load testing
brew "mkcert"        # local HTTPS certs
brew "nghttp2"
brew "pnpm"
brew "poetry"        # Python dependency management
brew "pipx"          # isolated Python CLI tools

# ── Infrastructure & cloud ────────────────────────────────────────────────────
brew "awscli"
brew "heroku/brew/heroku"
brew "mutagen-io/mutagen/mutagen-compose"
brew "speakeasy-api/tap/speakeasy"
brew "trufflehog"    # secret scanning

# ── Networking & security ─────────────────────────────────────────────────────
brew "dnsmasq"
brew "mtr"
brew "nmap"
brew "siege"         # HTTP load testing
brew "testssl"
brew "wget"

# ── Database ─────────────────────────────────────────────────────────────────
brew "pgcli"         # Postgres CLI with autocomplete
brew "pgformatter"
brew "redis"

# ── PHP (work) ────────────────────────────────────────────────────────────────
brew "php"
brew "brew-php-switcher"
# brew "php@7.4"     # legacy — install only if needed

# ── Ruby ─────────────────────────────────────────────────────────────────────
brew "rbenv"
# brew "ruby@2.7"    # legacy — install only if needed

# ── Python ───────────────────────────────────────────────────────────────────
# python@3.12 is the default; older versions only if a project needs them
brew "python@3.12"
# brew "python@3.11"
# brew "python@3.10"
# brew "python@3.9"

# ── Document & media processing ───────────────────────────────────────────────
brew "ocrmypdf"
brew "pandoc"
brew "poppler"       # PDF utils

# ── Other utilities ───────────────────────────────────────────────────────────
brew "asciinema"     # terminal recording
brew "hugo"          # static site generator
brew "jorgelbg/tap/pinentry-touchid"   # 1Password GPG pinentry via Touch ID
brew "rsync"

# ── Mac apps (casks) ──────────────────────────────────────────────────────────
cask "ghostty"       # terminal
cask "orbstack"      # Docker / Linux VMs
cask "finicky"       # browser router
cask "graphiql"      # GraphQL client
cask "db-browser-for-sqlite"
cask "ngrok"
cask "codex"         # OpenAI Codex CLI
