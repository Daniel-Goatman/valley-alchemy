// Client for the local game server (npm run server). Every call fails soft: the game keeps working offline.
import type { ElementDef } from './data/elements';
import { mode } from './game/mode';

export interface ServerElement extends ElementDef {
  art: 'none' | 'queued' | 'drawing' | 'ready' | 'failed';
  artUrl: string | null;
}

export let online = false;

export async function fetchElements(): Promise<ServerElement[] | null> {
  try {
    const res = await fetch('/api/elements');
    if (!res.ok) throw new Error(String(res.status));
    online = true;
    return ((await res.json()) as { elements: ServerElement[] }).elements;
  } catch {
    online = false;
    return null;
  }
}

export interface CombineAnswer {
  result: ServerElement | null;
  fresh: boolean;
  capped: boolean;
  /** Why the model couldn't be asked: today's budget, or the OpenAI account is out of credits. */
  reason?: 'budget' | 'credits' | null;
}

/** Ask the server what a + b makes. Throws if the server can't be reached. */
export async function combineRemote(a: string, b: string): Promise<CombineAnswer> {
  const res = await fetch('/api/combine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ a, b, mode }),
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  online = true;
  return (await res.json()) as CombineAnswer;
}

export async function artStatus(names: string[]): Promise<Record<string, { art: ServerElement['art']; url: string | null; motion?: string } | null>> {
  const res = await fetch(`/api/art?names=${encodeURIComponent(names.join(','))}`);
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}

/** Ask the server to pre-decide pairs among these cards (fire and forget). */
export function prefetchPairs(names: string[]): void {
  fetch('/api/prefetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names, mode }),
  }).catch(() => { /* offline: nothing to do */ });
}

/** Every pair the server has decided, as pairKey → result name (null = nothing happens). */
export async function fetchRecipes(): Promise<[string, string | null][] | null> {
  try {
    const res = await fetch('/api/recipes');
    if (!res.ok) return null;
    const { recipes } = (await res.json()) as { recipes: { pair: string; result: string | null }[] };
    return recipes.map((r) => [r.pair, r.result]);
  } catch {
    return null;
  }
}

/** Tell the server these cards were made by the player, so their art gets drawn (if art is on create). */
export async function requestArt(names: string[]): Promise<Record<string, { art: ServerElement['art']; url: string | null }>> {
  const res = await fetch('/api/art/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}
