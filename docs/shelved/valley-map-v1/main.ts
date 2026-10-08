import { Application, Graphics, Texture, TilingSprite } from 'pixi.js';
import { artStatus, combineRemote, fetchElements, fetchRecipes, online, prefetchPairs, requestArt } from './api';
import { ELEMENTS, RECIPES, START_CARDS, registerElement, type ElementDef, type Motion } from './data/elements';
import { CARD_W } from './game/Card';
import { artFor, artUrl, loadArt, seedArtEntries } from './game/art';
import { Fx } from './game/Fx';
import { lookupRecipe, mode, setMode, storeRecipe, type Mode } from './game/mode';
import { Table } from './game/Table';
import { Valley } from './game/Valley';
import type { Resident } from './game/Resident';
import { grow, produce } from './game/rules';
import { DAYS_PER_SEASON, MAX_VITALITY, SEASONS, newYear, nextDay, offer, type YearState } from './game/seasons';
import { ZONES, zoneForHabitat } from './game/zones';
import { updateTweens } from './game/tween';
import { INK } from './theme';

const STORAGE_KEY = 'valley.m1.codex';

/** Basic cards that trickle in each dawn, so you can never get stuck. */
const BASICS = ['Water', 'Soil', 'Stone', 'Sun', 'Seed'];
/** Simple weather cards that can also arrive at dawn once you've discovered them. */
const WEATHER = ['Rain', 'Cloud', 'Wind'];
const DAY_SECONDS = 20; // tuning placeholder
const STUCK_GRACE = 2; // seconds with no possible combination before the Next day button nudges you
const CARDS_PER_DAWN = 2; // tuning placeholder
const TABLE_CAP = 12; // no deliveries once the tray holds this many cards
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

function renderCodex(): void {
  countEl.textContent = `${Object.keys(codex).length} found`;
  listEl.replaceChildren(
    ...Object.entries(codex).map(([name, from]) => {
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
const table = new Table({
  onCombine(result, a, b) {
    // Answers can come from the local cache, so tell the server the card was made: that's what earns it art.
    const def = ELEMENTS[result];
    if (online && !artFor(result) && def.art !== 'queued' && def.art !== 'drawing') {
      def.art = 'queued'; // show the printing press right away
      requestArt([result]).catch(() => { /* the art poll will sort it out */ });
    }
    if (result in codex) return false;
    codex[result] = `${a} + ${b}`;
    saveCodex();
    renderCodex();
    year.discoveriesThisYear += 1;
    const opened = valley.unlockFor(def.habitat);
    if (opened) {
      saveZones();
      toast(`New discovery: ${result}. The ${opened.label} opens!`);
    } else toast(`New discovery: ${result}`);
    return true;
  },

  dragOver(card, at) {
    valley.showDrop(card?.def ?? null, at);
    showDropHint(card?.def ?? null, at);
  },

  dropAbove(card, at) {
    const def = card.def;
    if (valley.isOverHeart(at)) {
      const need = offer(year, def.name);
      if (!need) {
        toast(`The Heart Spring doesn't need ${def.name} right now`);
        return false;
      }
      const heart = valley.heartScreen();
      table.consume(card, heart, () => {
        valley.heartGulp();
        fx.ring(heart.x, heart.y, INK.teal, 70, 5);
        fx.burst(heart.x, heart.y, [INK.blue, INK.teal, def.color], 14, 180);
      });
      renderHeart();
      toast(year.needs.every((n) => n.met) ? 'The Heart Spring is content for this season' : `The Heart Spring takes ${def.name}`);
      return true;
    }
    if (!valley.isOver(at)) return false;
    const placed = valley.place(def, at);
    if (!placed.ok) {
      const home = zoneForHabitat(def.habitat);
      const why = {
        'no-home': `${def.name} doesn't live in the valley`,
        locked: `${def.name} belongs in the ${home?.label}, which is still locked`,
        full: `The ${home?.label} is full`,
        'wrong-zone': `${def.name} belongs in the ${home?.label}`,
      }[placed.reason];
      toast(why);
      return false;
    }
    // Hide the new resident until the card has flown into place.
    placed.resident.visible = false;
    table.consume(card, at, () => {
      placed.resident.visible = true;
      fx.dust(at.x, at.y, 6);
    });
    return true;
  },

  async resolve(a, b) {
    try {
      const answer = await combineRemote(a, b);
      if (answer.result) registerElement(answer.result);
      if (answer.capped) {
        // Over today's spending cap: don't cache "nothing", so the pair can be tried again later.
        toast('Daily budget reached: only known recipes until tomorrow');
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
grain.eventMode = 'none'; // decoration only: it must not block clicks on the valley beneath it

// --- The valley ------------------------------------------------------------------------------------

const ZONES_KEY = 'valley.zones';
const valley = new Valley((r: Resident) => {
  // Clicking a resident takes it back to the table as a card.
  const from = valley.toScreen({ x: r.x, y: r.y - 20 });
  valley.remove(r);
  table.deliverFrom(r.def.name, from);
});
function loadZones(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(ZONES_KEY) ?? '[]') as unknown;
    if (Array.isArray(saved)) return saved.filter((z): z is string => typeof z === 'string');
  } catch { /* fresh */ }
  return [];
}
function saveZones(): void {
  const open = ZONES.filter((z) => valley.isUnlocked(z.id)).map((z) => z.id);
  try { localStorage.setItem(ZONES_KEY, JSON.stringify(open)); } catch { /* ignore */ }
}
valley.setUnlocked([...ZONES.filter((z) => !z.startsLocked).map((z) => z.id), ...loadZones()]);
// Zones you've already found cards for are open too (e.g. after a cleared save).
for (const name of Object.keys(codex)) valley.unlockFor(ELEMENTS[name]?.habitat);

// The card tray: a paper strip along the bottom, over the map.
const TRAY_H = 144;
const TRAY_MARGIN = 14; // the tray floats this far off the bottom and sides
const tray = new Graphics();
tray.eventMode = 'none';

app.stage.addChild(valley, grain, tray, table, fx); // grain over the map too, like printed paper
table.attach(app.stage);

// --- Almanac sidebar (collapsible) -------------------------------------------------------------------

const SIDEBAR_KEY = 'valley.almanacOpen';
const SIDEBAR_W = 272; // panel width + margin
const codexEl = document.getElementById('codex')!;
const codexToggle = document.getElementById('codex-toggle')!;
function sidebarOpen(): boolean {
  return codexEl.classList.contains('open');
}
function setSidebar(open: boolean): void {
  codexEl.classList.toggle('open', open);
  codexToggle.setAttribute('aria-expanded', String(open));
  try { localStorage.setItem(SIDEBAR_KEY, open ? '1' : '0'); } catch { /* ignore */ }
  layout();
}
codexToggle.addEventListener('click', () => setSidebar(!sidebarOpen()));
// Hidden by default; remembers if you open it.
try { codexEl.classList.toggle('open', localStorage.getItem(SIDEBAR_KEY) === '1'); } catch { /* default closed */ }
codexToggle.setAttribute('aria-expanded', String(sidebarOpen()));

function codexWidth(): number {
  return sidebarOpen() && window.innerWidth > 720 ? SIDEBAR_W : 0;
}

function trayTop(): number {
  return app.screen.height - TRAY_H - TRAY_MARGIN;
}

function layout(): void {
  const w = app.screen.width;
  const h = app.screen.height;
  const trayW = w - codexWidth() - TRAY_MARGIN * 2;
  valley.resize(w, h, TRAY_H + TRAY_MARGIN);
  table.resize(w - codexWidth(), h - TRAY_MARGIN, trayTop());
  tray.clear()
    .roundRect(TRAY_MARGIN + 4, trayTop() + 5, trayW, TRAY_H, 20).fill({ color: INK.teal, alpha: 0.45 })
    .roundRect(TRAY_MARGIN, trayTop(), trayW, TRAY_H, 20).fill({ color: INK.paper, alpha: 0.94 });
  grain.width = w;
  grain.height = h;
}

function dealStartCards(): void {
  const w = app.screen.width - codexWidth();
  const gapX = CARD_W + 18;
  START_CARDS.forEach((name, i) => {
    const x = w / 2 + (i - (START_CARDS.length - 1) / 2) * gapX;
    table.spawn(name, x, trayTop() + TRAY_H / 2);
  });
}

// --- Drop hint: a little tag by the cursor while dragging over the world -----------------------------

const dropHintEl = document.getElementById('drop-hint')!;
function showDropHint(def: ElementDef | null, at: { x: number; y: number } | null): void {
  if (!def || !at || at.y > trayTop()) {
    dropHintEl.hidden = true;
    return;
  }
  let text: string;
  let ok = false;
  if (valley.isOverHeart(at)) {
    const wanted = year.needs.some((n) => !n.met && def.tags.includes(n.tag));
    text = wanted ? `Offer ${def.name} to the Heart Spring` : `The Heart Spring doesn't need ${def.name}`;
    ok = wanted;
  } else {
    const home = zoneForHabitat(def.habitat);
    if (!home) text = `${def.name} stays in your tray: combine it`;
    else if (!valley.isUnlocked(home.id)) text = `${def.name} lives in the ${home.label} (unexplored)`;
    else if (valley.zoneAt(at) === home) {
      ok = valley.residentsIn(home).length < home.capacity;
      text = ok ? `Let go to settle in the ${home.label}` : `The ${home.label} is full`;
    } else text = `${def.name} lives in the ${home.label}`;
  }
  dropHintEl.textContent = text;
  dropHintEl.classList.toggle('ok', ok);
  dropHintEl.style.transform = `translate(${Math.round(at.x + 22)}px, ${Math.round(at.y - 72)}px)`;
  dropHintEl.hidden = false;
}

// --- Panning and zooming the world ------------------------------------------------------------------

let panning: { x: number; y: number } | null = null;
app.stage.on('pointerdown', (e) => {
  // Only empty map (not a card, resident or the tray) starts a pan.
  if (e.target !== app.stage || e.global.y > trayTop()) return;
  panning = { x: e.global.x, y: e.global.y };
  app.canvas.style.cursor = 'grabbing';
});
app.stage.on('globalpointermove', (e) => {
  if (!panning) return;
  valley.panBy(e.global.x - panning.x, e.global.y - panning.y);
  panning = { x: e.global.x, y: e.global.y };
});
const endPan = () => {
  panning = null;
  app.canvas.style.cursor = '';
};
app.stage.on('pointerup', endPan);
app.stage.on('pointerupoutside', endPan);
app.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey) valley.zoomAt({ x: e.clientX, y: e.clientY }, Math.exp(-e.deltaY * 0.01)); // pinch / ctrl+scroll
  else valley.panBy(-e.deltaX, -e.deltaY);
}, { passive: false });

// --- Days ------------------------------------------------------------------------------------------

let day = 1;
let dayTime = 0;
let stuckTime = 0;

// --- Seasons and the Heart Spring ---------------------------------------------------------------

let year: YearState = newYear(1, Object.keys(codex));
const needsEl = document.getElementById('needs')!;
const vitalityEl = document.getElementById('vitality')!;

function renderHeart(): void {
  vitalityEl.replaceChildren(...Array.from({ length: MAX_VITALITY }, (_, i) => {
    const d = document.createElement('span');
    d.className = i < year.vitality ? 'drop' : 'drop empty';
    return d;
  }));
  needsEl.replaceChildren(...year.needs.map((n) => {
    const li = document.createElement('li');
    li.className = n.met ? 'met' : '';
    const box = document.createElement('span');
    box.className = 'box';
    box.textContent = n.met ? '✓' : '';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = n.label;
    li.append(box, label);
    if (n.by) {
      const by = document.createElement('span');
      by.className = 'by';
      by.textContent = n.by;
      li.append(by);
    }
    return li;
  }));
}

const yearEndEl = document.getElementById('year-end')!;
function endYear(reason: 'winter' | 'dry'): void {
  document.getElementById('year-title')!.textContent = reason === 'dry' ? 'The spring runs dry' : 'The year turns';
  document.getElementById('year-summary')!.textContent =
    `Year ${year.year}: the Heart was fed ${year.seasonsFed} of ${reason === 'dry' ? year.season + 1 : SEASONS.length} seasons, ` +
    `and you found ${year.discoveriesThisYear} new ${year.discoveriesThisYear === 1 ? 'thing' : 'things'}. ` +
    'Your Almanac and the zones you opened stay with you.';
  yearEndEl.hidden = false;
}
document.getElementById('new-year')!.addEventListener('click', () => {
  yearEndEl.hidden = true;
  year = newYear(year.year + 1, Object.keys(codex));
  valley.clearResidents();
  table.clear();
  dealStartCards();
  day = 1;
  dayTime = 0;
  renderHeart();
});

/** Dawn in the valley: zones produce, young things grow, residents age. */
function valleyDawn(): string[] {
  const made: string[] = [];
  let delay = 0.4;
  for (const zone of ZONES) {
    const rs = valley.residentsIn(zone);
    if (!rs.length) continue;
    for (const g of grow(rs)) {
      valley.replace(g.resident, ELEMENTS[g.into]);
      made.push(`${g.resident.def.name} grew into ${g.into}`);
    }
    for (const p of produce(zone, valley.residentsIn(zone))) {
      if (table.cards.length >= TABLE_CAP) break;
      table.deliverFrom(p.name, valley.toScreen({ x: p.from.x, y: p.from.y - 20 }), delay);
      delay += 0.2;
      made.push(p.name);
    }
  }
  for (const r of valley.allResidents()) r.age += 1;
  return made;
}

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
function wildcard(onTable: string[]): string {
  if (Math.random() < WILDCARD_CHANCE) {
    const advanced = Object.keys(codex).filter(
      (n) => !BASICS.includes(n) && !WEATHER.includes(n) && !ELEMENTS[n]?.worker,
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
  if (!yearEndEl.hidden) return;
  day += 1;
  dayTime = 0;
  stuckTime = 0;
  const picks = pickDeliveries(table.cards.map((c) => c.def.name));
  picks.forEach((name, i) => table.deliver(name, i * 0.18));
  const fromValley = valleyDawn();

  const turn = nextDay(year, Object.keys(codex));
  renderHeart();
  if (turn?.kind === 'year-over') {
    endYear(turn.reason);
    return;
  }
  if (turn?.kind === 'fed') {
    // A gift from the Heart: something you've discovered that isn't a basic.
    const gifts = Object.keys(codex).filter((n) => !BASICS.includes(n) && !ELEMENTS[n]?.worker);
    const gift = gifts.length ? gifts[Math.floor(Math.random() * gifts.length)] : 'Seed';
    table.deliverFrom(gift, valley.heartScreen(), 0.6);
    toast(`${turn.season} ends. The Heart Spring is fed and gives you ${gift}. ${SEASONS[year.season]} begins.`);
    return;
  }
  if (turn?.kind === 'hungry') {
    toast(`${turn.season} ends hungry. The Heart Spring weakens (${turn.vitality} left). ${SEASONS[year.season]} begins.`);
    return;
  }
  const valleyNote = fromValley.length ? ` · the valley gives ${fromValley.join(', ')}` : '';
  toast(picks.length ? `Day ${day}: ${picks.join(' and ')} arrive${valleyNote}` : `Day ${day}: the table is full${valleyNote}`);
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
    toast(next === 'wild' ? 'Wild: every pair makes something' : 'Sensible: only obvious combinations work');
  });
}
showMode();
nextDayBtn.addEventListener('click', () => dawn());

document.getElementById('reset')!.addEventListener('click', () => {
  for (const n of Object.keys(codex)) if (!START_CARDS.includes(n)) delete codex[n];
  saveCodex();
  table.clear();
  valley.clearResidents();
  valley.setUnlocked(ZONES.filter((z) => !z.startsLocked).map((z) => z.id));
  saveZones();
  year = newYear(1, Object.keys(codex));
  renderHeart();
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
      valley.refreshArt(name);
        valley.refreshArt(name);
      }
    }
    for (const name of await loadArt(ready)) {
      ELEMENTS[name].art = 'ready';
      table.refreshArt(name);
      valley.refreshArt(name);
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
valley.frameStart();
window.addEventListener('resize', layout);
void valley.loadMap('/map/world.png');
dealStartCards();
renderCodex();
renderHeart();
if (!serverElements) toast('The game server is offline: only known recipes work');

let time = 0;
app.ticker.add((ticker) => {
  const dt = Math.min(0.05, ticker.deltaMS / 1000);
  time += dt;
  dayTime += dt;
  // Nothing left to combine: don't make the player wait out the day.
  stuckTime = table.cards.some((c) => c.busy) || canCombine() ? 0 : stuckTime + dt;
  // Stuck: nudge the Next day button rather than flooding the table with early dawns.
  nextDayBtn.classList.toggle('nudge', stuckTime >= STUCK_GRACE);
  if (dayTime >= DAY_SECONDS) dawn();
  dayEl.textContent = `${SEASONS[year.season]} ${year.day}/${DAYS_PER_SEASON}`;
  const dayPct = `${Math.min(100, (dayTime / DAY_SECONDS) * 100)}%`;
  dayBarEl.style.width = dayPct;
  daySunEl.style.left = dayPct;
  updateTweens(dt);
  table.update(time, dt);
  valley.update(time, dt);
  fx.update(dt);
});

// Dev hook for automated checks; not part of gameplay.
if (import.meta.env.DEV) {
  (window as unknown as { __valley: unknown }).__valley = { app, table, valley, codex, dawn, pickDeliveries, get year() { return year; }, debug: () => ({ online, canCombine: canCombine(), stuckTime, recipes: RECIPES.size }) };
}
