// Seasons, the Heart Spring's tribute, and the year. Plain state + functions; main.ts drives the UI.
import { ELEMENTS } from '../data/elements';

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export const DAYS_PER_SEASON = 5; // tuning placeholder
export const MAX_VITALITY = 3;

/** Plain words for tags in the Heart's request ("something wet"). */
const TAG_WORDS: Record<string, string> = {
  wet: 'wet', alive: 'alive', plant: 'a plant', hot: 'hot', hard: 'hard',
  sweet: 'sweet', edible: 'food', wood: 'wooden', light: 'bright',
  soft: 'soft', animal: 'an animal', stone: 'stone', building: 'built',
  liquid: 'a liquid', gas: 'airy', fertile: 'fertile', seed: 'a seed', flammable: 'burnable',
  insect: 'an insect', fish: 'a fish', magic: 'magical', dry: 'dry', heavy: 'heavy',
};

export interface Need {
  tag: string;
  label: string;
  met: boolean;
  /** The card that met it. */
  by?: string;
}

export interface YearState {
  year: number;
  season: number; // 0..3
  day: number; // 1..DAYS_PER_SEASON
  vitality: number;
  needs: Need[];
  seasonsFed: number;
  discoveriesThisYear: number;
}

export function newYear(year: number, known: string[]): YearState {
  return { year, season: 0, day: 1, vitality: MAX_VITALITY, needs: makeNeeds(known, 0), seasonsFed: 0, discoveriesThisYear: 0 };
}

/**
 * The Heart asks for things you can actually make: tags drawn from cards you've discovered.
 * Later seasons ask for more.
 */
export function makeNeeds(known: string[], season: number): Need[] {
  const counts = new Map<string, number>();
  for (const n of known) for (const t of ELEMENTS[n]?.tags ?? []) if (t in TAG_WORDS) counts.set(t, (counts.get(t) ?? 0) + 1);
  const pool = [...counts.keys()];
  const want = Math.min(pool.length, season < 2 ? 2 : 3);
  const needs: Need[] = [];
  while (needs.length < want && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    const tag = pool.splice(i, 1)[0];
    needs.push({ tag, label: TAG_WORDS[tag], met: false });
  }
  return needs;
}

/** Offer a card: returns the need it met, or null if the Heart doesn't need it. */
export function offer(state: YearState, cardName: string): Need | null {
  const tags = ELEMENTS[cardName]?.tags ?? [];
  const need = state.needs.find((n) => !n.met && tags.includes(n.tag));
  if (!need) return null;
  need.met = true;
  need.by = cardName;
  return need;
}

export type SeasonEnd =
  | { kind: 'fed'; season: string }
  | { kind: 'hungry'; season: string; vitality: number }
  | { kind: 'year-over'; reason: 'winter' | 'dry' };

/**
 * Advance one day. At the end of a season, settle the tribute. Returns what happened at a season boundary,
 * or null on an ordinary day.
 */
export function nextDay(state: YearState, known: string[]): SeasonEnd | null {
  state.day += 1;
  if (state.day <= DAYS_PER_SEASON) return null;

  const season = SEASONS[state.season];
  const fed = state.needs.every((n) => n.met);
  let result: SeasonEnd;
  if (fed) {
    state.seasonsFed += 1;
    result = { kind: 'fed', season };
  } else {
    state.vitality -= 1;
    result = { kind: 'hungry', season, vitality: state.vitality };
  }
  if (state.vitality <= 0) return { kind: 'year-over', reason: 'dry' };
  if (state.season === SEASONS.length - 1) return { kind: 'year-over', reason: 'winter' };

  state.season += 1;
  state.day = 1;
  state.needs = makeNeeds(known, state.season);
  return result;
}
