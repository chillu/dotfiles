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

# Reasoning effort
effort=$(echo "$input" | jq -r '.effort.level // empty')

# Rate limits
five_hour=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
seven_day=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')

# Project theme color from .runn/project.env (set by runn-cli)
theme_r=""
project_env="$cwd/.runn/project.env"
if [ -f "$project_env" ]; then
  raw=$(grep -s '^THEME_COLOR=' "$project_env" | cut -d= -f2)
  if [[ "$raw" =~ ^#[0-9a-fA-F]{6}$ ]]; then
    hex="${raw#\#}"
    theme_r=$((16#${hex:0:2}))
    theme_g=$((16#${hex:2:2}))
    theme_b=$((16#${hex:4:2}))
  fi
fi

# Build output
# Arrow (green) + dir + optional git branch (blue/red) + context %
arrow=$(printf '\033[1;32m➜\033[0m')

if [ -n "$theme_r" ]; then
  # Contrast foreground: same luminance formula as runn-cli (r*299 + g*587 + b*114)
  luminance=$(( theme_r * 299 + theme_g * 587 + theme_b * 114 ))
  if [ "$luminance" -ge 150000 ]; then
    fr=0; fg_=0; fb=0
  else
    fr=255; fg_=255; fb=255
  fi
  dir=$(printf '\033[48;2;%d;%d;%dm\033[38;2;%d;%d;%dm %s \033[0m' \
    "$theme_r" "$theme_g" "$theme_b" "$fr" "$fg_" "$fb" "$basename")
else
  dir=$(printf '\033[0;36m%s\033[0m' "$basename")
fi

parts="$arrow $dir"

if [ -n "$branch" ]; then
  git_info=$(printf ' \033[1;34mgit:(\033[0;31m%s\033[1;34m)\033[0m' "$branch")
  parts="$parts$git_info"
fi

if [ -n "$model" ]; then
  parts="$parts $(printf '\033[2m%s\033[0m' "$model")"
fi

if [ -n "$effort" ]; then
  parts="$parts $(printf '\033[2meffort:%s\033[0m' "$effort")"
fi

if [ -n "$used" ]; then
  parts="$parts $(printf '\033[2mctx:%.0f%%\033[0m' "$used")"
fi

if [ -n "$five_hour" ] || [ -n "$seven_day" ]; then
  limits=""
  [ -n "$five_hour" ] && limits="5h:$(printf '%.0f' "$five_hour")%"
  [ -n "$seven_day" ] && limits="$limits${limits:+ }7d:$(printf '%.0f' "$seven_day")%"
  parts="$parts $(printf '\033[2m%s\033[0m' "$limits")"
fi

printf '%s' "$parts"
