# MachaX Play Store screenshots v2 — shared brief

Product: MachaX, "your AI group chat". You drop a dilemma, a gang of AI friends (3/5/7/9, named personas like reeva, noor, tanmay, dev, aarushi, mira, arjun, each with their own colour and personality) debate it in a group chat, sending takes, roasts and meme GIFs. You pick the move. Made in Bengaluru, Indian Gen Z / young-professional audience, Hinglish-friendly tone.

User feedback on v1 (store-listing/screenshots/): too static, read like "direct technical screenshots". v2 must be MARKETING creatives: bold, playful, interactive-feeling, scroll-stopping. Phone mockups are optional props, not the default. Think big type, floating chat bubbles breaking out of frames, characters as personalities, stickers, tilted/overlapping phones, reactions, motion lines, depth.

Brand (keep consistent across all agents): read store-listing/src/screens.html for exact colours, fonts and persona colours. Base: deep green gradient background, cream text, italic serif display headline font + the app's sans/mono. Persona bubble colours as in v1. Logo/wordmark "machaX" as in feature-graphic.png.

Final 8-slot order:
- 01 + 02: ONE connected panoramic spread (a single 2160x1920 design split into two 1080x1920 halves; elements cross the seam so swiping feels continuous). Each half must still read on its own.
- 03: GIF / meme screen.
- 04–08: remaining feature screens (debate/no yes-men, pick your gang 3/5/7/9, tune each friend, set the mood, decisions saved, ask anything at 3am).

Specs: PNG, 1080x1920 each, RGB 24-bit, NO alpha. Verify with a script (PIL). Play shows thumbnails small: headline must be readable at ~25% size. Max ~7 words per headline.

Copy rules: no em-dashes, short, minimal emojis, lowercase-friendly brand voice. Don't claim features the app doesn't have (check src/ if unsure).

Policy: no real celebrities, TV/film stills, logos or copyrighted characters anywhere (incl. GIFs).

Rendering: HTML/CSS -> PNG with Playwright (headless Chromium, your own instance; NEVER use the playwright-personal MCP or port 9339). See store-listing/src/render.py for the existing approach. Fonts may load from Google Fonts.

Working rules: work ONLY inside your own folder store-listing/v2/<your-slot>/ (html source, render script, PNGs). Do not edit other folders, do not git commit/stash/switch branches (the lead commits). Use the Skill tool for `frontend-design` before designing. Look at your output PNGs with the Read tool and iterate at least once on what looks weak. Report: file paths, one line per screen (headline + idea), anything unverified.
