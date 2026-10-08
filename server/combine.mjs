// Decides what two cards make, using the shared cache first and the language model for new pairs.
import { HABITATS, INK_COLORS, MOTIONS, TAGS } from '../src/data/elements.ts';
import { addSpend, elementNames, getElement, getRecipe, recipeKey, saveElement, saveRecipe } from './db.mjs';
import { costOf, creditsOut, structured } from './openai.mjs';

export const TEXT_MODEL = 'gpt-5.4-mini';

export const SYSTEM = `You decide what happens when a player combines two cards in "Valley", a gentle card game set in a storybook river valley.

The world: a pre-industrial, hand-made river valley. Nature, weather, seasons, plants, animals, simple crafts, and small animal folk (beavers, otters, moles, hedgehogs...) who build and work. No humans.

How to decide:
1. Ask: is there an obvious, direct thing these two make together, something a ten-year-old would guess straight away? BOTH cards must clearly contribute to the result.
2. If there is an obvious result, always give it. If there isn't, set valid to false: many pairs make nothing, and a weak or far-fetched link is worse than no result.
3. Prefer the simplest, most literal result. Think one step, not a story.
4. Workers (animal folk) combined with a material do what that animal naturally does with it: Beaver + Sapling = Log (beavers gnaw young trees), Beaver + Log = Dam.
5. Reuse an existing card only if it is exactly what these two make. Never bend a pair to fit an existing card.
6. Avoid lazy names that just put an adjective on one input (Golden Beaver, Sunny Stone, Wet Seed). Use a real, familiar thing instead (Smoked Fish is fine because it is a real thing).
7. Stay inside the world: no modern technology, machines, electricity, brands, real people, places, pop culture, weapons, or anything violent, gross or crude. If the obvious answer is modern, give the valley version (Lightning + Stone = Spark Stone).
8. The result must differ from both inputs. Combining a card with itself is allowed (Water + Water = Pond).

Good: Water + Fire = Steam. Seed + Soil = Sprout. Clay + Fire = Brick. Fish + Fire = Smoked Fish. Bee + Flower = Honey. Beaver + Sapling = Log. Water + Sun = Cloud (warm water rises). Wind + Cloud = Rain. Beaver + Stick = Dam.
No result (valid false): Sun + Beaver. Seed Bed + Beaver. Stone + Seed. Honey + Stone. Rainbow + Brick.

Fields:
- name: 1 to 2 words, Title Case, singular.
- tags: 2 to 5 from the allowed list.
- habitat: where it lives in the valley, or "none" for things that stay on the table (fire, tools, food).
- motion: how its icon idles on a card.
- worker: true only for animal folk who can do work.
- ink: the riso ink closest to its main colour.
- flavour: one short, warm sentence of card text, under 12 words.
- art_subject: a short plain description of one simple icon to draw.
If valid is false, fill the other fields with empty or default values.`;

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['valid', 'name', 'tags', 'habitat', 'motion', 'worker', 'ink', 'flavour', 'art_subject'],
  properties: {
    valid: { type: 'boolean' },
    name: { type: 'string' },
    tags: { type: 'array', items: { type: 'string', enum: [...TAGS] } },
    habitat: { type: 'string', enum: [...HABITATS, 'none'] },
    motion: { type: 'string', enum: [...MOTIONS] },
    worker: { type: 'boolean' },
    ink: { type: 'string', enum: Object.keys(INK_COLORS) },
    flavour: { type: 'string' },
    art_subject: { type: 'string' },
  },
};

// Wild mode: the player asked for every pair to make something, so lean into fun interpretations.
export const WILD_SYSTEM = SYSTEM
  .replace(/How to decide:[\s\S]*?No result \(valid false\):[^\n]*\n/, `How to decide (WILD MODE: the player wants every pair to make something):
1. Always make something. Set valid to true.
2. Find the most fun interpretation that still makes sense once you hear it: playful, surprising, a little silly, storybook logic. Puns and gentle jokes are welcome.
3. Both cards must still visibly contribute to the result.
4. Avoid lazy names that just put an adjective on one input (Golden Beaver). Invent a real little thing, creature, craft or happening instead.
5. Stay inside the world: no modern technology, machines, electricity, brands, real people, places, pop culture, weapons, or anything violent, gross or crude.
6. The result must differ from both inputs.

Wild examples: Sun + Beaver = Sunbather. Honey + Stone = Honeystone. Rainbow + Brick = Painted Wall. Beaver + Seed Bed = Beaver Garden.
`);

// Inventive mode (the default since 2026-10-08): sensible, but Life, traits and creatures open up whole branches.
export const INVENTIVE_SYSTEM = SYSTEM
  .replace(/How to decide:[\s\S]*?No result \(valid false\):[^\n]*\n/, `How to decide (INVENTIVE MODE: sensible, but life is a building block):
1. If there is an obvious, direct result, give it.
2. Life is the building block of creatures. Life + an element, plant or place makes a simple creature that lives in or with it: Life + Water = Tadpole, Life + Soil = Worm, Life + Wind = Moth, Life + Tree = Squirrel, Life + Flower = Bee.
3. Trait cards (Fur, Feather, Shell, Fin, Wing, Horn, Tiny, Big, Night) turn a creature into a new species with that trait. Use a real animal when one fits (Mouse + Wing = Bat, Worm + Shell = Snail, Beetle + Night = Firefly, Tadpole + Big = Frog). Otherwise invent a believable storybook species with a fitting one- or two-word name.
4. Two creatures blend into a hybrid or into a real animal that sits between them (Fish + Bird = Flying Fish, Frog + Mouse = Leaping Mouse).
5. A trait on Life gives a first creature with that trait (Life + Feather = Chick, Life + Shell = Snail). A trait on a lifeless thing makes something only if it clearly makes sense (Stone + Shell = Fossil); otherwise nothing.
6. Two traits together make nothing.
7. Every creature result must be tagged alive and animal, plus fish, bird or insect where it fits.
8. Pairs with no Life, no creature and no trait (plants, seeds and things count here too): be strict. Only give a result if it is an obvious, real, familiar thing everyone would name (Clay + Fire = Brick, Water + Soil = Mud). Never invent a compound or portmanteau name for these pairs (no Honeybrick, Sunseed, Mudpie Rock); a plant with what it needs grows to its next stage instead (Seed + Sun = Sprout). Invented storybook names are only for creatures. When in doubt, nothing.
9. Avoid lazy names that just put an adjective on an input (Golden Beaver) unless it is a real species (Horned Toad is fine).
10. Stay inside the world: no modern technology, machines, electricity, brands, real people, places, pop culture, weapons, or anything violent, gross or crude.
11. The result must differ from both inputs.
`);

const NAME_OK = /^[A-Z][A-Za-z'-]*( [A-Z][A-Za-z'-]*)?$/;

function cleanName(raw) {
  const name = raw.trim().replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return NAME_OK.test(name) && name.length <= 24 ? name : null;
}

const inFlight = new Map();
/** Called with a card's name when pre-deciding invents a brand-new card (used to pre-draw its art). */
let onPrefetchedNewCard = () => {};
export function whenPrefetchFindsNewCard(fn) {
  onPrefetchedNewCard = fn;
}
const prefetchQueue = [];
let prefetching = 0;
const PREFETCH_CONCURRENCY = 3;

/**
 * Decide pairs in the background before the player tries them, so drops answer instantly.
 * Text only: no art is drawn for pre-decided results until a player actually makes them.
 */
export function prefetch(pairs, canSpend, mode = 'sensible') {
  for (const [a, b] of pairs) {
    if (cachedAnswer(a, b, mode) !== undefined) continue;
    const key = recipeKey(a, b, mode);
    if (inFlight.has(key) || prefetchQueue.some((p) => p.key === key)) continue;
    prefetchQueue.push({ a, b, key, canSpend, mode });
  }
  pumpPrefetch();
  return prefetchQueue.length;
}

function pumpPrefetch() {
  while (prefetching < PREFETCH_CONCURRENCY && prefetchQueue.length) {
    const { a, b, canSpend, mode } = prefetchQueue.shift();
    if (!canSpend() || creditsOut()) continue;
    prefetching++;
    combine(a, b, { allowModel: true, mode })
      .then((out) => {
        if (!out.fresh) return;
        console.log(`prefetch${mode !== 'sensible' ? ` (${mode})` : ''}: ${a} + ${b} = ${out.result?.name ?? 'nothing'}`);
        if (out.result && out.result.art === 'none') onPrefetchedNewCard(out.result.name, mode);
      })
      .catch((err) => console.error(`prefetch: ${a} + ${b} failed: ${err.message}`))
      .finally(() => {
        prefetching--;
        pumpPrefetch();
      });
  }
}

/**
 * Result of combining a and b: { result: ElementDef | null, fresh: boolean, cost: number }.
 * `fresh` means the model decided it just now (first time anyone made this pair).
 */
/**
 * The cached answer for a pair in a mode: a card, null (nothing happens), or undefined (never decided).
 * Wild mode uses a sensible result when there is one, and its own cache otherwise.
 */
function cachedAnswer(a, b, mode) {
  const sensible = getRecipe(a, b, 'sensible');
  if (mode === 'sensible' || sensible) return sensible;
  return getRecipe(a, b, mode);
}

export function combine(a, b, { allowModel, mode = 'sensible' }) {
  const cached = cachedAnswer(a, b, mode);
  if (cached !== undefined) return Promise.resolve({ result: cached, fresh: false, cost: 0 });
  if (!allowModel) return Promise.resolve({ result: null, fresh: false, cost: 0, capped: true });
  if (creditsOut()) return Promise.resolve({ result: null, fresh: false, cost: 0, capped: true, reason: 'credits' });

  const key = recipeKey(a, b, mode);
  if (!inFlight.has(key)) {
    inFlight.set(key, decide(a, b, mode).finally(() => inFlight.delete(key)));
  }
  return inFlight.get(key);
}

export function userPrompt(a, b) {
  return `Combine: "${a}" + "${b}".\nExisting cards: ${elementNames().join(', ')}.`;
}

async function decide(a, b, mode) {
  const user = userPrompt(a, b);
  const system = mode === 'wild' ? WILD_SYSTEM : mode === 'inventive' ? INVENTIVE_SYSTEM : SYSTEM;
  const { data, usage } = await structured(TEXT_MODEL, system, user, 'card', SCHEMA);
  const cost = costOf(TEXT_MODEL, usage);
  addSpend(cost);

  const name = data.valid ? cleanName(data.name) : null;
  const same = name && [a, b].some((n) => n.toLowerCase() === name.toLowerCase());
  if (!name || same) {
    saveRecipe(a, b, null, 'model', mode);
    return { result: null, fresh: true, cost };
  }

  // Reuse an existing card with the same name rather than creating a duplicate.
  let result = getElement(name);
  if (!result) {
    // 'trait' is reserved for the hand-made trait cards.
    const tags = [...new Set(data.tags)].filter((t) => TAGS.includes(t) && t !== 'trait').slice(0, 5);
    const def = {
      name,
      tags: tags.length ? tags : ['magic'],
      motion: MOTIONS.includes(data.motion) ? data.motion : 'bob',
      color: INK_COLORS[data.ink] ?? INK_COLORS.blue,
      worker: Boolean(data.worker && tags.includes('folk')),
      habitat: data.habitat === 'none' ? null : data.habitat,
      flavour: data.flavour.slice(0, 90),
    };
    saveElement(def, data.art_subject.slice(0, 160) || name.toLowerCase());
    result = getElement(name);
  }
  saveRecipe(a, b, result.name, 'model', mode);
  return { result, fresh: true, cost };
}
