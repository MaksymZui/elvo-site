"""Remove text baked into docs/1-3.jpg and 7.jpg with LaMa, tile by tile at native resolution.

Regions are solid boxes: a glyph-shaped mask leaves specks from JPEG halos, and the background
under the text is smooth enough for a full fill. Output: .local/work/clean/<n>.png

Run: .local/venv/Scripts/python.exe -I scripts/assets/inpaint.py [names...]
"""

import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / ".local" / "models" / "lama_fp32.onnx"
OUT = ROOT / ".local" / "work" / "clean"

TILE = 512
STEP = 384

REGIONS: dict[str, list[tuple[int, int, int, int]]] = {
    "1": [
        (52, 34, 436, 126),  # logo and tagline
        (56, 186, 606, 284),  # heading, stops short of the drone leg
        (54, 378, 704, 438),  # feature row
    ],
    "2": [
        (48, 34, 418, 124),  # logo and tagline
        (52, 184, 238, 302),  # heading, left of the propeller tip
        (238, 184, 336, 225),  # end of DRONES, above the tip
        (238, 260, 336, 302),  # end of COMPONENTS, below the tip
        (544, 128, 708, 182),  # DJI label and leader
        (1036, 136, 1238, 194),  # Autel label and leader
    ],
    "3": [
        (664, 170, 1256, 354),  # heading and subheading
    ],
    "7": [
        (44, 28, 386, 114),  # logo and tagline
        (50, 184, 560, 270),  # heading
        (50, 270, 578, 376),  # divider and subheading
    ],
}

# LaMa invents detail next to the drone leg here: a plain diffusion fill is right for bare sky
SMOOTH: dict[str, list[tuple[int, int, int, int]]] = {
    "1": [(586, 238, 611, 284)],
    "2": [(58, 276, 134, 300), (542, 164, 562, 186)],
}

# Fills on a flat dark gradient sit 1-2 levels off their surroundings: a feathered blur hides the
# box edges. Kept left of the light wedge, whose edge must stay sharp
FEATHER: dict[str, list[tuple[int, int, int, int]]] = {
    "7": [(30, 14, 400, 128), (36, 170, 420, 384)],
}
FEATHER_SIGMA = 8


def inpaint_tile(session: ort.InferenceSession, tile: np.ndarray, mask: np.ndarray) -> np.ndarray:
    image = tile.astype(np.float32).transpose(2, 0, 1)[None] / 255
    hole = mask.astype(np.float32)[None, None]
    output = session.run(None, {"image": image, "mask": hole})[0][0]
    output = output.transpose(1, 2, 0)
    if output.max() <= 1.5:
        output = output * 255
    return output.clip(0, 255).astype(np.uint8)


def clean(session: ort.InferenceSession, name: str) -> None:
    rgb = np.array(Image.open(ROOT / "docs" / f"{name}.jpg").convert("RGB"))
    height, width = rgb.shape[:2]
    remaining = np.zeros((height, width), np.uint8)
    for x0, y0, x1, y1 in REGIONS[name]:
        remaining[y0:y1, x0:x1] = 1

    mask_preview = remaining * 255
    result = rgb.copy()
    last = width - TILE
    for x0 in [*range(0, last, STEP), last]:
        window = remaining[:, x0 : x0 + TILE]
        if not window.any():
            continue
        tile = result[:, x0 : x0 + TILE]
        filled = inpaint_tile(session, tile, window)
        # Commit all but the right margin: the next tile refills it with this one as context
        commit = np.zeros_like(window, bool)
        commit[:, : TILE if x0 == last else STEP + 64] = True
        commit &= window > 0
        tile[commit] = filled[commit]
        window[commit] = 0

    for x0, y0, x1, y1 in SMOOTH.get(name, []):
        hole = np.zeros((height, width), np.uint8)
        hole[y0:y1, x0:x1] = 255
        result = cv2.inpaint(result, hole, 7, cv2.INPAINT_TELEA)

    if name in FEATHER:
        weight = np.zeros((height, width), np.float32)
        for x0, y0, x1, y1 in FEATHER[name]:
            weight[y0:y1, x0:x1] = 1
        weight = cv2.GaussianBlur(weight, (0, 0), FEATHER_SIGMA)[..., None]
        blurred = cv2.GaussianBlur(result.astype(np.float32), (0, 0), FEATHER_SIGMA)
        result = (result * (1 - weight) + blurred * weight).round().astype(np.uint8)

    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(result).save(OUT / f"{name}.png")
    Image.fromarray(mask_preview).save(OUT / f"{name}-mask.png")
    print(f"{name}.jpg: {int((mask_preview > 0).sum())} px inpainted")


if __name__ == "__main__":
    session = ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])
    print([(i.name, i.shape) for i in session.get_inputs()])
    for name in sys.argv[1:] or REGIONS:
        clean(session, name)
