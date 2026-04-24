#!/bin/bash
set -e

MSG="${1:-deploy: update}"

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
