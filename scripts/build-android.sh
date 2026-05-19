#!/bin/bash
set -e

echo "==> Building MachaX for Android (Capacitor)"

# Server-only routes (API, sitemap, robots) block static export.
# Move them aside — they stay on the deployed server, not needed in the app.
echo "==> Temporarily excluding server-only routes..."
mv src/app/api src/app/_api_excluded
mv src/app/sitemap.ts src/app/_sitemap.ts.excluded
mv src/app/robots.ts src/app/_robots.ts.excluded

# Ensure cleanup runs even if the build fails
cleanup() {
  echo "==> Restoring server-only routes..."
  mv src/app/_api_excluded src/app/api
  mv src/app/_sitemap.ts.excluded src/app/sitemap.ts
  mv src/app/_robots.ts.excluded src/app/robots.ts
}
trap cleanup EXIT

# Build static export
echo "==> Running Next.js static export..."
CAPACITOR_BUILD=true NEXT_PUBLIC_API_BASE=https://machax.xyz npx next build

# Sync with Capacitor Android
echo "==> Syncing with Capacitor..."
npx cap sync android

echo ""
echo "Done! Open in Android Studio:"
echo "  npx cap open android"
