#!/usr/bin/env python3
"""Generate Android app icons and splash screen for MachaX."""

from PIL import Image, ImageDraw, ImageFont
import os
import math

# Brand colors
ACCENT = (74, 124, 89)       # #4a7c59 matcha green
BG_DARK = (15, 15, 15)       # #0f0f0f app background
WHITE = (255, 255, 255)
STEAM = (255, 255, 255, 80)

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANDROID_RES = os.path.join(PROJECT, "android", "app", "src", "main", "res")


def draw_cup(draw, cx, cy, size, accent=ACCENT):
    """Draw the MachaX cup logo centered at (cx, cy) with given size."""
    s = size / 64  # scale factor (original viewBox is 52x64)

    # Cup body
    cup_left = cx - 18 * s
    cup_right = cx + 16 * s
    cup_top = cy - 24 * s
    cup_bottom = cy + 28 * s
    # Tapered cup: top wider, bottom narrower with rounded bottom
    points = [
        (cx - 18 * s, cup_top),      # top-left
        (cx + 16 * s, cup_top),      # top-right
        (cx + 14 * s, cup_bottom - 6 * s),  # bottom-right before curve
        (cx - 16 * s, cup_bottom - 6 * s),  # bottom-left before curve
    ]
    # Draw cup body as polygon
    draw.polygon(points, fill=accent)
    # Rounded bottom
    draw.ellipse(
        [cx - 16 * s, cup_bottom - 14 * s, cx + 14 * s, cup_bottom + 2 * s],
        fill=accent
    )

    # Handle (right side arc) - draw as thick arc
    handle_bbox = [cx + 12 * s, cy - 10 * s, cx + 28 * s, cy + 14 * s]
    draw.arc(handle_bbox, -90, 90, fill=accent, width=max(2, int(3.5 * s)))

    # "X" letter in the cup
    font_size = int(28 * s)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", font_size)
        except (OSError, IOError):
            font = ImageFont.load_default()

    text = "X"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = cx - tw / 2 - 1 * s
    ty = cy - th / 2 + 2 * s
    draw.text((tx, ty), text, fill=WHITE, font=font)

    # Steam wisps above the cup
    for dx in [-6, 0, 6]:
        x = cx + dx * s
        y_base = cup_top - 4 * s
        for i in range(3):
            y = y_base - i * 3 * s
            draw.ellipse(
                [x - 1.5 * s, y - 1 * s, x + 1.5 * s, y + 1 * s],
                fill=(255, 255, 255, 60)
            )


def generate_icon(size, padding_ratio=0.2):
    """Generate a square icon with the cup centered."""
    img = Image.new("RGBA", (size, size), BG_DARK + (255,))
    draw = ImageDraw.Draw(img)

    padding = size * padding_ratio
    cup_size = size - padding * 2

    draw_cup(draw, size / 2, size / 2 + padding * 0.1, cup_size)

    return img


def generate_foreground(size):
    """Adaptive icon foreground (transparent bg, just the cup)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Adaptive icons have 18dp safe zone inset on each side (108dp total)
    # So the icon should be in the center 72% of the area
    inset = size * 0.22
    cup_size = size - inset * 2

    draw_cup(draw, size / 2, size / 2, cup_size)

    return img


def generate_background(size):
    """Adaptive icon background (solid accent/dark)."""
    img = Image.new("RGBA", (size, size), BG_DARK + (255,))
    return img


def generate_splash(width, height):
    """Splash screen with centered cup logo."""
    img = Image.new("RGBA", (width, height), BG_DARK + (255,))
    draw = ImageDraw.Draw(img)

    cup_size = min(width, height) * 0.3
    draw_cup(draw, width / 2, height / 2 - cup_size * 0.2, cup_size)

    # App name below the cup
    font_size = int(cup_size * 0.4)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except (OSError, IOError):
        font = ImageFont.load_default()

    text = "MachaX"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(
        (width / 2 - tw / 2, height / 2 + cup_size * 0.4),
        text, fill=ACCENT, font=font
    )

    return img


# Android mipmap icon sizes
ICON_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

# Adaptive icon foreground/background sizes (108dp * density)
ADAPTIVE_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

if __name__ == "__main__":
    # Generate legacy icons
    for folder, size in ICON_SIZES.items():
        out_dir = os.path.join(ANDROID_RES, folder)
        os.makedirs(out_dir, exist_ok=True)

        icon = generate_icon(size, padding_ratio=0.15)
        icon.save(os.path.join(out_dir, "ic_launcher.png"))

        # Round icon
        mask = Image.new("L", (size, size), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.ellipse([0, 0, size, size], fill=255)
        round_icon = icon.copy()
        round_icon.putalpha(mask)
        round_icon.save(os.path.join(out_dir, "ic_launcher_round.png"))

        print(f"  {folder}: {size}x{size}")

    # Generate adaptive icon layers
    for folder, size in ADAPTIVE_SIZES.items():
        out_dir = os.path.join(ANDROID_RES, folder)
        os.makedirs(out_dir, exist_ok=True)

        fg = generate_foreground(size)
        fg.save(os.path.join(out_dir, "ic_launcher_foreground.png"))

        bg = generate_background(size)
        bg.save(os.path.join(out_dir, "ic_launcher_background.png"))

        print(f"  {folder} adaptive: {size}x{size}")

    # Generate Play Store icon (512x512)
    store_icon = generate_icon(512, padding_ratio=0.15)
    store_icon_rgb = Image.new("RGB", (512, 512), BG_DARK)
    store_icon_rgb.paste(store_icon, mask=store_icon.split()[3])
    store_icon_rgb.save(os.path.join(PROJECT, "android", "app", "src", "main", "ic_launcher-playstore.png"))
    print("  Play Store icon: 512x512")

    # Generate splash screen
    splash = generate_splash(1080, 1920)
    splash_rgb = Image.new("RGB", (1080, 1920), BG_DARK)
    splash_rgb.paste(splash, mask=splash.split()[3])
    splash_dir = os.path.join(ANDROID_RES, "drawable")
    os.makedirs(splash_dir, exist_ok=True)
    splash_rgb.save(os.path.join(splash_dir, "splash.png"))
    print("  Splash screen: 1080x1920")

    # Write adaptive icon XML
    anydpi_dir = os.path.join(ANDROID_RES, "mipmap-anydpi-v26")
    os.makedirs(anydpi_dir, exist_ok=True)

    adaptive_xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'''
    with open(os.path.join(anydpi_dir, "ic_launcher.xml"), "w") as f:
        f.write(adaptive_xml)
    with open(os.path.join(anydpi_dir, "ic_launcher_round.xml"), "w") as f:
        f.write(adaptive_xml)

    print("\nDone! Icons generated.")
