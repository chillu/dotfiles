#!/usr/bin/env bash
# pr-sync-loop — wraps pr-sync.ts in an interval loop.
#
# Must be started from inside a cmux session (so cmux's audit session is
# inherited and socket auth works). Use:
#   cmux new-split down --command "~/scripts/pr-sync-loop.sh\n"
# or just `~/scripts/pr-sync-loop.sh` in any cmux pane.
#
# Logs to ~/.config/pr-sync/logs/loop.log; redirect /dev/null if undesired.

set -uo pipefail

INTERVAL_SECONDS=${PR_SYNC_INTERVAL:-300}
LOG_DIR="${HOME}/.config/pr-sync/logs"
LOG_FILE="${LOG_DIR}/loop.log"

mkdir -p "${LOG_DIR}"

# Singleton guard — the cmux-tab autostart (~/.zshrc) can fire more than once and
# race, and a focus can re-realize the pane; never let two loops run at once.
# Atomic mkdir lock; exit quietly if a live loop already holds it.
LOCK_DIR="${HOME}/.config/pr-sync/loop.lock"
if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  holder=$(cat "${LOCK_DIR}/pid" 2>/dev/null || true)
  if [[ -z "${holder}" ]] || kill -0 "${holder}" 2>/dev/null; then
    # empty pid = another instance is acquiring right now (don't steal); or it's alive
    echo "[$(date '+%F %T')] pr-sync-loop already running (pid ${holder:-?}) — exiting" | tee -a "${LOG_FILE}"
    exit 0
  fi
  rm -rf "${LOCK_DIR}"; mkdir "${LOCK_DIR}" || { echo "[$(date '+%F %T')] lock race — exiting" | tee -a "${LOG_FILE}"; exit 0; }
fi
echo $$ > "${LOCK_DIR}/pid"
trap 'rm -rf "${LOCK_DIR}"' EXIT

if [[ -z "${CMUX_SOCKET_PATH:-}" ]]; then
  echo "WARNING: CMUX_SOCKET_PATH is not set — this loop must be started from a cmux pane." >&2
fi

trap 'echo "[$(date "+%F %T")] pr-sync-loop exiting" | tee -a "${LOG_FILE}"; rm -rf "${LOCK_DIR}"; exit 0' INT TERM

while :; do
  {
    echo "[$(date '+%F %T')] starting pr-sync"
    ~/scripts/pr-sync.ts
    rc=$?
    echo "[$(date '+%F %T')] pr-sync finished (exit ${rc}); sleeping ${INTERVAL_SECONDS}s"
  } 2>&1 | tee -a "${LOG_FILE}"
  sleep "${INTERVAL_SECONDS}"
done
