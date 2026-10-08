// What the valley does at dawn: zones produce cards from their residents, and some residents grow up.
// Tag rules first, so generated cards join in without asking the model. Tuning values are placeholders.
import { ELEMENTS } from '../data/elements';
import type { Resident } from './Resident';
import type { Zone } from './zones';

export interface Produce {
  name: string;
  from: Resident;
}

export interface Growth {
  resident: Resident;
  into: string;
}

const has = (r: Resident, tag: string) => r.def.tags.includes(tag);
const named = (rs: Resident[], name: string) => rs.filter((r) => r.def.name === name);
const chance = (p: number) => Math.random() < p;
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Cards a zone produces this dawn. At most 2 per zone so the table doesn't flood. */
export function produce(zone: Zone, rs: Resident[]): Produce[] {
  const out: Produce[] = [];
  const add = (name: string, from: Resident) => {
    if (name in ELEMENTS && out.length < 2) out.push({ name, from });
  };

  switch (zone.habitat) {
    case 'grove':
      for (const t of named(rs, 'Tree')) add(chance(0.5) ? 'Seed' : 'Log', t);
      for (const g of named(rs, 'Grove')) add('Log', g);
      break;
    case 'meadow': {
      const flowers = named(rs, 'Flower');
      const insects = rs.filter((r) => has(r, 'insect'));
      if (flowers.length && insects.length) add('Honey', pick(insects));
      for (const g of named(rs, 'Grass')) if (chance(0.5)) add('Hay', g);
      for (const f of flowers) if (chance(0.3)) add('Seed', f);
      for (const d of named(rs, 'Dandelion')) if (chance(0.5)) add('Seed', d);
      break;
    }
    case 'river': {
      const fish = rs.filter((r) => has(r, 'fish'));
      const cover = rs.some((r) => r.def.name === 'Reed' || has(r, 'plant'));
      if (fish.length && cover) add(fish[0].def.name, fish[0]); // fish breed where there's cover
      for (const r of named(rs, 'Reed')) if (chance(0.25)) add('Reed', r);
      break;
    }
    case 'settlement':
      for (const h of named(rs, 'Hearth')) if (chance(0.4)) add('Fire', h);
      break;
  }

  // Generated plants: an occasional seed.
  for (const r of rs) {
    if (!(r.def.name in RULED) && has(r, 'plant') && has(r, 'alive') && chance(0.2)) add('Seed', r);
  }
  return out;
}

const RULED: Record<string, true> = { Tree: true, Grove: true, Flower: true, Grass: true, Dandelion: true, Reed: true, Sprout: true, Sapling: true };

/** Young things grow up after a few dawns in the right zone. */
const GROWS: Record<string, { after: number; into: string[] }> = {
  Sprout: { after: 2, into: ['Grass', 'Flower'] },
  Sapling: { after: 2, into: ['Tree'] },
  Seed: { after: 1, into: ['Sprout'] },
};

export function grow(rs: Resident[]): Growth[] {
  const out: Growth[] = [];
  for (const r of rs) {
    const g = GROWS[r.def.name];
    if (g && r.age >= g.after) {
      const into = pick(g.into);
      if (into in ELEMENTS) out.push({ resident: r, into });
    }
  }
  return out;
}
