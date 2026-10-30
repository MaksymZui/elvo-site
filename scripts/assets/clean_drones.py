"""Clean docs/drone*.png: drop alpha noise, despill the blue fringe, crop, export WebP and AVIF.

Run: .local/venv/Scripts/python.exe -I scripts/assets/clean_drones.py
"""

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "assets"
WORK = ROOT / ".local" / "work" / "drones"

EXPORT_WIDTH = 480
ALPHA_FLOOR = 16
MIN_SPECK_AREA = 500
PADDING = 6


def clean(src: Path, feather: dict[str, int]) -> Image.Image:
    rgba = np.array(Image.open(src).convert("RGBA")).astype(np.float32)
    rgb = rgba[..., :3]
    a = rgba[..., 3]

    a[a < ALPHA_FLOOR] = 0

    # Islands left by the original background removal
    _, labels, stats, _ = cv2.connectedComponentsWithStats((a > 0).astype(np.uint8), connectivity=8)
    keep = stats[:, cv2.CC_STAT_AREA] >= MIN_SPECK_AREA
    keep[0] = False
    a[~keep[labels]] = 0

    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    neutral = np.maximum(r, g)
    soft_edge = a < 235
    saturation = np.clip((b - neutral) / (b + 1), 0, 1)

    # Saturated blue on a soft edge is background spill, not body lights: those stay at a≈252
    a = np.where(soft_edge, a * (1 - 0.9 * np.clip(saturation * 1.6, 0, 1)), a)
    b = np.where(soft_edge, np.minimum(b, neutral * 1.12 + 6), b)

    h, w = a.shape
    for side, size in feather.items():
        ramp = np.linspace(0, 1, size)
        if side == "right":
            a[:, w - size :] *= ramp[::-1]
        if side == "left":
            a[:, :size] *= ramp

    out = np.dstack([r, g, b, a]).clip(0, 255).astype(np.uint8)
    # Premultiply-safe: transparent pixels carry no colour, smaller files
    out[out[..., 3] == 0] = 0

    ys, xs = np.where(out[..., 3] >= ALPHA_FLOOR)
    box = (
        max(xs.min() - PADDING, 0),
        max(ys.min() - PADDING, 0),
        min(xs.max() + PADDING, w - 1) + 1,
        min(ys.max() + PADDING, h - 1) + 1,
    )
    return Image.fromarray(out, "RGBA").crop(box)


def export(img: Image.Image, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    img.save(WORK / f"{name}-master.png")
    height = round(img.height * EXPORT_WIDTH / img.width)
    small = img.resize((EXPORT_WIDTH, height), Image.Resampling.LANCZOS)
    small.save(OUT / f"{name}.webp", quality=82, alpha_quality=90, method=6)
    small.save(OUT / f"{name}.avif", quality=62)
    for ext in ("webp", "avif"):
        path = OUT / f"{name}.{ext}"
        print(f"{path.name}: {small.width}x{small.height}, {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    export(clean(ROOT / "docs" / "drone.png", {"right": 70}), "drone")
    export(clean(ROOT / "docs" / "drone-top.png", {}), "drone-top")
