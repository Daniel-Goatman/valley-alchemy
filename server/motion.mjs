// Picks how a card's icon idles, by looking at the finished art (the text model can only guess before it exists).
import { MOTIONS } from '../src/data/elements.ts';
import { costOf, structuredWithImage } from './openai.mjs';

const MODEL = 'gpt-5.4-mini';

// What each motion looks like on the card, so the choice matches the picture.
const GUIDE = `bob: hops gently up and down. Creatures and animal folk standing or sitting.
sway: rocks side to side from its base. Plants, grass, reeds, trees, flowers on stems.
flicker: fast stretching shimmy. Flames and fire only.
jiggle: soft squish. Liquids, drops, puddles, jelly, mud, honey.
pulse: slow swell, like a glow. Glowing, hot or magical things, embers, lanterns.
float: slow bob with a little tilt. Things that swim or fly: fish, birds, bees, leaves.
drift: slow sideways drift. Clouds, mist, fog, storms, smoke banks.
rise: rises and fades. Steam, smoke wisps, scents.
settle: sits still with an occasional small hop. Heavy solid things: stones, bricks, logs, mounds, pots.
breathe: very subtle swell. Seeds, bundles, sleeping or resting things.
twinkle: sparkly shimmer. Rainbows, stars, magic dust, shiny things.
spin: rotates continuously. ONLY for round, radially symmetric things seen face-on (a sun, a wheel, a flower head from the front). Never for anything with a top and bottom.
wobble: an occasional wobble. Soft solid things: clay, dough, cheese, cushions.
droop: slow sag. Heavy wet or tired things.
shiver: brief jitter. Buzzing insects, cold or nervous things.
still: no motion. Buildings, walls, flat objects, tools.`;

const SYSTEM = `You choose the idle animation for a card icon in a small card game. Look at the image and pick the motion that will look natural for exactly what is drawn. If unsure, prefer a calmer motion. Motions:\n${GUIDE}`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['motion'],
  properties: { motion: { type: 'string', enum: [...MOTIONS] } },
};

/** Returns { motion, cost }. */
export async function chooseMotion(name, png) {
  const { data, usage } = await structuredWithImage(MODEL, SYSTEM, `Card: "${name}".`, png, 'motion', SCHEMA);
  return { motion: MOTIONS.includes(data.motion) ? data.motion : 'bob', cost: costOf(MODEL, usage) };
}
