"""Render store-listing/src/screens.html to Play Store PNGs (RGB, no alpha).

Usage: python render.py   (needs playwright + pillow)
"""
from pathlib import Path
from io import BytesIO
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
SHOTS = OUT / "screenshots"
SHOTS.mkdir(exist_ok=True)
NAMES = ["01-hero", "02-they-argue", "03-drill-down", "04-pick-your-pod",
         "05-tune-friends", "06-set-the-mood", "07-decisions-saved", "08-ask-anything"]


def save_rgb(png_bytes, path, size):
    img = Image.open(BytesIO(png_bytes)).convert("RGB")
    assert img.size == size, (path, img.size)
    img.save(path, "PNG", optimize=True)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 2000}, device_scale_factor=1)
    page.goto((HERE / "screens.html").as_uri())
    page.wait_for_load_state("networkidle")
    page.evaluate("document.fonts.ready")
    for i, name in enumerate(NAMES, 1):
        el = page.locator(f"#s{i}")
        save_rgb(el.screenshot(), SHOTS / f"{name}.png", (1080, 1920))
    save_rgb(page.locator("#fg").screenshot(), OUT / "feature-graphic.png", (1024, 500))
    browser.close()
print("rendered")
