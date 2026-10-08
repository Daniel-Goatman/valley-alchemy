import { Assets, type Texture } from 'pixi.js';

/** Card art by element name. Seed art lives in public/cards/, generated art is served by the game server. */
const textures = new Map<string, Texture>();

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function artUrl(name: string): string | undefined {
  return urls.get(name);
}
const urls = new Map<string, string>();

/** Load art for the given name → url pairs. Broken art just keeps the placeholder disc. */
export async function loadArt(entries: [string, string][]): Promise<string[]> {
  const loaded: string[] = [];
  await Promise.all(
    entries.map(async ([name, url]) => {
      try {
        textures.set(name, await Assets.load<Texture>(url));
        urls.set(name, url);
        loaded.push(name);
      } catch { /* keep the placeholder */ }
    }),
  );
  return loaded;
}

/** Offline fallback: approved seed art listed in public/cards/manifest.json. */
export async function seedArtEntries(names: string[]): Promise<[string, string][]> {
  try {
    const res = await fetch('/cards/manifest.json');
    if (!res.ok) return [];
    const approved = new Set((await res.json()) as string[]);
    return names.filter((n) => approved.has(slug(n))).map((n) => [n, `/cards/${slug(n)}.png`]);
  } catch {
    return [];
  }
}

export function artFor(name: string): Texture | undefined {
  return textures.get(name);
}
