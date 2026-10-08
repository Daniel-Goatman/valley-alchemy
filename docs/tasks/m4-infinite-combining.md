# M4 — Infinite combining (T2)

**Outcome:** any two cards can be combined. Pairs that aren't in the hand-written recipes go to a language model, which either invents a new card (in the valley's world) or says nothing happens. Every answer is cached, so a pair is only ever decided once. New cards get art drawn the first time they're used, in the approved riso style.

**Scope**
- Local server (`server/`, Node built-ins only: `node:http`, `node:sqlite`, `fetch`), bound to 127.0.0.1:8787. Seeds the database from `src/data/elements.ts` and the approved art in `public/cards/`.
- Combining: `gpt-5.4-mini` with a strict JSON schema; output validated against the fixed vocabularies (tags, habitat, motion, ink). World guardrails from DESIGN.md (pre-industrial storybook valley; no modern tech, brands, real people).
- Name matching: if the model names an existing card, the existing card is reused.
- Art when used: when a card is an input to a successful combination and has no art yet, a drawing job is queued (gpt-image-2 + the anchor sheet → `tools/process_cards.py`). The client polls and swaps the art in live.
- Spending cap: estimated spend per day is tracked in the database; the default cap is $3/day (`VALLEY_DAILY_CAP_USD`). Over the cap, combining falls back to known recipes and art stays as discs.
- OpenAI key read from the macOS Keychain at server start, kept in memory only.
- Client: async combine with a "thinking" state, open-ended discovery count, live art swap, offline fallback.

**Acceptance**
1. A known pair still combines instantly with no server call.
2. A new pair returns a valid new card (or "nothing") within a few seconds, and asking again returns the cached answer with no model call.
3. A card used as an input gets art drawn, processed, and swapped onto the table without a reload.
4. With the server stopped, the game still runs on known recipes.
5. Type check and build pass, and there are no console errors.

**Risk:** API spend (bounded by the cap); model output quality (validated, cached, can be edited in the DB).

## Result (2026-10-07)

| # | Check | Evidence | Result |
|---|---|---|---|
| 1 | Known pair is instant, no model call | Water + Sun → Cloud from the seed cache (server log shows no cost); offline it still works | Pass |
| 2 | New pair decided, then cached | Stone + Sun → Warm Stone in 4.0 s ($0.0013); repeat → cached in 0.0 s. Beaver + Water → existing Dam, Stone + Stone → existing Pebble (name reuse works). Real drag Seed + Sun → Sprout with the thinking state shown | Pass |
| 3 | Art when used, swapped live | Warm Stone (disc) used in Water + Warm Stone → Steam; server logged "art: Warm Stone ready"; the card on the table swapped to riso art about 29 s later, no reload | Pass |
| 4 | Server stopped → known recipes only | Offline notice shown, seed art loads from the manifest, Water + Sun merges, Stone + Seed refused | Pass |
| 5 | Type check, build, errors | tsc clean, vite build OK, error listener `[]` in every run | Pass |

Spend: 7 model recipes + 1 drawing ≈ $0.076 (database `spend` table).
Found while testing: a Vite config created while the dev server is running isn't picked up (restart needed); a background browser tab pauses the game loop (normal browser behaviour).

## Round 2: Daniel's feedback (2026-10-07)

Problems found in the log: the model never said "nothing" (0 of 11), forced matches onto existing cards (Seed Bed + Beaver = Dam), and made lazy "adjective + card" names (Sun + Beaver = Golden Beaver).

| Change | Evidence |
|---|---|
| Stricter prompt: both cards must clearly contribute, "nothing" is normal, no forced reuse, no lazy adjectives, worker examples, good/bad examples | `tools/eval_combos.mjs` on 24 pairs: 14/24 nothing; Sun + Water = Cloud, Wind + Cloud = Rain, Beaver + Tree = Log, Mud + Hay = Cob; Grove + Beaver and Seed + Brick = nothing. `effort: none` was 1.5 s faster but worse (Grove + Beaver = Dam), so we kept `low` |
| Old model results cleared (backup `data/valley-backup-2026-10-07-prompt-v1.db`) | 11 recipes, 5 cards removed; seed data untouched |
| Pre-deciding pairs on the table (text only, 3 at a time, under the cap) | All 11 untried starting pairs decided within 10 s of load; later drops on those pairs answer from cache |
| "hmm…" bubble while deciding; "!" or "nothing happens" verdict; hidden for answers under 150 ms | Screenshot of "hmm.." over Bee + Caramel, which then refused with no errors |
| Art when created (`VALLEY_ART_ON=create`, default) with a riso "printing" press on the card, then a top-to-bottom reveal | Honey + Fire = Caramel in 3.1 s showing PrintingIcon; art landed 27 s later and swapped in |
| Art files reused instead of redrawn; failed drawings retry | Code path in `server/art.mjs` |
| Dawn deliveries weighted by usefulness, plus Rain/Cloud/Wind once discovered | 2,000-sample check: Stone 1% with a Stone pile; Sun 46% with plants on the table |

## Art quality (2026-10-07, Daniel decided: low)

- Comparison of 6 cards at low vs medium (`art/quality-test/compare.png`): low ≈ 20 s and $0.019 per card, medium ≈ 35 s (one took 80 s) and $0.066 per card. After riso processing they look nearly identical at card size.
- Server default is now `VALLEY_ART_QUALITY=low`. Verified in game: Fish + Sun = Dried Fish, decided in 2.8 s, art on the card at 18 s total (was about 30 s), no errors.

## Deliveries redesign (2026-10-07, Daniel approved the design)

Cause of the flood: the "stuck → early dawn" rule. With stricter combining and pre-deciding, the table counted as stuck almost all the time, so dawn fired every ~2 s with no cap. Water also always won the old "number of recipes" score.

New rules: deliveries only at dawn (stuck now nudges the Next day button instead); table cap 16; never deliver a third copy; each dawn = a **missing piece** (the basic or discovered weather card that completes the most valuable recipe you haven't made yet with the table) + a **wildcard** (25%: a discovered advanced card that unlocks something; otherwise another missing piece). The client syncs every decided pair from the server (`GET /api/recipes`), so model-made recipes count too. Local answers are only used when the result card's details are known.

| Check | Evidence |
|---|---|
| Daniel's case (Seed, Water×2, Cloud×2, Beaver) | 400 runs: Soil 63%, Sun 37%, never Water or Cloud |
| Cap | 16 cards → no delivery; 15 → one |
| No flood when stuck | Stone + Beaver only: still Day 1 after 5 s; `canCombine` false |
| Recipe sync | Client has 103 recipes matching the server; `beaver|stone` = nothing |
| Not verified | The Next-day nudge animation: the browser pane was hidden, so the game loop was paused during the check |

Note: on the starting table the missing piece is almost always Soil + Water, because those unlock the most new recipes. Variety comes once you combine.

## Bug: Storm had no art (2026-10-07)

Cause: Storm was decided by pre-deciding (text only, no art). When Daniel made it, the client answered from its synced cache, so the server never heard the card was made and art-on-create never ran. 9 pre-decided cards were in the same state.
Fix: `POST /api/art/request` (respects `VALLEY_ART_ON`); the client calls it from `onCombine` whenever a card without art is made (and shows the printing press immediately), and the art poll requests art for any card on the table still at `none`.
Verified: the endpoint drew Storm + Drizzle in about 20 s; a Storm disc already on the table switched to its art through the poll; no errors. Not verified live: the cached-answer combine path, because the browser pane was hidden (game loop paused); covered by the same request call.

## Wild mode, motion from art, HUD v2 (2026-10-07)

- **Wild mode** (toggle in the HUD, saved per browser): the server uses a wild prompt (always make something, playful but in-world, both cards contribute, no lazy adjectives) and caches its answers under `wild:` keys, so they never mix with sensible answers. Sensible results that make something still apply in wild mode. Pre-deciding and deliveries follow the current mode. Verified: Bee + Hay = Haycomb, Rainbow + Brick = Mosaic Wall, Grove + Beaver = Lodge Grove, Beaver + Sun = Suntrap (all "nothing" in sensible, which stayed unchanged); Water + Sun = Cloud in both; repeats cached.
- **Motion chosen from the art**: after each drawing, a gpt-5.4-mini vision call looks at the processed icon and picks the motion from described options (spin only for round, face-on things). Re-picked for 9 existing generated cards (~$0.006 total): Storm spin → drift, Caramel settle → jiggle, Driftwood drift → settle. Cards recompute their pivot when motion changes.
- **HUD v2** (`docs/hud-v2.jpg`): prototype pill removed; "Codex" renamed "Almanac"; title 44 px with a coral misprint; day shown on a paper slip with a hatched teal track, a sun marker and an ink "Next day →" button (coral when nudging); Sensible/Wild segmented toggle; cards start below the HUD (`TABLE_TOP = 196`). No errors; build OK.
- Not verified live: a wild combine through the client UI (pane hidden, game loop paused); verified through the API instead.

## Faster art and drag (2026-10-07)

- Speed test (`art/speed-test/compare.png`): every OpenAI setup bottoms out around 10–12 s. gpt-image-1-mini was fastest but broke the style (dark background, random raindrop inks). Daniel chose **gpt-image-2.5-flare + 768 px reference** (about 11 s, half the input cost).
- Progressive preview: tested streamed partial images. At low quality none are sent; at medium the first partial arrives at about 10.7 s, after a low-quality drawing would already be done. **Not built**: it can't show anything earlier. The printing animation stays.
- **Pre-drawing**: when pre-deciding invents a new card, its art is queued in the background (player-made cards jump the queue). Max 40 per day; at most 4 queued in wild mode. Verified: wild prefetch on Pebble/Reed/Honey → Marsh Rattle, Honey Nugget, Honey Pipe pre-drawn (motions sway and wobble picked from the art); the player's Pebble + Reed then returned Marsh Rattle in 0.00 s with art `ready`.
- **Drag**: the held card now moves on the pointer event itself (no easing); the lean uses a smoothed speed; the pickup lift/zoom springs are about twice as stiff. Verified with synthetic pointer events: 0 px between pointer and card on every move (it was eased before).
