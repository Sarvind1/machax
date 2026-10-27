"""Render panorama.html (2160x1920) and split it into two 1080x1920 Play screenshots.

Usage: python render.py   (needs playwright + pillow)
Outputs: 01-panorama-left.png, 02-panorama-right.png, panorama-preview.png, play-preview.png
"""
from pathlib import Path
from io import BytesIO
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 2200, "height": 2000}, device_scale_factor=1)
    page.goto((HERE / "panorama.html").as_uri())
    page.wait_for_load_state("networkidle")
    page.evaluate("document.fonts.ready")
    png = page.locator("#spread").screenshot()
    browser.close()

full = Image.open(BytesIO(png)).convert("RGB")
assert full.size == (2160, 1920), full.size
full.save(HERE / "panorama-preview.png", "PNG", optimize=True)

left = full.crop((0, 0, 1080, 1920))
right = full.crop((1080, 0, 2160, 1920))
left.save(HERE / "01-panorama-left.png", "PNG", optimize=True)
right.save(HERE / "02-panorama-right.png", "PNG", optimize=True)

# "as Play shows it": each card at ~1/4 size with rounded corners and a 24px gap
scale, gap, pad, radius = 0.25, 24, 32, 18
w, h = int(1080 * scale), int(1920 * scale)
sheet = Image.new("RGB", (pad * 2 + w * 2 + gap, pad * 2 + h), (255, 255, 255))
mask = Image.new("L", (w, h), 0)
from PIL import ImageDraw
ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius, fill=255)
for i, half in enumerate((left, right)):
    sheet.paste(half.resize((w, h), Image.LANCZOS), (pad + i * (w + gap), pad), mask)
sheet.save(HERE / "play-preview.png", "PNG", optimize=True)

for name in ("01-panorama-left.png", "02-panorama-right.png"):
    im = Image.open(HERE / name)
    print(name, im.size, im.mode)
