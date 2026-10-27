"""Render gifs.html sections to 1080x1920 RGB PNGs (no alpha).

Usage: <venv with playwright+pillow>/bin/python render.py
"""
from pathlib import Path
from io import BytesIO
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
SHOTS = {"a": "03-gifs.png", "b": "03-gifs-alt.png"}

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 2000}, device_scale_factor=1)
    page.goto((HERE / "gifs.html").as_uri())
    page.wait_for_load_state("networkidle")
    page.evaluate("document.fonts.ready")
    for sid, name in SHOTS.items():
        el = page.locator(f"#{sid}")
        if el.count() == 0:
            continue
        img = Image.open(BytesIO(el.screenshot())).convert("RGB")
        assert img.size == (1080, 1920), (name, img.size)
        img.save(HERE / name, "PNG", optimize=True)
        print(name, img.size, img.mode)
    browser.close()
