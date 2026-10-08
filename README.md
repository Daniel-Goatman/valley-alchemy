# Valley

An alchemy card table where a language model decides what you make. Drop one card on another and the model picks the result (or says nothing happens); the card's art is drawn the first time it appears, in a four-ink risograph style. Start with Water, Soil, Sun and Wind; make Life; add traits like Big, Wing, Fur or Tiny to grow new creatures.

`DESIGN.md` is the design doc. `docs/tasks/` has notes and evidence for each milestone.

## Run it

```bash
npm install
npm run server   # local recipe + art server on :8788
npm run dev      # game on http://localhost:5174
```

Requirements:

- Node 22+.
- An OpenAI API key. The server currently reads it from the macOS login Keychain (generic password, service `OpenAI API`); see `server/openai.mjs`.
- For card art, a Python with `Pillow` and `numpy` for post-processing (`VALLEY_PYTHON`, see `server/art.mjs`).

Recipes and generated art are cached in `data/` (git-ignored), so each pair is only ever asked once.

Modes: **Inventive** (default, built around making creatures), **Sensible** and **Wild**.
