#!/bin/bash
set -e

echo "==> Building MachaX for Android (Capacitor)"

# Google sign-in needs the Firebase web config inlined into the static build.
# 1.3 shipped without it ("sign-in isn't set up yet"), so load it reliably and
# refuse to build without it. Order: values already in the environment, then
# $APP_ENV_FILE (default .env.local), then Vercel production env.
FIREBASE_KEYS="NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN NEXT_PUBLIC_FIREBASE_PROJECT_ID NEXT_PUBLIC_FIREBASE_APP_ID"

load_firebase_from() {
  local file="$1" key val
  [ -f "$file" ] || return 0
  for key in $FIREBASE_KEYS; do
    [ -n "${!key}" ] && continue
    val=$(grep -E "^${key}=" "$file" | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')
    [ -n "$val" ] && export "$key=$val"
  done
}

missing_firebase() {
  local key out=""
  for key in $FIREBASE_KEYS; do [ -z "${!key}" ] && out="$out $key"; done
  echo "$out"
}

load_firebase_from "${APP_ENV_FILE:-.env.local}"
if [ -n "$(missing_firebase)" ] && command -v vercel >/dev/null 2>&1; then
  echo "==> Firebase web config not in env/.env.local, pulling from Vercel production..."
  VERCEL_TMP=$(mktemp -t machax-vercel-env)
  if vercel env pull --environment=production "$VERCEL_TMP" --yes >/dev/null 2>&1; then
    load_firebase_from "$VERCEL_TMP"
  fi
  rm -f "$VERCEL_TMP"
fi
MISSING=$(missing_firebase)
if [ -n "$MISSING" ]; then
  echo "ERROR: Firebase web config missing:$MISSING" >&2
  echo "       Google sign-in would be broken in the APK. Set them in the env," >&2
  echo "       in .env.local (or APP_ENV_FILE), or link Vercel (vercel link)." >&2
  exit 1
fi
echo "==> Firebase web config found (project: $NEXT_PUBLIC_FIREBASE_PROJECT_ID)"

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
# The app talks to the same Convex deployment as machax.xyz (prod), so accounts,
# guest chats moved on sign-in, and Meta events all live in one place. 1.2 was
# built against the "dev" deployment from .env.local, which split them.
APP_CONVEX_URL="${APP_CONVEX_URL:-https://compassionate-basilisk-625.convex.cloud}"
echo "==> Convex for the app: $APP_CONVEX_URL"
CAPACITOR_BUILD=true NEXT_PUBLIC_API_BASE=https://machax.xyz \
  NEXT_PUBLIC_CONVEX_URL="$APP_CONVEX_URL" \
  NEXT_PUBLIC_CONVEX_SITE_URL="${APP_CONVEX_URL/.convex.cloud/.convex.site}" \
  npx next build

# Make sure the config really landed in the bundle.
if ! grep -rqF "$NEXT_PUBLIC_FIREBASE_API_KEY" out/_next/static; then
  echo "ERROR: Firebase API key not found in out/_next/static; sign-in would fail." >&2
  exit 1
fi
echo "==> Firebase web config is inlined in the static build"

# Sync with Capacitor Android
echo "==> Syncing with Capacitor..."
npx cap sync android

echo ""
echo "Done! Open in Android Studio:"
echo "  npx cap open android"
