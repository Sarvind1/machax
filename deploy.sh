#!/bin/bash
set -e

SKIP_GATE=
ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--skip-gate" ]; then SKIP_GATE=1; else ARGS+=("$arg"); fi
done
MSG="${ARGS[0]:-deploy: update}"
BRIDGE_PORT="${BRIDGE_PORT:-8787}"

# ── Check if Claude bridge is running (needed for prod Claude CLI support) ──
if lsof -ti:"$BRIDGE_PORT" >/dev/null 2>&1; then
  echo "==> Claude bridge detected on port $BRIDGE_PORT"
else
  echo ""
  echo "  ⚠  Claude bridge is NOT running on port $BRIDGE_PORT."
  echo "     Production will fall back to Gemini unless you start the bridge:"
  echo "       BRIDGE_SECRET=<secret> node scripts/bridge.mjs"
  echo "     Then expose it via tunnel (cloudflared/ngrok) and set BRIDGE_URL in Vercel."
  echo ""
fi

# ── Replay gate: the engine must not be worse than the saved baseline ──
# Costs about $2.50 and a few minutes. Settings (env):
#   REPLAY_ENV_FILE   file with ANTHROPIC_API_KEY (default .env.local)
#   REPLAY_BASELINE   baseline results (default <evals>/results/baseline.json)
#   REPLAY_SET        engine flags prod has on (default BOT_DIRECTOR=on)
#   REPLAY_GATE_ARGS  extra gate flags (default --cap-once)
if [ -n "$SKIP_GATE" ]; then
  echo ""
  echo "  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "  !!  --skip-gate: REPLAY GATE SKIPPED.                    !!"
  echo "  !!  Deploying with NO check on replies or safety routes. !!"
  echo "  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo ""
else
  EVALS="${MACHAX_EVALS:-$HOME/Projects/machax/evals}"
  CANDIDATE="$EVALS/results/deploy-$(date +%Y%m%d-%H%M%S).json"
  SET_ARGS=()
  for pair in ${REPLAY_SET-BOT_DIRECTOR=on}; do SET_ARGS+=(--set "$pair"); done
  echo "==> Running the replay gate..."
  # run.ts exits 1 on failed rounds; gate.ts reads the file and has the final
  # say (no file, or a short one, fails there).
  MACHAX_EVALS="$EVALS" npx tsx scripts/replay/run.ts --root . \
    --env-file "${REPLAY_ENV_FILE:-.env.local}" --out "$CANDIDATE" ${SET_ARGS[@]+"${SET_ARGS[@]}"} || true
  if ! npx tsx scripts/replay/gate.ts --baseline "${REPLAY_BASELINE:-$EVALS/results/baseline.json}" \
    --candidate "$CANDIDATE" ${REPLAY_GATE_ARGS---cap-once}; then
    echo ""
    echo "==> STOPPED: the replay gate failed. Nothing was committed, pushed or deployed."
    echo "    Override (say why in the commit): ./deploy.sh \"message\" --skip-gate"
    exit 1
  fi
fi

echo "==> Staging changes..."
git add -A

if git diff --cached --quiet; then
  echo "    No changes to commit, skipping git."
else
  echo "==> Committing: $MSG"
  git commit -m "$MSG"
  echo "==> Pushing to GitHub..."
  git push origin main
fi

echo "==> Deploying Convex functions to prod..."
npx convex deploy --yes

echo "==> Deploying to Vercel production..."
vercel deploy --prod

echo ""
echo "Done! All three deployed:"
echo "  GitHub  → https://github.com/Sarvind1/machax"
echo "  Convex  → https://compassionate-basilisk-625.convex.cloud"
echo "  Vercel  → https://machax.xyz"
echo ""
echo "For Claude CLI in production:"
echo "  1. Start bridge:  BRIDGE_SECRET=<secret> node scripts/bridge.mjs"
echo "  2. Tunnel it:     cloudflared tunnel --url http://localhost:$BRIDGE_PORT"
echo "  3. Set in Vercel: BRIDGE_URL=<tunnel-url>  BRIDGE_SECRET=<secret>"
