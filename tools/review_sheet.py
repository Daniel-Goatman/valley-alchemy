"""Build art/cards/review.html: every processed icon on a paper-slip card, numbered, at full and in-game size."""
import json
from pathlib import Path

from draw_cards import SUBJECTS, slug

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "art" / "cards"

css = """
body { margin: 0; padding: 28px; background: #e5dcc5; font: 14px/1.4 Archivo, system-ui, sans-serif; color: #1f3a73; }
h1 { font: 26px/1.1 "Young Serif", Georgia, serif; margin: 0 0 6px; }
p { margin: 0 0 20px; color: #6b6455; }
.grid { display: grid; grid-template-columns: repeat(8, 112px); gap: 26px 22px; }
.card { position: relative; width: 112px; height: 138px; background: #f6efe0; border-radius: 10px;
  box-shadow: 4px 5px 0 rgba(31,159,150,.55); display: flex; flex-direction: column; align-items: center; }
.card img { width: 84px; height: 84px; margin-top: 12px; }
.card .name { font: 15px/1 "Young Serif", Georgia, serif; margin-top: 8px; }
.card .num { position: absolute; top: 6px; left: 8px; font: 600 10px/1 Archivo, sans-serif; color: #9a8f78; }
.strip { margin-top: 30px; display: flex; flex-wrap: wrap; gap: 6px; max-width: 1070px; }
.strip img { width: 40px; height: 40px; background: #f6efe0; border-radius: 6px; padding: 3px; }
h2 { font: 17px/1.2 "Young Serif", Georgia, serif; margin: 30px 0 0; }
"""

cells = []
for i, name in enumerate(SUBJECTS, 1):
    src = f"processed/{slug(name)}.png"
    if not (CARDS / src).exists():
        cells.append(f'<div class="card"><span class="num">{i}</span><span class="name" style="margin-top:56px">{name}?</span></div>')
        continue
    cells.append(f'<div class="card"><span class="num">{i}</span>'
                 f'<img src="{src}" alt=""><span class="name">{name}</span></div>')

html = f"""<!doctype html><html><head><meta charset="utf-8"><title>Card art review</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Archivo:wght@500;600&display=swap">
<style>{css}</style></head><body>
<h1>Card art review</h1>
<p>{len(SUBJECTS)} cards, gpt-image-2 with the 4-ink sheet as reference, snapped to the riso palette. The strip at the bottom shows every icon at a small size, to check it still reads.</p>
<div class="grid">{''.join(cells)}</div>
<h2>At small size</h2><div class="strip">{''.join(f'<img src="processed/{slug(n)}.png" title="{n}" alt="{n}">' for n in SUBJECTS)}</div>
</body></html>"""
(CARDS / "review.html").write_text(html)
print(json.dumps({"cards": len(SUBJECTS), "missing": [n for n in SUBJECTS if not (CARDS / 'processed' / f'{slug(n)}.png').exists()]}))
