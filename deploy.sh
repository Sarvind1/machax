#!/bin/bash
set -e

MSG="${1:-deploy: update}"
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
