#!/usr/bin/env bash
# Claude Code statusLine — mirrors robbyrussell Oh My Zsh theme
# Receives JSON on stdin

input=$(cat)

cwd=$(echo "$input" | jq -r '.cwd // .workspace.current_dir // empty')
basename=$(basename "$cwd")

# Git branch from workspace repo or worktree
branch=$(echo "$input" | jq -r '.worktree.branch // empty')
if [ -z "$branch" ]; then
  branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null)
fi

# Context usage
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

# Model
model=$(echo "$input" | jq -r '.model.display_name // empty')

# Build output
# Arrow (green) + cyan dir + optional git branch (blue/red) + context %
arrow=$(printf '\033[1;32m➜\033[0m')
dir=$(printf '\033[0;36m%s\033[0m' "$basename")

parts="$arrow $dir"

if [ -n "$branch" ]; then
  git_info=$(printf ' \033[1;34mgit:(\033[0;31m%s\033[1;34m)\033[0m' "$branch")
  parts="$parts$git_info"
fi

if [ -n "$model" ]; then
  parts="$parts $(printf '\033[2m%s\033[0m' "$model")"
fi

if [ -n "$used" ]; then
  parts="$parts $(printf '\033[2mctx:%.0f%%\033[0m' "$used")"
fi

printf '%s' "$parts"
