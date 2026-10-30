"""Rebuild the ELVO logo as geometry.

Coordinates come from the 4x upscale of docs/6.jpg. Every corner is (x, y, radius).
Writes src/assets/logo.svg and src/assets/logo-mark.svg.

Run: .local/venv/Scripts/python.exe -I scripts/assets/logo.py
"""

import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "src" / "assets"

BLUE = "#024DFC"
YELLOW = "#FECE03"
WHITE = "#FFFFFF"

Corner = tuple[float, float, float]


def rounded(points: list[Corner]) -> str:
    """Closed path through the points with a circular-looking fillet at each corner."""
    parts = []
    count = len(points)
    for i, (x, y, radius) in enumerate(points):
        px, py, _ = points[i - 1]
        nx, ny, _ = points[(i + 1) % count]
        to_prev, to_next = math.hypot(px - x, py - y), math.hypot(nx - x, ny - y)
        cut = min(radius, to_prev / 2, to_next / 2)
        ax, ay = x + (px - x) * cut / to_prev, y + (py - y) * cut / to_prev
        bx, by = x + (nx - x) * cut / to_next, y + (ny - y) * cut / to_next
        parts.append(f"{'M' if i == 0 else 'L'}{ax:.1f} {ay:.1f}Q{x:.1f} {y:.1f} {bx:.1f} {by:.1f}")
    return "".join(parts) + "Z"


def bar(left: float, top: float, width: float) -> str:
    """One slanted bar of the E mark: acute corners stay tight, obtuse ones are soft."""
    height, slant = 51, 60
    return rounded([
        (left + slant, top, 58),
        (left + slant + width, top, 8),
        (left + width, top + height, 58),
        (left, top + height, 8),
    ])


BLUE_BAR = bar(100, 27, 218)
WHITE_BAR = bar(71, 103, 197)
YELLOW_BAR = bar(23, 179, 207)

LETTER_L = rounded([
    (412, 27, 18), (477, 27, 18), (477, 180, 22), (688, 180, 18),
    (688, 230, 18), (412, 230, 84),
])
LETTER_V = rounded([
    (618, 27, 14), (692, 27, 16), (797, 156, 6), (902, 27, 16),
    (974, 27, 14), (822, 230, 24), (772, 230, 24),
])
LETTER_O = (
    rounded([(992, 27, 78), (1300, 27, 78), (1300, 230, 78), (992, 230, 78)])
    + rounded([(1055, 78, 30), (1238, 78, 30), (1238, 180, 30), (1055, 180, 30)])
)
O_DOT = rounded([(1120, 104, 11), (1172, 104, 11), (1172, 152, 11), (1120, 152, 11)])


def write_logo() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / "logo.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 20 1284 216">'
        f'<path fill="{BLUE}" d="{BLUE_BAR}"/>'
        f'<path fill="{WHITE}" d="{WHITE_BAR}{LETTER_L}{LETTER_V}"/>'
        f'<path fill="{WHITE}" fill-rule="evenodd" d="{LETTER_O}"/>'
        f'<path fill="{YELLOW}" d="{YELLOW_BAR}{O_DOT}"/>'
        "</svg>\n",
        encoding="utf-8",
    )
    (ASSETS / "logo-mark.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="14 17 374 223">'
        f'<path fill="{BLUE}" d="{BLUE_BAR}"/>'
        f'<path fill="{WHITE}" d="{WHITE_BAR}"/>'
        f'<path fill="{YELLOW}" d="{YELLOW_BAR}"/>'
        "</svg>\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    write_logo()
