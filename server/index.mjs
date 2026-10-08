// Local game server for Valley: combining, the shared card cache, and art. Listens on 127.0.0.1 only.
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { CARDS, queuedCount, requestArt } from './art.mjs';
import { combine, prefetch, TEXT_MODEL, whenPrefetchFindsNewCard } from './combine.mjs';
import { allElements, allRecipes, dataDir, getElement, spentToday } from './db.mjs';
import { creditsOut } from './openai.mjs';

const PORT = Number(process.env.VALLEY_PORT ?? 8787);
// Safety cap on the game's own model + art spend per day (Daniel raised it from $3, 2026-10-08).
const DAILY_CAP = Number(process.env.VALLEY_DAILY_CAP_USD ?? 10);
const PREFETCH = process.env.VALLEY_PREFETCH !== 'off';
const canSpend = () => spentToday() < DAILY_CAP;
// When a generated card gets its art: 'create' = as soon as a player makes it, 'use' = the first time it's used.
const ART_ON = process.env.VALLEY_ART_ON === 'use' ? 'use' : 'create';

// Pre-drawing: when pre-deciding invents a new card from cards on the table, start its art right away so it's
// ready (or nearly) when the player makes it. Limited per day, and to a short queue in wild mode, where every
// pair makes a new card.
// Off by default (Daniel, 2026-10-07); set VALLEY_PREDRAW=on to enable.
const PREDRAW = process.env.VALLEY_PREDRAW === 'on' && ART_ON === 'create';
const PREDRAW_PER_DAY = Number(process.env.VALLEY_PREDRAW_PER_DAY ?? 40);
const WILD_PREDRAW_QUEUE = 4;
let predrawDay = '';
let predrawn = 0;
whenPrefetchFindsNewCard((name, mode) => {
  if (!PREDRAW || !canSpend()) return;
  const today = new Date().toISOString().slice(0, 10);
  if (today !== predrawDay) [predrawDay, predrawn] = [today, 0];
  if (predrawn >= PREDRAW_PER_DAY) return;
  if (mode === 'wild' && queuedCount() >= WILD_PREDRAW_QUEUE) return;
  predrawn++;
  console.log(`predraw: ${name} (${predrawn}/${PREDRAW_PER_DAY} today)`);
  requestArt(name, canSpend, { background: true });
});

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error('body too large');
  }
  return JSON.parse(raw || '{}');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/elements') {
      return send(res, 200, { elements: allElements(), spentToday: spentToday(), cap: DAILY_CAP, creditsOut: creditsOut() });
    }

    // Dev helper: the client can save a snapshot of its canvas (localhost only) for checking layouts.
    if (req.method === 'POST' && url.pathname === '/api/dev/snapshot') {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 12_000_000) return send(res, 413, { error: 'too large' });
      }
      const { name, dataUrl } = JSON.parse(raw);
      const safe = String(name ?? 'snapshot').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'snapshot';
      const b64 = String(dataUrl ?? '').split(',')[1] ?? '';
      mkdirSync(join(dataDir, 'snapshots'), { recursive: true });
      const file = join(dataDir, 'snapshots', `${safe}.jpg`);
      writeFileSync(file, Buffer.from(b64, 'base64'));
      return send(res, 200, { file });
    }

    if (req.method === 'GET' && url.pathname === '/api/recipes') {
      return send(res, 200, { recipes: allRecipes() });
    }

    if (req.method === 'POST' && url.pathname === '/api/combine') {
      const { a, b, mode: rawMode } = await readJson(req);
      const mode = ['sensible', 'inventive', 'wild'].includes(rawMode) ? rawMode : 'sensible';
      // Only cards the valley already knows can be combined; this also keeps arbitrary text out of the prompt.
      const ea = typeof a === 'string' && getElement(a);
      const eb = typeof b === 'string' && getElement(b);
      if (!ea || !eb) return send(res, 400, { error: 'Unknown card' });
      let out;
      try {
        out = await combine(ea.name, eb.name, { allowModel: canSpend(), mode });
      } catch (err) {
        if (err.code !== 'no_credits') throw err;
        out = { result: null, fresh: false, cost: 0, capped: true, reason: 'credits' };
      }
      if (out.result) {
        if (ART_ON === 'create') requestArt(out.result.name, canSpend);
        else {
          requestArt(ea.name, canSpend);
          requestArt(eb.name, canSpend);
        }
      }
      console.log(`combine${mode !== 'sensible' ? ` (${mode})` : ''}: ${ea.name} + ${eb.name} = ${out.result?.name ?? 'nothing'}${out.fresh ? ` (new, $${out.cost.toFixed(4)})` : ''}${out.capped ? ' (cap reached)' : ''}`);
      const result = out.result && getElement(out.result.name); // re-read: art may have just been queued or reused
      return send(res, 200, { result, fresh: out.fresh, capped: Boolean(out.capped), reason: out.reason ?? (out.capped ? 'budget' : null) });
    }

    if (req.method === 'POST' && url.pathname === '/api/prefetch') {
      // Pre-deciding is on (Daniel, 2026-10-08); VALLEY_PREFETCH=off disables it to save spend.
      if (!PREFETCH) return send(res, 200, { queued: 0, disabled: true });
      const { names, mode: rawMode } = await readJson(req);
      if (!Array.isArray(names)) return send(res, 400, { error: 'names must be a list' });
      const mode = ['sensible', 'inventive', 'wild'].includes(rawMode) ? rawMode : 'sensible';
      // Unique known cards; a card pairs with itself only if the table has two of it.
      const counts = new Map();
      for (const n of names.slice(0, 60)) {
        const el = typeof n === 'string' && getElement(n);
        if (el) counts.set(el.name, (counts.get(el.name) ?? 0) + 1);
      }
      const uniq = [...counts.keys()];
      const pairs = [];
      for (let i = 0; i < uniq.length; i++) {
        for (let j = i; j < uniq.length; j++) {
          if (i === j && counts.get(uniq[i]) < 2) continue;
          pairs.push([uniq[i], uniq[j]]);
        }
      }
      const queued = canSpend() && !creditsOut() ? prefetch(pairs.slice(0, 80), canSpend, mode) : 0;
      return send(res, 200, { queued });
    }

    if (req.method === 'POST' && url.pathname === '/api/art/request') {
      // A player made these cards (possibly answered from the client's cache): draw them if art is on create.
      const { names } = await readJson(req);
      if (!Array.isArray(names)) return send(res, 400, { error: 'names must be a list' });
      const status = {};
      for (const n of names.slice(0, 50)) {
        const el = typeof n === 'string' && getElement(n);
        if (!el) continue;
        if (ART_ON === 'create') requestArt(el.name, canSpend);
        const now = getElement(el.name);
        status[el.name] = { art: now.art, url: now.artUrl, motion: now.motion };
      }
      return send(res, 200, status);
    }

    if (req.method === 'GET' && url.pathname === '/api/art') {
      const names = (url.searchParams.get('names') ?? '').split(',').filter(Boolean).slice(0, 100);
      const status = Object.fromEntries(names.map((n) => {
        const el = getElement(n);
        return [n, el ? { art: el.art, url: el.artUrl, motion: el.motion } : null];
      }));
      return send(res, 200, status);
    }

    const card = url.pathname.match(/^\/gen-cards\/([a-z0-9-]+\.png)$/);
    if (req.method === 'GET' && card) {
      const file = join(CARDS, card[1]);
      if (!existsSync(file)) return send(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=31536000, immutable' });
      return createReadStream(file).pipe(res);
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Valley server on http://127.0.0.1:${PORT} · model ${TEXT_MODEL} · art on ${ART_ON}${PREDRAW ? ` + predraw (${PREDRAW_PER_DAY}/day)` : ''} · prefetch ${PREFETCH ? 'on' : 'off'} · cap $${DAILY_CAP}/day · spent today $${spentToday().toFixed(3)}`);
});
