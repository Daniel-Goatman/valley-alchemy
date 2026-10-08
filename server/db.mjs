// SQLite store for every card and recipe the valley knows. Seeded from the hand-written data on first run.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT } from './paths.mjs';
import { SEED_ELEMENTS, SEED_RECIPES, pairKey } from '../src/data/elements.ts';

const DATA = join(ROOT, 'data');
mkdirSync(DATA, { recursive: true });

export const db = new DatabaseSync(join(DATA, 'valley.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS elements (
    key TEXT PRIMARY KEY,          -- lowercase name
    name TEXT NOT NULL,
    def TEXT NOT NULL,             -- ElementDef JSON
    art_prompt TEXT,
    art TEXT NOT NULL DEFAULT 'none',  -- none | queued | drawing | ready | failed
    art_url TEXT,
    source TEXT NOT NULL,          -- seed | model
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS recipes (
    pair TEXT PRIMARY KEY,         -- pairKey(a, b)
    a TEXT NOT NULL,
    b TEXT NOT NULL,
    result TEXT,                   -- element key, or NULL for "nothing happens"
    source TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS spend (
    day TEXT PRIMARY KEY,
    usd REAL NOT NULL DEFAULT 0
  );
`);

const seedArt = (() => {
  try {
    return new Set(JSON.parse(readFileSync(join(ROOT, 'public', 'cards', 'manifest.json'), 'utf8')));
  } catch {
    return new Set();
  }
})();

export function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Seed (idempotent): hand-written cards and recipes, with their approved art.
{
  // Hand-written data wins over anything the model made earlier with the same name or pair.
  const insEl = db.prepare(`INSERT INTO elements (key, name, def, art, art_url, source) VALUES (?, ?, ?, ?, ?, 'seed')
    ON CONFLICT(key) DO UPDATE SET def = excluded.def, source = 'seed',
      art = CASE WHEN excluded.art = 'ready' THEN 'ready' ELSE elements.art END,
      art_url = COALESCE(excluded.art_url, elements.art_url)`);
  for (const d of SEED_ELEMENTS) {
    const hasArt = seedArt.has(slug(d.name));
    insEl.run(d.name.toLowerCase(), d.name, JSON.stringify(d), hasArt ? 'ready' : 'none', hasArt ? `/cards/${slug(d.name)}.png` : null);
  }
  const insRe = db.prepare(`INSERT OR REPLACE INTO recipes (pair, a, b, result, source) VALUES (?, ?, ?, ?, 'seed')`);
  for (const r of SEED_RECIPES) insRe.run(pairKey(r.a, r.b), r.a.toLowerCase(), r.b.toLowerCase(), r.result.toLowerCase());
}

const rowToElement = (row) => row && { ...JSON.parse(row.def), art: row.art, artUrl: row.art_url };

export const getElement = (name) => rowToElement(db.prepare('SELECT * FROM elements WHERE key = ?').get(name.toLowerCase()));
export const allElements = () => db.prepare('SELECT * FROM elements ORDER BY created_at, name').all().map(rowToElement);
export const elementNames = () => db.prepare('SELECT name FROM elements ORDER BY name').all().map((r) => r.name);

/** Every decided pair as { pair, result } with the result's display name (null = nothing happens). */
export function allRecipes() {
  return db.prepare('SELECT r.pair, e.name AS result FROM recipes r LEFT JOIN elements e ON e.key = r.result').all()
    .map((row) => ({ pair: row.pair, result: row.result ?? null }));
}

/** Inventive and wild answers are cached separately ("inv:" / "wild:" prefixes), so they never leak into sensible play. */
const MODE_PREFIX = { sensible: '', inventive: 'inv:', wild: 'wild:' };
export const recipeKey = (a, b, mode = 'sensible') => `${MODE_PREFIX[mode] ?? ''}${pairKey(a, b)}`;

export function getRecipe(a, b, mode = 'sensible') {
  const row = db.prepare('SELECT result FROM recipes WHERE pair = ?').get(recipeKey(a, b, mode));
  if (!row) return undefined; // never tried
  return row.result === null ? null : getElement(row.result);
}

export function saveRecipe(a, b, resultName, source, mode = 'sensible') {
  db.prepare('INSERT OR REPLACE INTO recipes (pair, a, b, result, source) VALUES (?, ?, ?, ?, ?)')
    .run(recipeKey(a, b, mode), a.toLowerCase(), b.toLowerCase(), resultName ? resultName.toLowerCase() : null, source);
}

export function saveElement(def, artPrompt) {
  db.prepare(`INSERT OR IGNORE INTO elements (key, name, def, art_prompt, source) VALUES (?, ?, ?, ?, 'model')`)
    .run(def.name.toLowerCase(), def.name, JSON.stringify(def), artPrompt);
}

export function setArt(name, state, url = null) {
  db.prepare('UPDATE elements SET art = ?, art_url = COALESCE(?, art_url) WHERE key = ?').run(state, url, name.toLowerCase());
}

export function setMotion(name, motion) {
  const row = db.prepare('SELECT def FROM elements WHERE key = ?').get(name.toLowerCase());
  if (!row) return;
  db.prepare('UPDATE elements SET def = ? WHERE key = ?').run(JSON.stringify({ ...JSON.parse(row.def), motion }), name.toLowerCase());
}

export function artPromptFor(name) {
  return db.prepare('SELECT art_prompt FROM elements WHERE key = ?').get(name.toLowerCase())?.art_prompt ?? null;
}

const today = () => new Date().toISOString().slice(0, 10);

export function spentToday() {
  return db.prepare('SELECT usd FROM spend WHERE day = ?').get(today())?.usd ?? 0;
}

export function addSpend(usd) {
  db.prepare('INSERT INTO spend (day, usd) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET usd = usd + excluded.usd').run(today(), usd);
}

export const dataDir = DATA;
