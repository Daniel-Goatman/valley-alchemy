// Prompt check: run a fixed set of pairs through the combine prompt without touching the cache.
// Usage: node tools/eval_combos.mjs [effort] [mode] [set]   (effort: none|low|medium; mode: sensible|inventive|wild; set: basic|life|lifeless)
import { INVENTIVE_SYSTEM, SCHEMA, SYSTEM, TEXT_MODEL, WILD_SYSTEM, userPrompt } from '../server/combine.mjs';
import { costOf, structured } from '../server/openai.mjs';

const PAIRS = [
  ['Beaver', 'Tree'], ['Beaver', 'Water'], ['Beaver', 'Stone'], ['Beaver', 'Grass'], ['Beaver', 'Reed'],
  ['Sun', 'Water'], ['Sun', 'Grass'], ['Rain', 'Soil'], ['Seed', 'Brick'], ['Fish', 'Pond'],
  ['Honey', 'Fire'], ['Wind', 'Cloud'], ['Mud', 'Hay'], ['Stone', 'Fire'], ['Flower', 'Rain'],
  ['Bee', 'Hay'], ['Log', 'Fire'], ['Pebble', 'Water'], ['Sun', 'Stone'], ['Seed', 'Stone'],
  ['Dandelion', 'Brick'], ['Fish', 'Sun'], ['Clay', 'Water'], ['Grove', 'Beaver'],
];

const LIFE_PAIRS = [
  ['Life', 'Water'], ['Life', 'Soil'], ['Life', 'Wind'], ['Life', 'Tree'], ['Life', 'Flower'], ['Life', 'Feather'],
  ['Life', 'Shell'], ['Life', 'Reed'], ['Fish', 'Wing'], ['Fish', 'Fur'], ['Beaver', 'Wing'], ['Bee', 'Big'],
  ['Fish', 'Night'], ['Bee', 'Fish'], ['Beaver', 'Fish'], ['Stone', 'Shell'], ['Water', 'Fur'], ['Fur', 'Wing'],
  ['Sun', 'Stone'], ['Honey', 'Brick'], ['Beaver', 'Tiny'], ['Fish', 'Horn'], ['Bee', 'Night'], ['Life', 'Stone'],
];
const LIFELESS_PAIRS = [
  ['Sun', 'Stone'], ['Honey', 'Brick'], ['Clay', 'Fire'], ['Water', 'Soil'], ['Log', 'Fire'], ['Stone', 'Stone'],
  ['Hay', 'Brick'], ['Cloud', 'Stone'], ['Steam', 'Log'], ['Pebble', 'Mud'], ['Rain', 'Brick'], ['Sun', 'Honey'],
];
const effort = process.argv[2] ?? 'low';
const evalMode = process.argv[3] ?? 'sensible';
const system = evalMode === 'wild' ? WILD_SYSTEM : evalMode === 'inventive' ? INVENTIVE_SYSTEM : SYSTEM;
const set = { life: LIFE_PAIRS, lifeless: LIFELESS_PAIRS }[process.argv[4]] ?? PAIRS;
let total = 0;
let nothing = 0;
const times = [];
const results = await Promise.all(set.map(async ([a, b]) => {
  const t = performance.now();
  const { data, usage } = await structured(TEXT_MODEL, system, userPrompt(a, b), 'card', SCHEMA, effort);
  times.push((performance.now() - t) / 1000);
  total += costOf(TEXT_MODEL, usage);
  if (!data.valid) nothing++;
  return `${a} + ${b} = ${data.valid ? `${data.name} [${data.tags.join(', ')}]` : '(nothing)'}`;
}));
console.log(results.join('\n'));
times.sort((x, y) => x - y);
console.log(`\nmode=${evalMode} effort=${effort} · nothing ${nothing}/${set.length} · median ${times[times.length >> 1].toFixed(1)}s · max ${times.at(-1).toFixed(1)}s · cost $${total.toFixed(4)}`);
