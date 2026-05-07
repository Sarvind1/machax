#!/bin/bash
# batch-content.sh — runs content generation sequentially for all seeds
# Usage: ./scripts/batch-content.sh

cd "$(dirname "$0")/.."

SEEDS=(
  "should i quit my job and start a chai stall instead"
  "i think i'm catching feelings for my roommate... help"
  "my parents want me to get married but i just got a promotion"
  "i have a startup idea but everyone says its dumb"
  "my boss called me at 11pm again should i just ghost this job"
  "thinking of moving to bangalore for the startup scene but rent is insane"
  "is an mba even worth it or should i just learn on youtube"
  "there's this person at my gym and we keep making eye contact what do i do"
  "i just spent 2 lakhs on a vacation and now i cant pay rent lol"
  "my best friend has been ghosting me for 2 weeks and idk what i did"
  "my parents are disappointed i chose art over engineering and its eating me up"
  "should i start a youtube channel or is that cringe in 2026"
  "my ex just texted me happy birthday at midnight should i reply"
  "got into iim but i feel like i dont deserve it and everyone will find out"
  "i've been living alone for a year now and honestly some days its really hard"
)

TOTAL=${#SEEDS[@]}
DONE=0
FAILED=0

echo "🚀 Batch generating $TOTAL conversations sequentially..."
echo ""

for i in "${!SEEDS[@]}"; do
  seed="${SEEDS[$i]}"
  num=$((i + 1))
  echo "━━━ [$num/$TOTAL] $seed"

  # Try up to 2 times
  SUCCESS=false
  for attempt in 1 2; do
    if node scripts/generate-content.mjs "$seed" 2>&1; then
      SUCCESS=true
      break
    else
      echo "  ⚠️  Attempt $attempt failed, retrying in 5s..."
      sleep 5
    fi
  done

  if $SUCCESS; then
    DONE=$((DONE + 1))
    echo "  ✅ [$DONE done, $FAILED failed]"
  else
    FAILED=$((FAILED + 1))
    echo "  ❌ Failed after 2 attempts [$DONE done, $FAILED failed]"
  fi
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Batch complete: $DONE/$TOTAL succeeded, $FAILED failed"
echo "📁 Output: content-output/"
ls -1 content-output/*.png | wc -l | xargs echo "📸 Total screenshots:"
