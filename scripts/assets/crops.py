"""Cut final section images from the 4x masters into src/assets/sections.

Boxes are in source pixels. Full frames come from the 16:10 masters in .local/work/wide-x4/ (1280x800),
mobile crops and panels from the mockup masters in .local/work/x4/ (1280x512).

Run: .local/venv/Scripts/python.exe -I scripts/assets/crops.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
X4 = ROOT / ".local" / "work" / "x4"
WIDE_X4 = ROOT / ".local" / "work" / "wide-x4"
OUT = ROOT / "src" / "assets" / "sections"

SCALE = 4
MAX_WIDTH = 2560
QUALITY = 90

FRAMES = {"hero": 1, "drones": 2, "payload": 3, "fiber": 4}

CROPS: dict[str, tuple[int, tuple[int, int, int, int]]] = {
    "hero-mobile": (1, (585, 0, 1200, 512)),
    "drones-dji": (2, (235, 140, 775, 410)),
    "drones-autel": (2, (770, 150, 1280, 405)),
    "payload-mobile": (3, (0, 0, 640, 512)),
    "fiber-mobile": (4, (470, 120, 1130, 470)),
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


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, source in FRAMES.items():
        save(Image.open(WIDE_X4 / f"{source}.png").convert("RGB"), name)

    masters: dict[int, Image.Image] = {}
    for name, (source, box) in CROPS.items():
        master = masters.setdefault(source, Image.open(X4 / f"{source}.png").convert("RGB"))
        save(master.crop(tuple(v * SCALE for v in box)), name)


if __name__ == "__main__":
    main()
