# M2 + M3 — The valley, seasons and the Heart (T2)

Built in `~/Documents/valley-alchemy-next` (dev 5174, game server 8788) so the current game on 5173/8787 stays untouched.

**Outcome:** the table becomes the bottom strip of a hand-made river valley. Cards placed in their zone come alive there and the valley produces things each dawn. Seasons bring the Heart Spring's tribute requests, which give the year its stakes.

**M2 — Valley**
- Layout: the valley map fills the top of the screen; the card table is a strip along the bottom.
- Zones: river, meadow, grove, settlement open; marsh, hills, coast, sky locked until you discover a card whose habitat is that zone.
- Every card has a habitat (hand-written cards get one; generated cards already have one). Drop a card on its zone to place it; the wrong zone or a full zone bounces it back.
- Placed cards become small living sprites that move by kind (swim, flutter, wander, rooted…), on top of their idle motion. Click a sprite to take it back as a card.
- At dawn each zone produces from its residents by tag rules (trees drop seeds and logs, flowers and bees make honey, fish breed among reeds, grass gives hay) and some residents grow (sapling → tree, sprout → grass or flower).

**M3 — Seasons and the Heart**
- 4 seasons of 5 days per year. Each season the Heart Spring asks for tribute by tags, e.g. "something wet + something alive".
- Drop a card on the Heart to offer it. Meet the request and the valley flourishes (a reward card); miss it and the Heart loses 1 of 3 vitality. At 0 the year ends early.
- Year end: a summary, then a fresh valley and table. The Almanac and unlocked zones carry over.

**Aesthetics:** everything new (map, zones, sprites, Heart, panels) uses the approved riso paper-slip system but is **provisional until Daniel approves it**.

**Acceptance**
1. Both servers run side by side; the current game is unchanged.
2. Drag a card into its zone → a sprite appears and moves there; the wrong zone bounces it; clicking a sprite returns the card.
3. Dawn produces cards from zone rules and grows residents.
4. Discovering a card for a locked zone unlocks it.
5. The Heart shows its request; offering matching cards fills it; season end applies the reward or vitality loss; year end resets but keeps the Almanac and unlocked zones.
6. Type check and build pass, no console errors.

## Result, round 1 (2026-10-07)

Built in the copy (5174/8788); the current game (5173/8787) was left running and only got the Almanac drag (see below).

| # | Check | Evidence | Result |
|---|---|---|---|
| 1 | Side by side | Both stacks running; the copy has its own DB snapshot (65 cards, 255 recipes) and ports | Pass |
| 2 | Place / bounce / pick up | Beaver → Settlement/Village resident; Water → "doesn't live in the valley" and flew back; clicking a resident returned it as a card (needed a fix: the grain overlay blocked hit tests → `eventMode = 'none'`) | Pass |
| 3 | Dawn production and growth | Sprout planted in Meadow → Grass after 2 dawns; Grass produced Hay to the table | Pass |
| 4 | Unlock | Water + Water = Pond → "The Marsh opens!", saved to `valley.zones`, Pond placed in the Marsh | Pass |
| 5 | Heart and year | Sun offered → "something hot" met; season ended hungry → vitality 3 → 2; forced dry → "The spring runs dry" summary → new year reset the table/valley, kept the Marsh and 8 Almanac entries | Pass |
| 6 | Type check, build, errors | Clean; error listener `[]` throughout | Pass |

## Round 2: Daniel's redirect, a pannable full-screen world

- The map is drawn by gpt-image-2 (two options in `art/map/`, ~$0.18 each); **B (angled) wired in provisionally**; zones traced to it. Zones show only as map labels, a drop outline while dragging, and a paper fog when unexplored.
- Full-screen camera: drag the empty map or scroll to pan, ctrl+scroll/pinch to zoom (min = cover the screen, max 2.2×), clamped so the map always covers the view and clears the tray.
- Cards live in a paper tray along the bottom (cap 12).
- Almanac: floating paper panel with a 2-column grid of mini cards, collapsible to an ink tab, state saved; the tray narrows or widens with it.
- Verified: wheel pan (y -200), drag pan (y +100), ctrl-wheel zoom (105 → 191 px per 100 map units), Beaver placed in the Village, collapse/expand changes tray width 1008 ↔ 1280, no errors. Snapshot `data/snapshots/world-1.jpg`.
- Not verified: headless full-page screenshots (Pixi doesn't start there; the HTML parts render). The pane was 125 px tall, so checks used an emulated 1280×820 viewport.
- Also added to **both** copies: drag an Almanac entry onto the table/tray for a free copy (verified in 5173).
- Open aesthetic decisions for Daniel: map A vs B, whether to snap the map to the strict 4 inks, and the tray/Almanac/fog/label look.

## Round 3: "can't drag into any section", cramped (2026-10-07)

Cause: the starting cards (Water, Soil, Stone, Seed) had no habitat, so every drop was refused, with no hint why.
- Homes for basics: Water/Stone/Pebble → River, Seed/Soil → Meadow (Seed grows into Sprout), Log → Grove, Mud → Marsh. Sun stays a tray card.
- Drop hint next to the cursor while dragging over the world: "Let go to settle in the Meadow" (teal), "Water lives in the River", "Sun stays in your tray: combine it", or Heart offer/decline.
- Breathing room: the Almanac is hidden by default (remembers if you open it); the top bar is one compact row (title 30 px, "Spring 1/5", "Heart asks" with short words, no "Combining" label): 116 → 69 px tall at 1000 px wide; the tray is 144 px and floats 14 px off the edges; the world starts zoomed out (0.85).
- Verified at 1000×620: Seed → Meadow and Water → River settled (hint shown, teal); Sun refused with the hint; Almanac closed by default; no errors. Composite screenshot `docs/world-v2-1000x620.png`.
