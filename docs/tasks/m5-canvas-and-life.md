# M5 — Back to the canvas; building blocks for life (2026-10-08)

Daniel: remove the map entirely, keep the Almanac, cards on the canvas; combining is too closed ("I can't make loads of different animals").

**Decided (Daniel):** remove all valley systems (map, areas, residents, Heart, seasons); cards free on the full canvas; add a Life card, trait cards, an Inventive mode and creature blends.

## Done
- Valley layer shelved (not deleted) in `docs/shelved/valley-map-v1/` with a README. The canvas `main.ts` came from the original game and keeps the collapsible Almanac (hidden by default), drag-from-Almanac, the HUD row and the three-way mode toggle.
- **Life** (Pond + Sun, hand-written) and nine **trait** cards: Fur, Feather, Shell, Fin, Wing, Horn, Tiny, Big, Night (tag `trait`, reserved; the server strips it from generated cards). Art drawn at medium with gpt-image-2 + the anchor sheet (≈ $0.66); review sheet `art/cards/life-traits-review.png`, **installed provisionally pending Daniel's look**.
- Hand-written data is now authoritative in the DB (seed rows replace earlier model answers for the same name or pair).
- **Inventive mode (default)**: own cache (`inv:`), uses sensible results that make something. Rules: Life + element/plant/place → a simple creature; creature + trait → a new species (real if one fits, else storybook); creature + creature → blend; trait + Life → a first creature; trait + lifeless only when it clearly fits; two traits → nothing; creatures tagged alive + animal.
- Deliveries: Life joins the dawn pool once discovered; with Life or a creature on the table, the wildcard is a trait 45% of the time.

## Evidence
- Prompt check (`node tools/eval_combos.mjs low inventive life`): 23/24 pairs make something. Life + Water = Tadpole, Life + Soil = Worm, Life + Wind = Moth, Life + Feather = Chick, Fish + Wing = Flying Fish, Bee + Big = Bumblebee, Bee + Night = Moonmoth, Bee + Fish = Pollenfin; Fur + Wing = nothing. Median 5.7 s (pre-deciding hides most of this on the table).
- In game (5174): Pond + Sun = Life (local), Life + Water = Tadpole, Tadpole + Wing = Pondwing, Fish + Fur = Seal; their art was drawn and swapped in; a dawn brought Horn; no errors; type check and build pass. Snapshot `data/snapshots/canvas-life.jpg`.
- Weak spots seen: some lifeless pairs got loose compound names (Sun + Stone = Sunstone, Honey + Brick = Honeybrick).

## Round 2 (2026-10-08): Daniel approved the 10 designs; tightened lifeless pairs
- Inventive rule 8: two lifeless cards need an obvious, real, familiar result; no invented compound names (storybook names are for creatures only); when in doubt, nothing.
- Prompt check: lifeless set 7/12 nothing (Honey + Brick, Rain + Brick, Sun + Honey… now nothing; Clay + Fire = Brick, Water + Soil = Mud, Stone + Stone = Cairn kept; Sun + Stone = Sunstone, a real gemstone). Life set still 22/24 make something.
- Cleared 6 saved lifeless Inventive answers (Halo Stone, Sunpod, Marl, Nut, Dust, Seed Pod) after backing up to `data/valley-backup-2026-10-08-before-lifeless.db`; the server was restarted with the new prompt.
- Follow-up: Seed + Sun still gave "Sunseed" (a seed counts as a plant, so the model didn't apply the lifeless rule). Rule 8 now covers plants, seeds and things, and says a plant with what it needs grows to its next stage (Seed + Sun = Sprout). Cleared `inv:seed|sun` and `inv:stone|sun`, restarted. Live check: Seed + Sun = Sprout, Grass + Stone = Moss, Flower + Rain = Bloom, Life + Flower = Bee, Stone + Sun = Sunstone (a real gem). The 10 new card designs were approved by Daniel.

## Round 3 (2026-10-08): start cards and archive
- Start cards are now just the elements: Water, Soil, Sun, Wind (Daniel). Verified on a fresh save: the table and Almanac show those 4.
- Old-system cards were leaking in (e.g. Pebble Bloom, from yesterday's wild test, reached via the sensible fallback). Archived, not deleted: every model-made sensible and wild answer (542) and the model cards only they produced (140) moved to `recipes_archive` / `elements_archive` in `data/valley.db` (backup `data/valley-backup-2026-10-08-before-archive.db`). Kept: hand-written data and the Inventive answers (136 at the time) with their 87 cards. The server serves 135 cards and nothing produces Pebble Bloom. To restore: copy rows back from the archive tables.

## Round 4 (2026-10-08): out of credits, pause, Almanac round view, both cards consumed
- Missing art (Seed Pod, Sun Moth): the OpenAI account ran out of credits (`429 credit_balance_exhausted`, confirmed with one tiny call). The server now recognises it, pauses all model/art/prefetch calls for 5 min instead of hammering, leaves art as `none` (retried later) instead of `failed`, and the game shows "OpenAI credits have run out…". Verified: first call hit the error once (1.1 s), the next answered instantly with `reason: credits`, known recipes still work, and the 2 failed cards were reset to `none`.
- Day pause button: stops the day timer, so no deliveries (Next day still works by hand). Verified by stepping the ticker: bar frozen at 21.7% while paused, advanced after resume.
- Almanac: "This round" (default: start cards + everything made since the page loaded) / "All time" toggle. Verified: with Tadpole and Cloud saved from before, round = 4 (the elements), all time = 6.
- Both cards are now always consumed. Cause: 16 cards were flagged `worker` (Beaver plus many model creatures like Bee Folk, Mole, River Otter), and workers survived a combination by design. The rule and the worker card outline are removed. Verified: Beaver + Water = River Otter with both inputs gone.
- Note: the pane was hidden (no animation frames), so these checks drove `app.ticker.update()` by hand.
- Refusal bounce (both versions): a refused card now hops just clear of the card it was dropped on (direction = from target to drop point; dead-centre drops bounce toward where it came from), instead of flying back to its pickup point or, for Almanac drags, a free spot that could be far away. Verified: Wing dropped on Fur landed 114 px from Fur (the old behaviour would have sent it ~410 px), no errors.
- Deliveries land near the middle: `freeSpot` now picks the non-overlapping spot closest to the table's centre (with jitter), falling back to the emptiest spot when full. Verified: 6 deliveries landed at y 305–455 around the table midline (316 on a 540 px pane), none at the bottom edge.
- Dawn deliveries are logged in the Almanac (this round, and all time as "Arrived at dawn" when new). Verified: Seed appeared in "This round".
- Bin (bottom left): fades in only while dragging, turns coral with the lid tipped when a card is over it (generous hit area), and dropping there removes the card with a puff. New table hook `dropOn`. Verified: show → hot → removed (11 → 10 cards) → hidden. 5174 only.
