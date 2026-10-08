// OpenAI access for the local game server. The key is read from the macOS Keychain once and kept in memory only.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const KEYCHAIN = '/Users/daniel/Library/Keychains/login.keychain-db';

// Prices in USD per million tokens, used for the spending cap (estimates, Oct 2026).
export const PRICES = {
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'gpt-image-2': { input: 8, output: 30 },
  'gpt-image-2.5-flare': { input: 8, output: 30 }, // assumed same as gpt-image-2 until confirmed
};

let key = null;

// When the account is out of credits, every call fails the same way. Pause all calls for a while instead of
// hammering the API, and let the game say so.
const CREDIT_PAUSE_MS = 5 * 60 * 1000;
let creditsOutUntil = 0;

export function creditsOut() {
  return Date.now() < creditsOutUntil;
}

function apiError(status, body) {
  const msg = body?.error?.message ?? 'unknown error';
  const err = new Error(`OpenAI ${status}: ${msg}`);
  if (status === 429 && (body?.error?.code === 'insufficient_quota' || /credit|quota|billing/i.test(msg))) {
    err.code = 'no_credits';
    if (!creditsOut()) console.error('OpenAI credits have run out: pausing model and art calls for 5 minutes');
    creditsOutUntil = Date.now() + CREDIT_PAUSE_MS;
  }
  return err;
}

async function apiKey() {
  if (key) return key;
  const { stdout } = await run('/usr/bin/security', ['find-generic-password', '-a', 'daniel', '-s', 'OpenAI API', '-w', KEYCHAIN]);
  key = stdout.trim();
  if (!key) throw new Error('OpenAI key not found in the Keychain');
  return key;
}

export function costOf(model, usage) {
  const p = PRICES[model];
  if (!p || !usage) return 0;
  return ((usage.input_tokens ?? 0) * p.input + (usage.output_tokens ?? 0) * p.output) / 1e6;
}

/** Responses API call with a strict JSON schema. Returns { data, usage }. */
export async function structured(model, system, user, name, schema, effort = 'low') {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      reasoning: { effort },
      text: { format: { type: 'json_schema', name, schema, strict: true } },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw apiError(res.status, body);
  const text = body.output
    ?.flatMap((item) => item.content ?? [])
    .find((c) => c.type === 'output_text')?.text;
  if (!text) throw new Error('OpenAI returned no text output');
  return { data: JSON.parse(text), usage: body.usage };
}

/** Like `structured`, but the user message also carries an image (PNG bytes). */
export async function structuredWithImage(model, system, text, png, name, schema) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'input_text', text },
            { type: 'input_image', image_url: `data:image/png;base64,${png.toString('base64')}`, detail: 'low' },
          ],
        },
      ],
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_schema', name, schema, strict: true } },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw apiError(res.status, body);
  const out = body.output?.flatMap((item) => item.content ?? []).find((c) => c.type === 'output_text')?.text;
  if (!out) throw new Error('OpenAI returned no text output');
  return { data: JSON.parse(out), usage: body.usage };
}

/** Image edit with a reference image (gpt-image-2 family). Returns { png: Buffer, usage }. */
export async function drawWithReference(prompt, referencePath, quality = 'low', model = 'gpt-image-2') {
  const form = new FormData();
  form.set('model', model);
  form.set('prompt', prompt);
  form.set('size', '1024x1024');
  form.set('quality', quality);
  form.set('output_format', 'png');
  form.set('n', '1');
  form.append('image[]', new Blob([await readFile(referencePath)], { type: 'image/png' }), 'reference.png');
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await apiKey()}` },
    body: form,
  });
  const body = await res.json();
  if (!res.ok) throw apiError(res.status, body);
  return { png: Buffer.from(body.data[0].b64_json, 'base64'), usage: body.usage };
}
