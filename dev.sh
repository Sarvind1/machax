#!/bin/bash
# dev.sh — starts Convex dev + Next.js dev + Claude bridge in parallel
# Usage: ./dev.sh [port]  (default: 3000)

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd "$(dirname "$0")"

PORT="${1:-3000}"
BRIDGE_PORT="${BRIDGE_PORT:-8787}"

# Kill anything on the ports
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
lsof -ti:"$BRIDGE_PORT" | xargs kill -9 2>/dev/null || true

# Clean Next.js cache
rm -rf .next

echo "==> Starting Convex dev (background)..."
npx convex dev &
CONVEX_PID=$!

echo "==> Starting Claude bridge on port $BRIDGE_PORT (background)..."
BRIDGE_PORT="$BRIDGE_PORT" BRIDGE_SECRET="${BRIDGE_SECRET:-dev-secret}" node scripts/bridge.mjs &
BRIDGE_PID=$!

echo "==> Starting Next.js on port $PORT..."
npx next dev --port "$PORT" &
NEXT_PID=$!

echo ""
echo "  Convex dev   → PID $CONVEX_PID"
echo "  Claude bridge → http://localhost:$BRIDGE_PORT (PID $BRIDGE_PID)"
echo "  Next.js dev  → http://localhost:$PORT (PID $NEXT_PID)"
echo ""
echo "  Press Ctrl+C to stop all."

# Trap Ctrl+C to kill all
trap 'echo ""; echo "Shutting down..."; kill $CONVEX_PID $BRIDGE_PID $NEXT_PID 2>/dev/null; exit 0' INT TERM

# Wait for any to exit
wait
