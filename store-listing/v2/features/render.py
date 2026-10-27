"""Render v2/features/features.html to 04-08 PNGs (1080x1920 RGB) + a contact sheet.

Usage: python render.py   (needs playwright + pillow)
"""
from pathlib import Path
from io import BytesIO
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
NAMES = {"s4": "04-they-argue", "s5": "05-pick-your-gang", "s6": "06-tune-and-mood",
         "s7": "07-decisions-saved", "s8": "08-ask-at-3am"}

imgs = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 2000}, device_scale_factor=1)
    page.goto((HERE / "features.html").as_uri())
    page.wait_for_load_state("networkidle")
    page.evaluate("document.fonts.ready")
    for sid, name in NAMES.items():
        img = Image.open(BytesIO(page.locator(f"#{sid}").screenshot())).convert("RGB")
        assert img.size == (1080, 1920), (name, img.size)
        img.save(HERE / f"{name}.png", "PNG", optimize=True)
        imgs.append(img)
    browser.close()

# contact sheet: 5 thumbs at 25% side by side
tw, th, gap = 270, 480, 24
sheet = Image.new("RGB", (len(imgs) * tw + (len(imgs) + 1) * gap, th + 2 * gap), (40, 40, 40))
for i, img in enumerate(imgs):
    sheet.paste(img.resize((tw, th), Image.LANCZOS), (gap + i * (tw + gap), gap))
sheet.save(HERE / "contact-sheet.png", "PNG", optimize=True)
print("rendered")
