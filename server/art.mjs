// Draws art for generated cards (when created or first used, see VALLEY_ART_ON) in the approved riso style.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { addSpend, artPromptFor, dataDir, getElement, setArt, setMotion, slug } from './db.mjs';
import { chooseMotion } from './motion.mjs';
import { costOf, creditsOut, drawWithReference } from './openai.mjs';
import { ROOT } from './paths.mjs';

const run = promisify(execFile);
const STYLE = JSON.parse(readFileSync(join(ROOT, 'art', 'style.json'), 'utf8'));
// Daniel, 2026-10-07: gpt-image-2.5-flare with the 768 px reference (about 11 s instead of 16, half the input cost).
const MODEL = process.env.VALLEY_ART_MODEL ?? 'gpt-image-2.5-flare';
const REFERENCE = join(ROOT, STYLE.reference_small ?? STYLE.reference);
const RAW = join(dataDir, 'cards', 'raw');
export const CARDS = join(dataDir, 'cards');
// Needs Pillow + NumPy; defaults to the Narrato venv, which has both.
const PYTHON = process.env.VALLEY_PYTHON ?? '/Users/daniel/Documents/GitHub/Narrato/.venv312/bin/python';
const CONCURRENCY = 2;
// Low: ~20 s and ~$0.019 per card; after riso processing it looks almost the same as medium (Daniel, 2026-10-07).
const QUALITY = process.env.VALLEY_ART_QUALITY ?? 'low';

const queue = [];
let running = 0;

/**
 * Queue a drawing if this card has none yet. `canSpend()` is checked again right before each drawing.
 * Player-made cards go to the front; pre-draws (`{ background: true }`) wait at the back.
 */
export function requestArt(name, canSpend, { background = false } = {}) {
  const el = getElement(name);
  // Already waiting as a pre-draw and now a player made it: move it to the front.
  if (!background && el?.art === 'queued') {
    const i = queue.findIndex((j) => j.name === name);
    if (i > 0) queue.unshift(...queue.splice(i, 1));
    return;
  }
  if (!el || (el.art !== 'none' && el.art !== 'failed')) return; // failed drawings get another go
  // Already drawn once (e.g. before a cache reset): reuse the file instead of paying again.
  if (existsSync(join(CARDS, `${slug(name)}.png`))) {
    setArt(name, 'ready', `/gen-cards/${slug(name)}.png`);
    return;
  }
  setArt(name, 'queued');
  if (background) queue.push({ name, canSpend });
  else queue.unshift({ name, canSpend });
  pump();
}

export function queuedCount() {
  return queue.length;
}

function pump() {
  while (running < CONCURRENCY && queue.length) {
    const job = queue.shift();
    running++;
    draw(job).finally(() => {
      running--;
      pump();
    });
  }
}

async function draw({ name, canSpend }) {
  if (!canSpend() || creditsOut()) {
    setArt(name, 'none'); // over today's cap or out of credits: try again later
    return;
  }
  setArt(name, 'drawing');
  try {
    const subject = artPromptFor(name) ?? name.toLowerCase();
    const { png, usage } = await drawWithReference(`${STYLE.style}${STYLE.frame} Subject: ${subject}.`, REFERENCE, QUALITY, MODEL);
    addSpend(costOf(MODEL, usage));
    await mkdir(RAW, { recursive: true });
    const raw = join(RAW, `${slug(name)}.png`);
    await writeFile(raw, png);
    await run(PYTHON, [join(ROOT, 'tools', 'process_cards.py'), '--file', raw, '--out', CARDS]);
    // Now that the picture exists, let a vision call choose how it should idle.
    try {
      const { motion, cost } = await chooseMotion(name, await readFile(join(CARDS, `${slug(name)}.png`)));
      addSpend(cost);
      setMotion(name, motion);
      console.log(`art: ${name} ready, motion ${motion}`);
    } catch (err) {
      console.error(`motion: ${name} kept its first guess: ${err.message}`);
    }
    setArt(name, 'ready', `/gen-cards/${slug(name)}.png`);
  } catch (err) {
    console.error(`art: ${name} failed: ${err.message}`);
    // Out of credits isn't the card's fault: leave it undrawn so it's retried once credits are back.
    setArt(name, err.code === 'no_credits' ? 'none' : 'failed');
  }
}
