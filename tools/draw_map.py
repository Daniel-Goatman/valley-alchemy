"""Draw candidate world maps in the approved riso style (one-off art, not per-card)."""
import base64, json, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import draw_cards as d
from openai_key import openai_key

OUT = d.ROOT / "art" / "map"
LAYOUT = ("Layout: a small round spring pool near the top right; a river winding from it diagonally down to the bottom left; "
          "a flower meadow in the upper middle; a forest grove in the lower right; a tiny village of round animal-folk cottages "
          "with a little bridge in the lower middle beside the river; reedy marshland at the bottom left where the river ends; "
          "rolling hills on the left; a sandy shore along the right edge; a band of soft clouds along the very top. "
          "Lots of calm open grass between areas. No text, no labels, no compass, no frame or border, no people.")
STYLE = ("Flat risograph print using strictly four inks (teal, warm yellow, coral, deep blue) on warm off-white paper, overprint "
         "blending, slight grain and misregistration, simple stylised shapes, calm and not cartoony, matching the reference image's style.")
VARIANTS = {
    "a-topdown": "A hand-drawn storybook map of a small river valley seen straight from above. ",
    "b-angled": "A hand-drawn storybook map of a small river valley seen from a gentle bird's-eye angle, with little trees and cottages drawn upright. ",
}

def draw(name, key):
    body, ctype = d.multipart({"model": "gpt-image-2", "prompt": VARIANTS[name] + LAYOUT + " " + STYLE, "size": "1536x1024",
                               "quality": "high", "output_format": "png", "n": "1"}, [("image[]", d.REF)])
    req = urllib.request.Request("https://api.openai.com/v1/images/edits", data=body,
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": ctype})
    t = time.time()
    try:
        data = json.load(urllib.request.urlopen(req, timeout=400))
    except urllib.error.HTTPError as e:
        return f"{name}: HTTP {e.code} {e.read().decode()[:200]}"
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.png").write_bytes(base64.b64decode(data["data"][0]["b64_json"]))
    return f"{name}: ok {time.time() - t:.0f}s usage={data.get('usage')}"

if __name__ == "__main__":
    key = openai_key()
    with ThreadPoolExecutor(2) as pool:
        for line in pool.map(lambda n: draw(n, key), sys.argv[1:] or list(VARIANTS)):
            print(line, flush=True)
