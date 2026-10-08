import { RECIPES, pairKey } from '../data/elements';

/**
 * Sensible: only obvious combinations work. Inventive (default): sensible, but Life, traits and creatures open
 * whole branches. Wild: every pair makes something. Inventive and wild have their own caches.
 */
export type Mode = 'sensible' | 'inventive' | 'wild';

const STORAGE_KEY = 'valley.mode';

function load(): Mode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'wild' || saved === 'sensible' ? saved : 'inventive';
  } catch {
    return 'inventive';
  }
}

export let mode: Mode = load();

export function setMode(next: Mode): void {
  mode = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
}

const PREFIX: Record<Mode, string> = { sensible: '', inventive: 'inv:', wild: 'wild:' };
const modeKey = (a: string, b: string, m: Mode) => `${PREFIX[m]}${pairKey(a, b)}`;

/**
 * Known answer for a pair in the current mode: a card name, null (nothing happens), or undefined (never decided).
 * Inventive and wild use the sensible answer when it makes something, and their own answers otherwise.
 */
export function lookupRecipe(a: string, b: string): string | null | undefined {
  const sensible = RECIPES.get(pairKey(a, b));
  if (mode === 'sensible' || sensible) return sensible;
  return RECIPES.get(modeKey(a, b, mode));
}

export function storeRecipe(a: string, b: string, result: string | null): void {
  RECIPES.set(modeKey(a, b, mode), result);
}
