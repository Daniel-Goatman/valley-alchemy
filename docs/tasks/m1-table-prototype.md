# M1 — Table prototype (T2)

**Outcome:** a playable card table in the browser. You can drag cards, stack one card on another to combine them using a hand-written recipe file, and discover new cards. No server, no API calls.

**Scope**
- Vite + TypeScript + PixiJS project in `~/Documents/valley-alchemy`.
- Start cards: Water, Soil, Stone, Sun, Seed, Beaver (DESIGN.md).
- Hand-written recipe file (~25 recipes) with tags and motion archetypes.
- Drag, drop onto a card to combine, pop-in for new results, idle motion archetypes, a codex counter, and a way to spawn more of a discovered card.
- Placeholder art only: flat coloured shapes plus the name. **Every aesthetic choice is a placeholder until Daniel approves it.**

**Out of scope:** the valley/zones, worker timers, seasons, server, LLM, image generation.

**Acceptance**
1. `npm run dev` serves the game with no console errors.
2. Dragging Water onto Sun makes the new card (per the recipe file), and the codex count goes up.
3. An unknown pair does nothing; the dragged card stays where it was dropped.
4. Cards idle with their motion archetype, and new cards pop in.
5. `npm run build` and the type check pass.

**Risk:** low (local only). Package installs go through the 12-day gate (`min-release-age=12` in ~/.npmrc plus the project .npmrc).

**Evidence:** build/type-check output, browser console check, and a scripted drag-to-combine check with screenshots.

## Result (2026-10-07)

| # | Check | Evidence | Result |
|---|---|---|---|
| 1 | Dev server, no console errors | Fresh reload with an error listener attached, two real mouse-drag combines → 0 errors | Pass |
| 2 | Water onto Sun → Cloud, count goes up | Real drag: inputs used up, Cloud pops in, "Discovered 7 / 32", saved in localStorage | Pass |
| 3 | Unknown pair does nothing | Stone onto Sun: shake, both cards kept; dropped card slides 34 px down so both stay readable | Pass (small change: nudge) |
| 4 | Idle motion and pop-in | Icon transforms sampled 400 ms apart: bob, drift and sway change, "still" stays put; pop-in seen in screenshots; worker recipe (Beaver + Tree → Log) keeps the Beaver | Pass |
| 5 | `npm run build` + type check | tsc 7.0.2 clean, vite build OK | Pass |

Bug found and fixed: a fast drag destroyed a card mid-animation, which threw inside the frame loop and froze rendering. Animations are now tied to an owner and stop when the owner is destroyed.

Known, deferred: `source-map-js` 1.2.1 has a high-severity DoS advisory (dev-time only). The fix, 1.2.2 (published 2026-09-30), fails the 12-day gate until 2026-10-12.
Review notes: resizing the window doesn't re-clamp cards already on the table, and the codex is hidden below 720 px width. Both are fine for a desktop prototype.
