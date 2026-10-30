"""Cut final section images from the 4x masters into src/assets/sections.

Boxes are in mockup pixels (1280x512). Masters: .local/work/x4/<n>.png

Run: .local/venv/Scripts/python.exe -I scripts/assets/crops.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
X4 = ROOT / ".local" / "work" / "x4"
OUT = ROOT / "src" / "assets" / "sections"

SCALE = 4
MAX_WIDTH = 2560
QUALITY = 90

FULL = (0, 0, 1280, 512)

CROPS: dict[str, tuple[int, tuple[int, int, int, int]]] = {
    "hero": (1, FULL),
    "hero-mobile": (1, (585, 0, 1200, 512)),
    "drones": (2, FULL),
    "drones-dji": (2, (235, 140, 775, 410)),
    "drones-autel": (2, (770, 150, 1280, 405)),
    "payload": (3, FULL),
    "payload-mobile": (3, (0, 0, 640, 512)),
    "fiber": (4, FULL),
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


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    masters: dict[int, Image.Image] = {}
    for name, (source, box) in CROPS.items():
        master = masters.setdefault(source, Image.open(X4 / f"{source}.png").convert("RGB"))
        crop = master.crop(tuple(v * SCALE for v in box))
        if crop.width > MAX_WIDTH:
            crop = crop.resize(
                (MAX_WIDTH, round(crop.height * MAX_WIDTH / crop.width)),
                Image.Resampling.LANCZOS,
            )
        path = OUT / f"{name}.webp"
        crop.save(path, quality=QUALITY, method=6)
        print(f"{path.name}: {crop.width}x{crop.height}, {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
