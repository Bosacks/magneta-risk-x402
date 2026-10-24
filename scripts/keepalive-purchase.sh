#!/usr/bin/env bash
# Keep-alive purchase: one real paid HTTP report against production.
# Why: the Coinbase Bazaar drops a resource after 30 days without a settled payment. Run twice a month by
# the systemd user timer deploy/keepalive/magneta-risk-keepalive.timer (Persistent=true catches up after downtime).
# The buyer key never leaves this machine: it is read from the prototype's .env.local (BUYER_PRIVATE_KEY, test buyer 0xc964…5749).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${KEEPALIVE_ENV_FILE:-$REPO/../x402-agent-payments/.env.local}"
LOG_DIR="$REPO/scripts/logs"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/keepalive.log"
export PATH="/home/dominique/.nvm/versions/node/v20.20.1/bin:$PATH"

set -a; . "$ENV_FILE"; set +a
export X402_NETWORK=eip155:8453
export TARGET_URL="https://x402.magneta.finance/v1/risk/8453/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

cd "$REPO"
ts="$(date -u +%FT%TZ)"
# Only the settlement line is kept (no report body, never the key).
if out="$(node_modules/.bin/tsx scripts/buy-once.ts 2>&1)" && line="$(grep -m1 'settled success=true' <<<"$out")"; then
  echo "$ts OK $line" >>"$LOG"
else
  echo "$ts FAIL $(tail -n 3 <<<"$out" | tr '\n' ' ' | grep -viE 'key|secret')" >>"$LOG"
  notify-send -u critical "Magneta Contract Risk" "Keep-alive purchase FAILED, see $LOG" 2>/dev/null || true
  exit 1
fi
