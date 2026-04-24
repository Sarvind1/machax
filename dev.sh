#!/bin/bash
# dev.sh — starts Convex dev + Next.js dev in parallel
# Usage: ./dev.sh [port]  (default: 3000)

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd "$(dirname "$0")"

PORT="${1:-3000}"

# Kill anything on the port
lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true

# Clean Next.js cache
rm -rf .next

echo "==> Starting Convex dev (background)..."
npx convex dev &
CONVEX_PID=$!

echo "==> Starting Next.js on port $PORT..."
npx next dev --port "$PORT" &
NEXT_PID=$!

echo ""
echo "  Convex dev  → PID $CONVEX_PID"
echo "  Next.js dev → http://localhost:$PORT (PID $NEXT_PID)"
echo ""
echo "  Press Ctrl+C to stop both."

# Trap Ctrl+C to kill both
trap 'echo ""; echo "Shutting down..."; kill $CONVEX_PID $NEXT_PID 2>/dev/null; exit 0' INT TERM

# Wait for either to exit
wait
