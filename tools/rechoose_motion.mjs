// One-off: re-pick motions for generated cards that already have art, by looking at the art.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addSpend, allElements, dataDir, setMotion, slug } from '../server/db.mjs';
import { chooseMotion } from '../server/motion.mjs';

for (const el of allElements().filter((e) => e.art === 'ready' && e.artUrl?.startsWith('/gen-cards/'))) {
  const png = await readFile(join(dataDir, 'cards', `${slug(el.name)}.png`));
  const { motion, cost } = await chooseMotion(el.name, png);
  addSpend(cost);
  setMotion(el.name, motion);
  console.log(`${el.name}: ${el.motion} → ${motion} ($${cost.toFixed(4)})`);
}
