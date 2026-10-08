import { Application, Texture, TilingSprite } from 'pixi.js';
import { artStatus, combineRemote, fetchElements, fetchRecipes, online, prefetchPairs, requestArt } from './api';
import { ELEMENTS, RECIPES, START_CARDS, TRAITS, registerElement, type Motion } from './data/elements';
import { CARD_H, CARD_W } from './game/Card';
import { artFor, artUrl, loadArt, seedArtEntries } from './game/art';
import { Fx } from './game/Fx';
import { lookupRecipe, mode, setMode, storeRecipe, type Mode } from './game/mode';
import { TABLE_TOP, Table } from './game/Table';
import { updateTweens } from './game/tween';
import { INK } from './theme';

const STORAGE_KEY = 'valley.m1.codex';

/** Basic cards that trickle in each dawn, so you can never get stuck. */
const BASICS = ['Water', 'Soil', 'Stone', 'Sun', 'Seed'];
/** Simple cards that can also arrive at dawn once you've discovered them (weather, and Life itself). */
const WEATHER = ['Rain', 'Cloud', 'Wind', 'Life'];
const DAY_SECONDS = 20; // tuning placeholder
const STUCK_GRACE = 2; // seconds with no possible combination before the Next day button nudges you
const CARDS_PER_DAWN = 2; // tuning placeholder
const TABLE_CAP = 16; // no deliveries once the table holds this many cards
const MAX_COPIES = 2; // never deliver a card you already have this many of
const WILDCARD_CHANCE = 0.25; // the second card is sometimes a rarer card you've already discovered
const ART_POLL_MS = 1500;
const PREFETCH_CHECK_MS = 1200;

// --- Startup: fonts, the server's cards, and art -------------------------------------------------

// Card names use web fonts; wait so Pixi doesn't rasterise them with a fallback.
// Never block startup on the network: give the fonts 1.5 s, then carry on with fallbacks.
try {
  await Promise.race([
    Promise.all([document.fonts.load('14px "Young Serif"'), document.fonts.load('700 10px Archivo')]),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
} catch { /* fall back to system fonts */ }

const serverElements = await fetchElements();

/** Copy every pair the server has decided into the local recipe map (used for choosing deliveries). */
async function syncRecipes(): Promise<void> {
  const known = await fetchRecipes();
  if (known) for (const [pair, result] of known) RECIPES.set(pair, result);
}
if (serverElements) await syncRecipes();
if (serverElements) {
  for (const el of serverElements) if (!(el.name in ELEMENTS)) registerElement(el);
  await loadArt(serverElements.filter((el) => el.art === 'ready' && el.artUrl).map((el) => [el.name, el.artUrl!]));
} else {
  await loadArt(await seedArtEntries(Object.keys(ELEMENTS)));
}

// --- Codex -----------------------------------------------------------------------------------------

/** name → how it was first found ("" for starting cards). */
type Codex = Record<string, string>;

function loadCodex(): Codex {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
    if (saved && typeof saved === 'object') {
      return Object.fromEntries(
        Object.entries(saved as Record<string, unknown>).filter(([n, v]) => n in ELEMENTS && typeof v === 'string'),
      ) as Codex;
    }
  } catch { /* storage unavailable: start fresh */ }
  return {};
}

function saveCodex(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(codex)); } catch { /* ignore */ }
}

const codex: Codex = { ...Object.fromEntries(START_CARDS.map((n) => [n, ''])), ...loadCodex() };

const countEl = document.getElementById('count')!;
const dayEl = document.getElementById('day')!;
const dayBarEl = document.getElementById('day-bar')!;
const daySunEl = document.getElementById('day-sun')!;
const listEl = document.getElementById('codex-list')!;
const toastEl = document.getElementById('toast')!;
let toastTimer = 0;

// The Almanac shows this round (since the page loaded) by default; "All time" shows everything ever found.
const foundThisRound = new Set<string>(START_CARDS);
let almanacView: 'round' | 'all' = 'round';
const viewButtons = [...document.querySelectorAll<HTMLButtonElement>('.view button')];
for (const b of viewButtons) {
  b.addEventListener('click', () => {
    almanacView = b.dataset.view === 'all' ? 'all' : 'round';
    for (const x of viewButtons) x.setAttribute('aria-pressed', String(x === b));
    renderCodex();
  });
}

function renderCodex(): void {
  const entries = Object.entries(codex).filter(([name]) => almanacView === 'all' || foundThisRound.has(name));
  countEl.textContent = almanacView === 'all' ? `${entries.length} found` : `${entries.length} this round`;
  listEl.replaceChildren(
    ...entries.map(([name, from]) => {
      const li = document.createElement('li');
      // Drag an entry onto the table for a free copy (a testing convenience).
      li.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        table.grabNew(name, e.clientX, e.clientY);
        const move = (ev: PointerEvent) => table.dragTo(ev.clientX, ev.clientY);
        const up = () => {
          table.releaseDrag();
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });
      let dot: HTMLElement;
      const url = artFor(name) && artUrl(name);
      if (url) {
        dot = document.createElement('img');
        (dot as HTMLImageElement).src = url;
        (dot as HTMLImageElement).alt = '';
        dot.className = 'thumb';
      } else {
        dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = `#${ELEMENTS[name].color.toString(16).padStart(6, '0')}`;
      }
      const label = document.createElement('span');
      label.className = 'name';
      label.textContent = name;
      li.append(dot, label);
      if (from) {
        const how = document.createElement('span');
        how.className = 'from';
        how.textContent = from;
        li.append(how);
      }
      return li;
    }),
  );
}

function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), 1800);
}

/** Riso-style grain: sparse ink specks tiled over the table. */
function grainTexture(): Texture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = Math.random();
    img.data[i] = 31;
    img.data[i + 1] = 58;
    img.data[i + 2] = 115;
    img.data[i + 3] = r < 0.5 ? r * 34 : 0;
  }
  ctx.putImageData(img, 0, 0);
  return Texture.from(c);
}

// --- Table -----------------------------------------------------------------------------------------

const app = new Application();
await app.init({
  resizeTo: window,
  background: INK.table,
  antialias: true,
  resolution: window.devicePixelRatio,
  autoDensity: true,
});
document.getElementById('game')!.appendChild(app.canvas);

const fx = new Fx();

// The bin (bottom left): drop a card on it to throw it away. Generous hit area so it's easy to hit.
const binEl = document.getElementById('bin')!;
function overBin(p: { x: number; y: number }): boolean {
  const r = binEl.getBoundingClientRect();
  return p.x >= r.left - 24 && p.x <= r.right + 24 && p.y >= r.top - 24 && p.y <= r.bottom + 24;
}
const table = new Table({
  onCombine(result, a, b) {
    // Answers can come from the local cache, so tell the server the card was made: that's what earns it art.
    const def = ELEMENTS[result];
    if (online && !artFor(result) && def.art !== 'queued' && def.art !== 'drawing') {
      def.art = 'queued'; // show the printing press right away
      requestArt([result]).catch(() => { /* the art poll will sort it out */ });
    }
    if (!foundThisRound.has(result)) {
      foundThisRound.add(result);
      renderCodex();
    }
    if (result in codex) return false;
    codex[result] = `${a} + ${b}`;
    saveCodex();
    renderCodex();
    toast(`New discovery: ${result}`);
    return true;
  },

  dragOver(card, at) {
    binEl.classList.toggle('show', !!card);
    binEl.classList.toggle('hot', !!card && !!at && overBin(at));
  },

  dropOn(card, at) {
    binEl.classList.remove('show', 'hot');
    if (!overBin(at)) return false;
    const r = binEl.getBoundingClientRect();
    const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    table.consume(card, to, () => fx.puff(to.x, to.y));
    return true;
  },

  async resolve(a, b) {
    try {
      const answer = await combineRemote(a, b);
      if (answer.result) registerElement(answer.result);
      if (answer.capped) {
        // Over today's spending cap: don't cache "nothing", so the pair can be tried again later.
        toast(answer.reason === 'credits'
          ? 'OpenAI credits have run out: only known recipes work until you top up'
          : 'Daily budget reached: only known recipes until tomorrow');
        return null;
      }
      storeRecipe(a, b, answer.result?.name ?? null);
      return answer.result?.name ?? null;
    } catch (err) {
      toast('The game server is offline: only known recipes work');
      throw err;
    }
  },
}, fx);

app.stage.eventMode = 'static';
app.stage.hitArea = app.screen;
const grain = new TilingSprite({ texture: grainTexture(), width: app.screen.width, height: app.screen.height });
grain.alpha = 0.8;
app.stage.addChild(grain, table, fx);
table.attach(app.stage);

// --- Almanac sidebar (collapsible, hidden by default) -------------------------------------------------

const SIDEBAR_KEY = 'valley.almanacOpen';
const SIDEBAR_W = 272; // panel width + margin
const codexEl = document.getElementById('codex')!;
const codexToggle = document.getElementById('codex-toggle')!;
const sidebarOpen = () => codexEl.classList.contains('open');
function setSidebar(open: boolean): void {
  codexEl.classList.toggle('open', open);
  codexToggle.setAttribute('aria-expanded', String(open));
  try { localStorage.setItem(SIDEBAR_KEY, open ? '1' : '0'); } catch { /* ignore */ }
  layout();
}
codexToggle.addEventListener('click', () => setSidebar(!sidebarOpen()));
try { codexEl.classList.toggle('open', localStorage.getItem(SIDEBAR_KEY) === '1'); } catch { /* default closed */ }
codexToggle.setAttribute('aria-expanded', String(sidebarOpen()));

function codexWidth(): number {
  return sidebarOpen() && window.innerWidth > 720 ? SIDEBAR_W : 0;
}

function layout(): void {
  table.resize(app.screen.width - codexWidth(), app.screen.height);
  grain.width = app.screen.width;
  grain.height = app.screen.height;
}

function dealStartCards(): void {
  const w = app.screen.width - codexWidth();
  const top = TABLE_TOP; // clear of the HUD
  const gapX = CARD_W + 24;
  const cols = Math.max(1, Math.min(START_CARDS.length, Math.floor((w - 40) / gapX)));
  const rows = Math.ceil(START_CARDS.length / cols);
  const gapY = Math.min(CARD_H + 32, Math.max(CARD_H * 0.6, (app.screen.height - top - CARD_H) / Math.max(1, rows - 1)));
  const startY = top + CARD_H / 2;
  START_CARDS.forEach((name, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = w / 2 + (col - (cols - 1) / 2) * gapX;
    table.spawn(name, x, startY + row * gapY);
  });
}

// --- Days ------------------------------------------------------------------------------------------

let day = 1;
let dayTime = 0;
let stuckTime = 0;

/**
 * True if any two idle cards could still make something: a known recipe, or (with the server up)
 * a pair nobody has tried yet.
 */
function canCombine(): boolean {
  const names = table.cards.filter((c) => !c.busy).map((c) => c.def.name);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const result = lookupRecipe(names[i], names[j]);
      if (result || (online && result === undefined)) return true;
    }
  }
  return false;
}

/**
 * How much a card would unlock with what's on the table: a recipe you haven't made yet is worth the most,
 * one you've made is worth a little, an untried pair (server up) might make something.
 */
function unlockScore(candidate: string, onTable: string[]): number {
  let score = 0;
  const partners = new Set(onTable);
  if (onTable.includes(candidate)) partners.add(candidate); // a second copy can pair with the first
  for (const other of partners) {
    const result = lookupRecipe(candidate, other);
    if (result) score += result in codex ? 0.5 : 5;
    else if (online && result === undefined) score += 0.3;
  }
  return score;
}

const copiesOf = (name: string, onTable: string[]) => onTable.filter((n) => n === name).length;

/** Pick the best-scoring card from a pool (ties broken randomly), or null if the pool is empty. */
function best(pool: string[], onTable: string[]): { name: string; score: number } | null {
  let top: { name: string; score: number } | null = null;
  for (const name of pool) {
    if (copiesOf(name, onTable) >= MAX_COPIES) continue;
    const score = unlockScore(name, onTable) + Math.random() * 0.2;
    if (!top || score > top.score) top = { name, score };
  }
  return top;
}

/** The basic (or discovered weather card) that completes the most valuable recipe with the table. */
function missingPiece(onTable: string[]): string {
  const pool = [...BASICS, ...WEATHER.filter((n) => n in codex)];
  const pick = best(pool, onTable);
  if (pick && pick.score >= 1) return pick.name;
  // Nothing specific to unlock: top up whichever basic you have least of.
  const fewest = Math.min(...BASICS.map((n) => copiesOf(n, onTable)));
  const low = BASICS.filter((n) => copiesOf(n, onTable) === fewest);
  return low[Math.floor(Math.random() * low.length)];
}

/** Sometimes a rarer card you've already made, so you can skip ahead; otherwise another missing piece. */
const TRAIT_CHANCE = 0.45;
const isLiving = (name: string) => {
  const t = ELEMENTS[name]?.tags ?? [];
  return name === 'Life' || (t.includes('alive') && (t.includes('animal') || t.includes('fish') || t.includes('bird') || t.includes('insect')));
};

function wildcard(onTable: string[]): string {
  // With Life or a creature on the table, often bring a trait to shape it into a new species.
  if (onTable.some(isLiving) && Math.random() < TRAIT_CHANCE) {
    const traits = TRAITS.filter((t) => !onTable.includes(t));
    if (traits.length) return traits[Math.floor(Math.random() * traits.length)];
  }
  if (Math.random() < WILDCARD_CHANCE) {
    const advanced = Object.keys(codex).filter(
      (n) => !BASICS.includes(n) && !WEATHER.includes(n) && !TRAITS.includes(n) && !ELEMENTS[n]?.worker,
    );
    const pick = best(advanced, onTable);
    if (pick && pick.score >= 1) return pick.name;
  }
  return missingPiece(onTable);
}

function pickDeliveries(onTable: string[]): string[] {
  const room = Math.max(0, TABLE_CAP - onTable.length);
  const picks: string[] = [];
  const plan = [missingPiece, wildcard].slice(0, Math.min(CARDS_PER_DAWN, room));
  for (const choose of plan) {
    const pick = choose([...onTable, ...picks]); // the second pick accounts for the first
    picks.push(pick);
  }
  return picks;
}

function dawn(): void {
  day += 1;
  dayTime = 0;
  stuckTime = 0;
  const picks = pickDeliveries(table.cards.map((c) => c.def.name));
  picks.forEach((name, i) => table.deliver(name, i * 0.18));
  // Deliveries count as found: log them in the Almanac (this round, and all time if they're new).
  let changed = false;
  for (const name of picks) {
    if (!foundThisRound.has(name)) {
      foundThisRound.add(name);
      changed = true;
    }
    if (!(name in codex)) {
      codex[name] = 'Arrived at dawn';
      changed = true;
    }
  }
  if (changed) {
    saveCodex();
    renderCodex();
  }
  toast(picks.length ? `Day ${day}: ${picks.join(' and ')} arrive` : `Day ${day}: the table is full`);
}

const nextDayBtn = document.getElementById('next-day')!;

// Sensible / Wild toggle.
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('.mode button')];
function showMode(): void {
  for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
}
for (const b of modeButtons) {
  b.addEventListener('click', () => {
    const next = b.dataset.mode as Mode;
    if (next === mode) return;
    setMode(next);
    showMode();
    toast({
      sensible: 'Sensible: only obvious combinations work',
      inventive: 'Inventive: Life, traits and creatures open new branches',
      wild: 'Wild: every pair makes something',
    }[next]);
  });
}
showMode();
nextDayBtn.addEventListener('click', () => dawn());

// Pause: the day stops, so no new cards arrive until you resume (Next day still works by hand).
let dayPaused = false;
const pauseBtn = document.getElementById('pause-day')!;
pauseBtn.addEventListener('click', () => {
  dayPaused = !dayPaused;
  pauseBtn.setAttribute('aria-pressed', String(dayPaused));
  pauseBtn.textContent = dayPaused ? 'Resume' : 'Pause';
  pauseBtn.closest('.day-slip')?.classList.toggle('paused', dayPaused);
  toast(dayPaused ? 'Day paused: no new cards will arrive' : 'Day resumed');
});

// Clear table: sweep every card away and deal the starting elements again. Progress (Almanac, day, mode) stays.
document.getElementById('clear-table')!.addEventListener('click', () => {
  for (const c of table.cards) fx.puff(c.x, c.y);
  table.clear();
  dealStartCards();
  toast('Table cleared. Your Almanac is untouched');
});

document.getElementById('reset')!.addEventListener('click', () => {
  for (const n of Object.keys(codex)) if (!START_CARDS.includes(n)) delete codex[n];
  saveCodex();
  table.clear();
  dealStartCards();
  day = 1;
  dayTime = 0;
  renderCodex();
});

// --- Art that gets drawn while you play -------------------------------------------------------------

/** Ask the server about cards on the table that have no art yet, and swap art in as it lands. */
async function pollArt(): Promise<void> {
  if (!online) return;
  const missing = [...new Set(table.cards.map((c) => c.def.name))].filter((n) => !artFor(n));
  if (!missing.length) return;
  try {
    const status = await artStatus(missing);
    const ready: [string, string][] = [];
    for (const [name, st] of Object.entries(status)) {
      if (!st || !ELEMENTS[name]) continue;
      if (st.motion && st.motion !== ELEMENTS[name].motion) ELEMENTS[name].motion = st.motion as Motion; // chosen from the art
      if (st.art === 'ready' && st.url) ready.push([name, st.url]);
      else if (st.art === 'none') {
        // On the table but never drawn (e.g. made from a cached answer before this fix): ask for it.
        void requestArt([name]).catch(() => {});
      }
      else if (ELEMENTS[name].art !== st.art) {
        // e.g. queued → failed: switch between the press and the plain disc.
        ELEMENTS[name].art = st.art;
        table.refreshArt(name);
      }
    }
    for (const name of await loadArt(ready)) {
      ELEMENTS[name].art = 'ready';
      table.refreshArt(name);
    }
    if (ready.length) renderCodex();
  } catch { /* try again next tick */ }
}
setInterval(pollArt, ART_POLL_MS);

/** Whenever the table changes, ask the server to pre-decide the new pairs so drops answer instantly. */
let lastTable = '';
setInterval(() => {
  if (!online) return;
  const names = table.cards.filter((c) => !c.busy).map((c) => c.def.name).sort();
  const signature = `${mode}:${names.join('|')}`;
  if (signature === lastTable) {
    void syncRecipes(); // pick up what the server decided since the last change
    return;
  }
  lastTable = signature;
  prefetchPairs(names);
}, PREFETCH_CHECK_MS);

// --- Go --------------------------------------------------------------------------------------------

layout();
window.addEventListener('resize', layout);
dealStartCards();
renderCodex();
if (!serverElements) toast('The game server is offline: only known recipes work');

let time = 0;
app.ticker.add((ticker) => {
  const dt = Math.min(0.05, ticker.deltaMS / 1000);
  time += dt;
  if (!dayPaused) dayTime += dt;
  // Nothing left to combine: don't make the player wait out the day.
  stuckTime = table.cards.some((c) => c.busy) || canCombine() ? 0 : stuckTime + dt;
  // Stuck: nudge the Next day button rather than flooding the table with early dawns.
  nextDayBtn.classList.toggle('nudge', stuckTime >= STUCK_GRACE);
  if (dayTime >= DAY_SECONDS) dawn();
  dayEl.textContent = `Day ${day}`;
  const dayPct = `${Math.min(100, (dayTime / DAY_SECONDS) * 100)}%`;
  dayBarEl.style.width = dayPct;
  daySunEl.style.left = dayPct;
  updateTweens(dt);
  table.update(time, dt);
  fx.update(dt);
});

// Dev hook for automated checks; not part of gameplay.
if (import.meta.env.DEV) {
  (window as unknown as { __valley: unknown }).__valley = { app, table, codex, dawn, pickDeliveries, debug: () => ({ online, canCombine: canCombine(), stuckTime, recipes: RECIPES.size }) };
}
