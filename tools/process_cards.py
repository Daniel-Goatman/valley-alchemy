"""Post-process raw card art into game-ready icons.

Steps: key out the white background (only white connected to the image edge), snap every pixel to the riso
palette (4 inks, their 2-ink overprints, paper), trim, centre on a square canvas, downscale to 256 px.
Snapping happens at full resolution so the print grain survives; downscaling then turns grain into soft tints.

Run with an interpreter that has Pillow and NumPy, e.g.
  ~/Documents/GitHub/Narrato/.venv312/bin/python tools/process_cards.py
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "art" / "cards" / "raw"
OUT = ROOT / "art" / "cards" / "processed"
SIZE = 256
MARGIN = 0.08

INKS = {
    "teal": (31, 159, 150),
    "yellow": (247, 190, 50),
    "coral": (239, 108, 88),
    "blue": (37, 79, 160),
}
PAPER = (246, 239, 224)


def palette() -> np.ndarray:
    cols = [PAPER, *INKS.values()]
    inks = list(INKS.values())
    for i in range(len(inks)):
        for j in range(i + 1, len(inks)):
            cols.append(tuple(round(a * b / 255) for a, b in zip(inks[i], inks[j])))  # multiply overprint
    return np.array(cols, dtype=np.float32)


PAL = palette()


def background_mask(rgb: np.ndarray, thresh: float = 38.0) -> np.ndarray:
    """Near-white pixels connected to the border (flood fill by repeated dilation)."""
    whiteish = np.linalg.norm(rgb - 255.0, axis=2) < thresh
    reach = np.zeros_like(whiteish)
    reach[0, :] = whiteish[0, :]
    reach[-1, :] = whiteish[-1, :]
    reach[:, 0] = whiteish[:, 0]
    reach[:, -1] = whiteish[:, -1]
    while True:
        grown = reach.copy()
        grown[1:, :] |= reach[:-1, :]
        grown[:-1, :] |= reach[1:, :]
        grown[:, 1:] |= reach[:, :-1]
        grown[:, :-1] |= reach[:, 1:]
        grown &= whiteish
        if (grown == reach).all():
            return reach
        reach = grown


def process(path: Path, out_dir: Path = OUT) -> Path:
    img = Image.open(path).convert("RGB")
    img = img.resize((512, 512), Image.LANCZOS)  # keeps the grain, makes the flood fill quick
    rgb = np.asarray(img, dtype=np.float32)

    bg = background_mask(rgb)
    # Soft edge: one pixel of partial alpha on the boundary.
    alpha = (~bg).astype(np.float32)
    edge = np.zeros_like(alpha)
    edge[1:-1, 1:-1] = (alpha[:-2, 1:-1] + alpha[2:, 1:-1] + alpha[1:-1, :-2] + alpha[1:-1, 2:]) / 4
    alpha = np.where(bg, edge * 0.6, 1.0)

    # Snap to the nearest palette colour (white grain specks inside the icon become paper).
    d = ((rgb[:, :, None, :] - PAL[None, None, :, :]) ** 2).sum(axis=3)
    snapped = PAL[d.argmin(axis=2)]

    rgba = np.dstack([snapped, alpha * 255]).astype(np.uint8)
    out = Image.fromarray(rgba, "RGBA")

    # Trim to content and centre on a square with a margin.
    ys, xs = np.where(alpha > 0.5)
    if len(xs) == 0:
        raise ValueError(f"{path.name}: nothing left after background removal")
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    out = out.crop(box)
    side = int(max(out.size) / (1 - 2 * MARGIN))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(out, ((side - out.width) // 2, (side - out.height) // 2))
    canvas = canvas.resize((SIZE, SIZE), Image.LANCZOS)

    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / path.name
    canvas.save(dest, optimize=True)
    return dest


if __name__ == "__main__":
    # Single-file mode for the game server: process_cards.py --file raw.png --out dir
    if len(sys.argv) == 5 and sys.argv[1] == "--file" and sys.argv[3] == "--out":
        print(process(Path(sys.argv[2]), Path(sys.argv[4])))
        sys.exit(0)
    files = [RAW / f"{n}.png" for n in sys.argv[1:]] or sorted(RAW.glob("*.png"))
    for f in files:
        dest = process(f)
        a = np.asarray(Image.open(dest))[:, :, 3]
        print(f"{f.stem}: ok, coverage {100 * (a > 128).mean():.0f}%")
