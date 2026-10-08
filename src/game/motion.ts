import type { Motion } from '../data/elements';

export interface Pose { x: number; y: number; sx: number; sy: number; rot: number; alpha: number }

const REST: Pose = { x: 0, y: 0, sx: 1, sy: 1, rot: 0, alpha: 1 };

/** Idle pose for a motion archetype at time t (seconds). The icon pivots at its base, except for spin. */
export function idlePose(motion: Motion, t: number): Pose {
  const p = { ...REST };
  const s = Math.sin;
  switch (motion) {
    case 'bob': p.y = s(t * 2.2) * 3; break;
    case 'sway': p.rot = s(t * 1.6) * 0.09; break;
    case 'flicker':
      p.sx = 1 + s(t * 13) * 0.04;
      p.sy = 1 + s(t * 11 + 1) * 0.08;
      p.rot = s(t * 9) * 0.05;
      break;
    case 'jiggle': { const k = s(t * 3.5); p.sx = 1 + k * 0.05; p.sy = 1 - k * 0.05; break; }
    case 'pulse': { const k = 1 + s(t * 3) * 0.06; p.sx = k; p.sy = k; break; }
    case 'float': p.y = s(t * 1.5) * 5 - 2; p.rot = s(t * 1.1) * 0.07; break;
    case 'drift': p.x = s(t * 0.8) * 4; p.y = s(t * 1.3) * 2; break;
    case 'rise': {
      const c = (t * 0.5) % 1;
      p.y = 2 - c * 7;
      p.alpha = 0.7 + 0.3 * Math.cos(c * Math.PI * 2);
      break;
    }
    case 'settle': {
      const c = (t % 3) / 3;
      if (c > 0.8) {
        const h = (c - 0.8) / 0.2; // 0..1 hop
        p.y = -s(h * Math.PI) * 4;
        p.sy = 1 + s(h * Math.PI * 2) * 0.05;
        p.sx = 2 - p.sy;
      }
      break;
    }
    case 'breathe': p.sx = 1 + s(t * 1.2) * 0.03; p.sy = 1 + s(t * 1.2) * 0.05; break;
    case 'twinkle': {
      const k = s(t * 5) * s(t * 1.7);
      p.alpha = 0.82 + 0.18 * k;
      p.sx = p.sy = 1 + 0.04 * k;
      break;
    }
    case 'spin': p.rot = t * 0.5; break;
    case 'wobble': {
      const c = t % 2.5;
      p.rot = s(c * 12) * 0.14 * Math.exp(-c * 2.5);
      break;
    }
    case 'droop': { const k = 0.5 + 0.5 * s(t * 0.9); p.sy = 1 - 0.05 * k; p.sx = 1 + 0.03 * k; break; }
    case 'shiver': if (s(t * 0.9) > 0.6) p.x = s(t * 45) * 1.2; break;
    case 'still': break;
  }
  return p;
}
