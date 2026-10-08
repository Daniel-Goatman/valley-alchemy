# Valley (working title) — game skeleton

Status: skeleton v1, 2026-10-07. Decisions so far are marked **Decided**; everything else is a proposal to confirm or change.

## Pitch

A hand-made river valley that you grow. You combine cards on a table to discover new things (any combination, decided by a language model), then drag them into the valley, where they come alive as sprites: fish swim in the river, trees sway in the grove, animal folk build in the settlement. Every season the Heart Spring asks for tribute, so what you discover has to be put to use.

References: Stacklands / Cultist Simulator (cards that do work over time), Little Alchemy 2 (art), Infinite Craft (shared infinite recipes), Breath of the Wild's chemistry engine (tag rules).

## Decided

| Area | Decision |
|---|---|
| Genre | Stacklands / Cultist Simulator card loop plus alchemy combining |
| Art | **Risograph print, strictly 4 inks: teal, warm yellow, coral, deep blue, plus paper.** Flat shapes, overprint blending, slight grain and misregistration, stylised and *not* cartoony (Daniel, 2026-10-07). Style anchor: `art/explore/e-riso-4ink.png`. Earlier "Little Alchemy 2 flat" is replaced by this |
| Cards and table | **A · Paper slip** (Daniel, 2026-10-07): cream paper slips on a darker paper table with grain; the shadow is a misregistered teal print (a coral one appears when lifted); names in Young Serif, blue ink; coral ring for drop targets; yellow NEW tag. Mockup: `mockups/cards.png` |
| Setting | Grassland river valley with zones: river, meadow, grove, settlement, then more |
| Map | One hand-made valley. Zones unlock over time |
| Settlers | Animal folk (beavers, moles, otters…) |
| Unlocks | Discovering a key card for a habitat opens that zone |
| Placed cards | Turn into living sprites in their zone. Each zone holds a limited number. Click a sprite to pick it back up |
| Pressure | The Heart Spring wants tribute each season |
| Runs | One year = one run. Discoveries and the recipe cache carry over |
| Work rules | Hybrid: tag rules first, then the model for new cases, with every answer cached |
| World | Runs locally on Daniel's Mac, single player. One persistent cache for recipes and art, shaped so it could become a shared global world later |
| Art timing | Draw a card only when it's first used, not when it's discovered |
| Animation | Motion archetypes plus shader effects, no frame-by-frame art |
| Platform | Web: TypeScript + PixiJS client, small server |
| Theme limits | Everything stays within the valley's world: a pre-industrial storybook valley. Off-theme results get turned into valley versions (Lightning + Stone → "Spark Stone", never "Battery"). No real people, brands, or pop culture |
| Starting cards | Water, Soil, Stone, Sun, Seed, plus one worker: **Beaver**. Fire, Wind, Cloud and the rest have to be discovered |
| Fail state | The Heart Spring has 3 vitality. Each missed tribute costs 1. At 0 the spring runs dry and the year ends early. Otherwise a bad season only thins the valley |
| Carries over | Codex (every discovery, plus a recipe book for pairs you've already made), unlocked zones, and one keepsake card you choose at year end. The valley's contents and stats reset |
| Text model | A small OpenAI model with structured output (exact model chosen at milestone 4), for combine, work, and tribute judging. One API key for everything |
| Art model | OpenAI gpt-image-2 via the API. See "Art generation" below |

## Core loop

1. **Combine** two cards on the table → a new card (from the cache, or generated if the pair is new).
2. **Place** a card in its zone → it becomes a living sprite and starts acting in that zone.
3. **Work**: stack a worker on a target (an otter on the river, a beaver on a log), or let a zone tick on its own. Outputs come back to the table as cards.
4. **Tribute**: by the end of each season, give the Heart Spring what it asked for (by tags, e.g. "2 alive + 1 wet").
5. **Year end**: summary of the year. The valley resets. Your codex of discoveries stays, and so does everyone's shared cache.

## Screen layout

- **Valley (top, ~70%)**: the hand-made map. The Heart Spring sits at the river's source. Zones are regions of the map, and locked zones are drawn as faded areas.
- **Table (bottom strip)**: your cards. All combining happens here.
- **HUD**: season and day, the Heart's current request, and the codex button.

## Cards

Every element, whether hand-made or generated, has the same structure:

```ts
type Element = {
  id: string;
  name: string;            // display name
  key: string;             // canonical lowercase name, used to match duplicates
  tags: Tag[];             // 2–5 tags from the fixed vocabulary
  habitat: Habitat | null; // the zone it lives in; null = stays on the table (Fire, Rope, Idea)
  motion: Motion;          // idle archetype
  locomotion: Locomotion;  // how it moves once it lives in a zone
  shader: Shader | null;   // optional effect
  uses: number | null;     // null = permanent; otherwise used up after n uses
  flavour: string;         // one line of text
  art: { status: "none" | "queued" | "ready"; path?: string };
  firstAt?: string;        // when it was first discovered
};
```

**Fixed vocabularies** (the model has to pick from these lists, which is what lets new cards plug into the game's rules):

- **Tags (draft, ~30):** hot, cold, wet, dry, alive, plant, animal, fish, bird, insect, folk, edible, sweet, poison, flammable, hard, soft, wood, stone, metal, seed, fertile, tool, building, light, heavy, liquid, gas, magic, shiny
- **Habitats:** river, meadow, grove, settlement, then marsh, hills, coast, sky (locked to start). `null` means the card stays on the table.
- **Motion (idle):** bob, sway, flicker, jiggle, pulse, float, drift, rise, settle, breathe, twinkle, spin, wobble, droop, shiver, still
- **Locomotion (in a zone):** rooted, swim, dart, hop, waddle, scurry, crawl, flutter, glide, graze, wander, drift-downstream
- **Shaders:** ripple, heat-haze, glow, shimmer, frost, wind-bend, plus particle emitters (embers, drips, pollen, smoke, sparkles, bubbles) chosen by tag

## Zones

Each zone has a capacity, an accepted habitat, and its own timer rules.

| Zone | Starts | Example zone rule |
|---|---|---|
| River | open | Reeds + fish → more fish each day. Cold season → frozen, no swimming |
| Meadow | open | Flowers + insects → pollen / honey. Grazers eat plants |
| Grove | open | Trees drop seeds and wood. Mushrooms appear in wet weather |
| Settlement | open | Buildings are stations: a mill turns grain into flour, a kiln turns clay into bricks |
| Marsh / Hills / Coast / Sky | locked | Open when you discover a card whose habitat is that zone |

## Seasons and the Heart

- A year has 4 seasons of N days each (one day is about 60 seconds of real time, to tune). Seasons change zone rules: spring growth, summer heat, autumn harvest, winter frost.
- Each season, the Heart Spring asks for tribute described **by tags**, so any card that fits counts, including ones nobody has made before.
- Meeting the request: the valley flourishes and you get a reward (a rare card, extra capacity). Missing it: the valley wilts, and some zones lose capacity or creatures. **To decide:** whether a run can end early.

## Generation

### Combining two cards

```
pair key (sorted canonical names) → recipes table
  hit  → result (or "nothing happens")
  miss → one structured model call → { valid, name, tags, habitat, motion, locomotion, shader, uses, flavour, artPrompt }
       → canonicalise the name; if it already exists, reuse that element
       → otherwise create a new element with art.status = "none"
       → save to recipes
```

### Work (hybrid)

```
(worker, target) → work-rules cache
  miss → tag rule table (e.g. folk+tool on wood → planks)
  miss → model call → { outputs, duration } → save to the cache
```

### Art, drawn when first used

- A new card shows a flat silhouette in its habitat's colour, with its name.
- The first time a card is **placed in a zone or used in a work stack**, an image job is queued. The art is cached from then on.
- Image pipeline: the art prompt plus fixed style text plus 4–6 reference images from the hand-made set → image model → remove background → trim and centre → resize to the fixed size → snap to the valley palette → save.
- The hand-made starter set (~50 elements) defines the style and serves as the reference images.

## Art generation

**Decided: OpenAI gpt-image-2 through the API**, using the existing key in the macOS Keychain. Quality setting (low ≈ $0.01 vs medium ≈ $0.06 per image) gets settled in a quick comparison.

Pipeline (built, `tools/`): `draw_cards.py` sends the subject + fixed riso style text + the anchor sheet (`art/explore/e-riso-4ink.png`) as a reference image to gpt-image-2 `/images/edits` on a plain white background (that endpoint can't return transparency for gpt-image-2) → `process_cards.py` removes the white connected to the edges, snaps every pixel to the 4 inks + their overprints + paper at full resolution (keeps the grain), trims, centres, and downsizes to 256 px → `review_sheet.py` builds a numbered review sheet → approved icons are copied to `public/cards/` and listed in `manifest.json`. The processing step needs Pillow + NumPy (currently run with the Narrato venv's Python). In-game cards are drawn with **gpt-image-2.5-flare at low quality with a 768 px reference** (Daniel, 2026-10-07: about 11 s; comparisons in `art/quality-test/` and `art/speed-test/`), Pre-drawing exists but is **off** (Daniel, 2026-10-07; `VALLEY_PREDRAW=on` enables it). The 32 starter cards were drawn at medium.

**Style-reference set:** about 12 anchor images plus the ~50-card starter set, made in **Codex** (included in the ChatGPT plan), then hand-picked. Never use Little Alchemy 2's art as model input. It's copyrighted and only a mood reference.

**Cost:** local and single-player, so cost is just the cards you draw. A few hundred cards ≈ $3–30 depending on the quality setting. Text calls ≈ $0.002 per new combination. Guard: a daily spending cap in the local server config. When the cap is hit, cards stay as silhouettes.

**Quality comparison (milestone 5, ~30 min, < $3):** draw the same 20 elements at low and at medium quality with the same anchors. Score them on matching the anchors, readability at 64 px, clean edges, and speed. Pick the cheapest setting that passes.

Considered and dropped for now: Recraft V4 vector (exact palette control, but a second account and key; revisit if colours drift too much), Nano Banana 2, local FLUX (too slow per image).

## Architecture

- **Client:** Vite + TypeScript + PixiJS. Handles the table, the valley scene, sprites, shaders, and local save state.
- **Local server:** Node + SQLite, running on localhost. Owns the cache, stores images, and makes every model call. Reads the OpenAI key from the macOS Keychain at startup, so the key never reaches the browser or a file. Enforces the daily spending cap.
- **Models:** OpenAI for both. A small text model for combine and work decisions, and gpt-image-2 for art.
- **Tables:** `elements`, `recipes(a, b → result | null)`, `work_rules(worker, target → outputs, duration)`, `discoveries(element, at)`, `saves(run_state)`. A `players` table can be added if the world is ever shared.
- Every package must follow the 12-day package-age rule.

## Milestones

1. **Table prototype:** cards, drag, stack, and combine using a hand-made recipe file. No server.
2. **Valley v0:** the river and meadow zones. Placed cards become sprites with 4–6 motion and locomotion archetypes.
3. **Seasons and Heart:** day and season timers, tribute requests by tag, year end.
4. **Infinite combining:** local server, cache, and model-generated elements (silhouettes only).
5. **Art when used:** the image pipeline, the reference set, and post-processing.
6. **Work and zone rules:** the tag rule table, worker stacks, and model fallback.
7. **Polish:** shaders, particles, the codex, unlocking marsh, hills and coast.

## Open questions

- [ ] Final name.
- [ ] Who makes the ~12 style-anchor images (hand-drawn, or generated then picked and touched up)?
- [ ] Tuning: day length, tribute difficulty, zone capacities (decide while playing milestone 3).
