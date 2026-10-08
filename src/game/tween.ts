// Minimal tween runner driven by the Pixi ticker.

/** Anything that can be torn down mid-animation (Pixi containers have `destroyed`). */
export interface TweenOwner { destroyed: boolean }

interface Tween { elapsed: number; duration: number; owner: TweenOwner; step: (p: number) => void; done?: () => void }

const tweens = new Set<Tween>();

/** Runs `step` with progress 0..1 each frame. Stops silently once `owner` is destroyed. */
export function tween(owner: TweenOwner, duration: number, step: (p: number) => void, done?: () => void): void {
  tweens.add({ elapsed: 0, duration, owner, step, done });
}

export function updateTweens(dt: number): void {
  for (const tw of tweens) {
    if (tw.owner.destroyed) {
      tweens.delete(tw);
      continue;
    }
    tw.elapsed += dt;
    const p = Math.min(1, tw.elapsed / tw.duration);
    tw.step(p);
    if (p >= 1) {
      tweens.delete(tw);
      tw.done?.();
    }
  }
}
