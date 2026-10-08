import type { ElementDef } from '../data/elements';

/** How a resident moves around its zone (on top of its idle motion). */
export type Locomotion = 'rooted' | 'swim' | 'flutter' | 'wander' | 'hop' | 'drift';

/** Derived from tags, so generated cards get a sensible way to move without asking the model. */
export function locomotionFor(def: ElementDef): Locomotion {
  const t = new Set(def.tags);
  if (t.has('fish')) return 'swim';
  if (t.has('bird') || t.has('insect')) return 'flutter';
  if (t.has('folk')) return 'hop';
  if (t.has('animal')) return 'wander';
  if (t.has('gas')) return 'drift';
  return 'rooted'; // plants, buildings, stones, water bodies
}
