"""Draw card icons with gpt-image-2, using the approved 4-ink riso sheet as the style reference.

Usage: python3 tools/draw_cards.py [Name ...]     (no names = every card without a raw image yet)
Writes art/cards/raw/<slug>.png (white background, 1024px). Existing files are skipped unless named explicitly.
"""
import base64, json, re, sys, time, urllib.error, urllib.request, uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from openai_key import openai_key

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "art" / "explore" / "e-riso-4ink.png"
RAW = ROOT / "art" / "cards" / "raw"

# Shared with the server (server/art.mjs) so hand-drawn and in-game art use the same prompt.
_STYLE = json.loads((ROOT / "art" / "style.json").read_text())
STYLE = _STYLE["style"]
FRAME = _STYLE["frame"]

# What each card should show. Keep subjects simple and readable at 64 px.
SUBJECTS = {
    "Water": "a single water droplet",
    "Soil": "a small mound of rich soil with a few crumbs",
    "Stone": "one smooth river stone",
    "Sun": "a warm sun with short rays",
    "Seed": "a single seed",
    "Beaver": "a beaver sitting upright, side-on, with its flat tail",
    "Mud": "a soft puddle of mud with a few splashes",
    "Cloud": "a fluffy cloud",
    "Rain": "a small cloud with falling raindrops",
    "Rainbow": "a short rainbow arc with a small cloud at one end",
    "Wind": "three curling gusts of wind",
    "Sprout": "a tiny sprout with two leaves coming out of a little bit of soil",
    "Grass": "a tuft of grass blades",
    "Flower": "a meadow flower with two leaves",
    "Sapling": "a young sapling with a thin trunk and a few leaves",
    "Tree": "a leafy round tree",
    "Grove": "a small group of three trees",
    "Log": "a cut log lying on its side, showing the rings",
    "Dam": "a beaver dam of stacked sticks holding back water",
    "Hay": "a small bundle of hay tied in the middle",
    "Fire": "a campfire with flames on crossed logs",
    "Hearth": "a small round stone hearth with a fire inside",
    "Steam": "curling wisps of steam rising",
    "Clay": "a soft lump of clay with a thumbprint",
    "Brick": "a single clay brick",
    "Pebble": "three small pebbles",
    "Pond": "a small round pond with a lily pad",
    "Reed": "a few tall reeds with brown cattail heads",
    "Fish": "a small river fish, side-on",
    "Bee": "a round bumblebee with small wings",
    "Honey": "a small pot of honey with a drip",
    "Dandelion": "a dandelion seed head, with a few seeds floating away",
    # Building blocks for life (2026-10-08)
    "Life": "a small glowing spark with a tiny curled leaf and a water droplet around it, the first spark of life",
    "Fur": "a soft fluffy tuft of fur",
    "Feather": "a single soft feather",
    "Shell": "a single spiral snail shell",
    "Fin": "a single fish fin",
    "Wing": "a single small bird wing",
    "Horn": "a single curved horn",
    "Tiny": "a tiny ladybird sitting on a small leaf",
    "Big": "a giant mushroom towering over a little pebble",
    "Night": "a crescent moon with two small stars",
}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def multipart(fields: dict, files: list) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    out = bytearray()
    for k, v in fields.items():
        out += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    for field, path in files:
        out += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{path.name}\"\r\n"
                f"Content-Type: image/png\r\n\r\n").encode() + path.read_bytes() + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def draw(name: str, key: str, quality: str = "medium", out: Path = RAW) -> str:
    body, ctype = multipart(
        {"model": "gpt-image-2", "prompt": f"{STYLE}{FRAME} Subject: {SUBJECTS[name]}.", "size": "1024x1024",
         "quality": quality, "output_format": "png", "n": "1"},
        [("image[]", REF)],
    )
    req = urllib.request.Request("https://api.openai.com/v1/images/edits", data=body,
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": ctype})
    t = time.time()
    for attempt in range(3):
        try:
            data = json.load(urllib.request.urlopen(req, timeout=300))
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:300]
            if e.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(10 * (attempt + 1))
                continue
            return f"{name}: HTTP {e.code} {msg}"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{slug(name)}.png").write_bytes(base64.b64decode(data["data"][0]["b64_json"]))
    u = data.get("usage", {})
    return f"{name}: ok {time.time() - t:.0f}s in={u.get('input_tokens')} out={u.get('output_tokens')}"


if __name__ == "__main__":
    RAW.mkdir(parents=True, exist_ok=True)
    names = sys.argv[1:] or [n for n in SUBJECTS if not (RAW / f"{slug(n)}.png").exists()]
    unknown = [n for n in names if n not in SUBJECTS]
    if unknown:
        raise SystemExit(f"Unknown card(s): {unknown}")
    key = openai_key()
    with ThreadPoolExecutor(4) as pool:
        for line in pool.map(lambda n: draw(n, key), names):
            print(line, flush=True)
