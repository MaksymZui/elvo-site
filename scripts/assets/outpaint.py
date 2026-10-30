"""Extend the clean 1280x512 frames to 1280x800 (16:10) with LaMa, so they can fill a full-height section.

The added zones are invented by the model. A soft blur hides its grid pattern, and only the added
zones change: the original 512 px band stays pixel for pixel.

Input: .local/work/clean/<n>.png from inpaint.py
Output: .local/work/wide/<n>.png, then Real-ESRGAN x4 into .local/work/wide-x4/

Run: .local/venv/Scripts/python.exe -I scripts/assets/outpaint.py
"""

from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / ".local" / "models" / "lama_fp32.onnx"
SOURCE = ROOT / ".local" / "work" / "clean"
OUT = ROOT / ".local" / "work" / "wide"

WIDTH = 1280
HEIGHT = 800
BAND = 512
BAND_TOP = (HEIGHT - BAND) // 2
TILE = 512
STEP = 256
BLUR_SIGMA = 1.6
BLEND_PX = 24


def inpaint_tile(session: ort.InferenceSession, tile: np.ndarray, hole: np.ndarray) -> np.ndarray:
    image = tile.astype(np.float32).transpose(2, 0, 1)[None] / 255
    mask = hole.astype(np.float32)[None, None]
    output = session.run(None, {"image": image, "mask": mask})[0][0].transpose(1, 2, 0)
    if output.max() <= 1.5:
        output = output * 255
    return output.clip(0, 255).astype(np.uint8)


def smooth_added_zones(canvas: np.ndarray) -> np.ndarray:
    """Blur what LaMa added, fading into the untouched band."""
    blurred = cv2.GaussianBlur(canvas, (0, 0), BLUR_SIGMA)
    weight = np.zeros((HEIGHT, 1), np.float32)
    for y in range(HEIGHT):
        distance = max(BAND_TOP - y, y - (BAND_TOP + BAND - 1), 0)
        weight[y] = min(distance / BLEND_PX, 1)
    weight = weight[..., None]
    return (canvas * (1 - weight) + blurred * weight).astype(np.uint8)


def extend(session: ort.InferenceSession, name: str) -> None:
    source = np.array(Image.open(SOURCE / f"{name}.png").convert("RGB"))
    canvas = np.zeros((HEIGHT, WIDTH, 3), np.uint8)
    canvas[BAND_TOP : BAND_TOP + BAND] = source
    hole = np.ones((HEIGHT, WIDTH), np.uint8)
    hole[BAND_TOP : BAND_TOP + BAND] = 0

    for y0 in (0, HEIGHT - TILE):
        for x0 in [*range(0, WIDTH - TILE, STEP), WIDTH - TILE]:
            window = hole[y0 : y0 + TILE, x0 : x0 + TILE]
            if not window.any():
                continue
            tile = canvas[y0 : y0 + TILE, x0 : x0 + TILE]
            filled = inpaint_tile(session, tile.copy(), window)
            tile[window > 0] = filled[window > 0]
            window[:] = 0

    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(smooth_added_zones(canvas)).save(OUT / f"{name}.png")
    print(f"{name}: {WIDTH}x{HEIGHT}")


if __name__ == "__main__":
    session = ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])
    for name in "1234":
        extend(session, name)
