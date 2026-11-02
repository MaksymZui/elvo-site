"""Cut final section images from the 4x masters into src/assets/sections.

Boxes are in source pixels. Full frames and portrait mobile crops come from the 16:10 masters in
.local/work/wide-x4/ (1280x800), panels from the mockup masters in .local/work/x4/ (1280x512).

Run: .local/venv/Scripts/python.exe -I scripts/assets/crops.py [names...]
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
X4 = ROOT / ".local" / "work" / "x4"
WIDE_X4 = ROOT / ".local" / "work" / "wide-x4"
OUT = ROOT / "src" / "assets" / "sections"

SCALE = 4
MAX_WIDTH = 2560
QUALITY = 90

FRAMES = {"hero": 1, "drones": 2, "payload": 3, "thermal": 7}

# Same focus as the mockup crops, with height to spare: they fill half a phone screen
WIDE_CROPS: dict[str, tuple[int, tuple[int, int, int, int]]] = {
    "hero-mobile": (1, (585, 16, 1200, 785)),
    "drones-dji": (2, (235, 212, 775, 627)),
    "drones-autel": (2, (770, 225, 1280, 617)),
    "payload-mobile": (3, (0, 52, 640, 748)),
    "thermal-mobile": (7, (626, 84, 1238, 749)),
}

CROPS: dict[str, tuple[int, tuple[int, int, int, int]]] = {
    "panel-camera": (5, (8, 6, 392, 186)),
    "panel-propeller": (5, (470, 4, 904, 122)),
    "panel-transmitter": (5, (980, 4, 1274, 178)),
    "panel-frame": (5, (4, 220, 358, 316)),
    "panel-fpv": (5, (916, 214, 1274, 330)),
    "panel-fiber": (5, (4, 354, 434, 508)),
    "panel-chip": (5, (496, 384, 824, 508)),
    "panel-goggles": (5, (892, 362, 1274, 508)),
}


def save(image: Image.Image, name: str) -> None:
    if image.width > MAX_WIDTH:
        size = (MAX_WIDTH, round(image.height * MAX_WIDTH / image.width))
        image = image.resize(size, Image.Resampling.LANCZOS)
    path = OUT / f"{name}.webp"
    image.save(path, quality=QUALITY, method=6)
    print(f"{path.name}: {image.width}x{image.height}, {path.stat().st_size / 1024:.0f} KB")


def main(names: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, source in FRAMES.items():
        if not names or name in names:
            save(Image.open(WIDE_X4 / f"{source}.png").convert("RGB"), name)

    for folder, crops in ((WIDE_X4, WIDE_CROPS), (X4, CROPS)):
        masters: dict[int, Image.Image] = {}
        for name, (source, box) in crops.items():
            if names and name not in names:
                continue
            master = masters.setdefault(source, Image.open(folder / f"{source}.png").convert("RGB"))
            save(master.crop(tuple(v * SCALE for v in box)), name)


if __name__ == "__main__":
    main(sys.argv[1:])
