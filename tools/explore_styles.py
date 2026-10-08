"""Art-direction study: the six starting cards rendered in several flat styles (one image per style)."""
import base64, json, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from openai_key import openai_key

OUT = Path(__file__).resolve().parent.parent / "art" / "explore"
SUBJECTS = ("Six separate game item icons arranged in a 3 by 2 grid with generous even spacing on a plain off-white "
            "background. No text, no labels, no frames, no borders. Top row: a drop of water, a small mound of rich soil, "
            "a smooth grey stone. Bottom row: a warm sun, a single seed, a friendly beaver sitting upright. "
            "Every icon is centred in its cell, similar size, readable when shrunk to 64 pixels.")
STYLES = {
    "a-classic-flat": "Style: clean flat vector illustration like a modern casual puzzle game. Soft rounded shapes, "
                      "no outlines, one subtle flat shadow tone per shape, bright but slightly muted palette, minimal detail.",
    "b-storybook-cutpaper": "Style: flat cut-paper storybook illustration. Flat colour shapes with slightly irregular "
                            "hand-cut edges and a faint paper grain, warm earthy palette (moss green, ochre, clay, slate blue), "
                            "no outlines, no gradients.",
    "c-geometric-minimal": "Style: minimal geometric flat design. Each icon built from a few simple geometric shapes "
                           "(circles, arcs, triangles), bold clear silhouettes, three to four colours per icon, calm pastel "
                           "palette with one strong accent, no outlines, no texture.",
    "d-riso-print": "Style: flat risograph print look. Limited four-ink palette (teal, warm yellow, coral, deep blue) with "
                    "overprint blending where shapes overlap, very slight grain and misregistration, no outlines.",
}


def generate(name: str, style: str, key: str) -> str:
    body = json.dumps({"model": "gpt-image-2", "prompt": f"{SUBJECTS} {style}", "size": "1536x1024",
                       "quality": "medium", "n": 1}).encode()
    req = urllib.request.Request("https://api.openai.com/v1/images/generations", data=body,
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    t = time.time()
    try:
        data = json.load(urllib.request.urlopen(req, timeout=300))
    except urllib.error.HTTPError as e:
        return f"{name}: HTTP {e.code} {e.read().decode()[:300]}"
    (OUT / f"{name}.png").write_bytes(base64.b64decode(data["data"][0]["b64_json"]))
    return f"{name}: ok in {time.time() - t:.0f}s, usage={data.get('usage')}"


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    key = openai_key()
    picked = sys.argv[1:] or list(STYLES)
    with ThreadPoolExecutor(4) as pool:
        for line in pool.map(lambda n: generate(n, STYLES[n], key), picked):
            print(line, flush=True)
