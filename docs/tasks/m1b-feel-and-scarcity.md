# M1b — Card feel, cards used up, art direction (T2)

**Outcome:** card handling feels physical and satisfying, cards are a scarce resource (Daniel chose "used up"), and an art-direction study is ready for Daniel to choose from.

**Scope**
- Feel: smoothed drag with weight, tilt from drag speed, lift shadow, hover lift, target anticipation (lean, pulse), merge sequence (cards pull together, flash, particle burst, result pops), extra effects for a new discovery, refusal bounce-apart, landing dust, arrival animation.
- Scarcity: combining uses up the inputs (workers excepted). The codex becomes read-only (shows how each card was found). A day timer delivers basic cards (Water, Soil, Stone, Sun, Seed) each dawn so you can't get stuck.
- Art: 4-direction gpt-image-2 study of the six starting cards (≈ $0.50 of API use). **Daniel picks; no art decision is made without him.**

**Acceptance**
1. No console errors through drag, combine, refusal, and day deliveries (error listener on a fresh page).
2. Codex entries no longer spawn cards. Day deliveries add basic cards on a timer.
3. Each effect is visibly present (screenshots mid-animation, transform sampling).
4. Type check and build pass.
5. Style-study images saved in `art/explore/` and shown to Daniel.

**Tuning placeholders (to revisit while playing):** day length 40 s, 2 cards per dawn.

## Result (2026-10-07)

| # | Check | Evidence | Result |
|---|---|---|---|
| 1 | No console errors | Error listener on fresh pages through real-drag merge, refusal, worker merge, and 4 quick dawns → `[]` | Pass |
| 2 | Codex read-only, dawn deliveries | Clicking a codex entry spawns nothing; dawns add 2 basic cards each; codex shows "Beaver + Tree" under Log | Pass |
| 3 | Effects present | Mid-merge screenshot: NEW badge, sparkles; refusal flies the card back to its pickup spot; deliveries fall in tilted and land | Pass |
| 4 | Type check and build | tsc clean, vite build OK | Pass |
| 5 | Style study | 4 images in `art/explore/`, sent to Daniel; **Daniel chose D (riso print)** | Pass |

Fixed during testing: two deliveries picked the same spot (now reserved while in flight); refused cards landed on neighbours (now return to their pickup point); deliveries could overlap crowded tables (now a grid scan for the emptiest spot, 0 overlaps with 14 cards in a narrow pane).
Known limits: a worker's hop-aside can land on a neighbour; resizing doesn't re-clamp cards.

## Art decisions and restyle (2026-10-07, Daniel decided)

- Art: riso print, strictly 4 inks (teal, yellow, coral, deep blue), less cartoony. Anchor: `art/explore/e-riso-4ink.png`.
- Cards and table: A · Paper slip (`mockups/cards.png`). Applied in-game: paper table with grain, cream slips, teal misprint shadow plus a coral misprint when lifted, coral drop-target ring, Young Serif names in blue ink, yellow NEW tag and toast.
- Verified: fonts load before cards render (`document.fonts.check` true for both), held/target/new states screenshotted, 0 new errors after a dawn delivery, build OK.
- API spend so far: 6 images × ~1,372 output tokens ≈ $0.25.
- Note: the first headless-Chrome mockup render ran with Daniel's default Chrome profile (logged a harmless failed web-app install). Later renders use a throwaway profile in the scratchpad.

## Starter card art (2026-10-07)

- 32 cards drawn with gpt-image-2 (reference: the 4-ink sheet), processed to the riso palette, review sheet `art/cards/review.png`. **Daniel approved all 32.** Copied to `public/cards/`, manifest lists all 32.
- In game: every card shows its art (9/9 cards on the table rendered as sprites, 0 errors); the codex shows thumbnails; disc fallback stays for any card without approved art.
- Font loading now times out after 1.5 s so startup can't hang on the network.
- Total image spend to date ≈ $2.45 (6 study sheets ≈ $0.25, 33 card drawings ≈ $2.20).
- Not verified: headless-Chrome screenshots of the game render blank (Pixi needs a GPU context); verification used the in-app browser.
