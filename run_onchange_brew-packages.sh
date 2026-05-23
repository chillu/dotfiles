#!/bin/bash
# Auto-install Homebrew packages required by these dotfiles
# This script runs automatically when chezmoi apply detects changes

set -e

if ! command -v brew &> /dev/null; then
    echo "Homebrew not found. Install it first: https://brew.sh"
    exit 0
fi

packages=(
    z           # required by oh-my-zsh z plugin
    delta       # required by gitconfig pager
)

for pkg in "${packages[@]}"; do
    if brew list "$pkg" &>/dev/null; then
        echo "✅ $pkg already installed"
    else
        echo "📦 Installing $pkg..."
        brew install "$pkg"
    fi
done

echo "All dotfiles dependencies installed."
