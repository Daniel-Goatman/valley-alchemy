import { Container, Graphics, Text } from 'pixi.js';
import { FONT_NAME, INK } from '../theme';
import { Spring } from './spring';

/** Paper speech bubble shown over a pair of cards while the valley decides what they make. */
export class Bubble extends Container {
  private readonly bg = new Graphics();
  private readonly text: Text;
  private readonly pop = new Spring(0, 320, 16);
  private t = 0;
  private thinking = true;
  private fill: number = INK.paper;
  /** Seconds to wait before appearing, so instant answers don't flash a bubble. */
  private delay = 0.15;
  private dismissAt = Infinity;
  done = false;

  constructor() {
    super();
    this.text = new Text({ text: 'hmm', style: { fontFamily: FONT_NAME, fontSize: 15, fill: INK.text } });
    this.text.anchor.set(0.5);
    this.text.y = -24;
    this.addChild(this.bg, this.text);
    this.visible = false;
    this.redraw();
  }

  /** Stop thinking and show a result line, then disappear after `hold` seconds. */
  say(text: string, fill: number, hold: number): void {
    this.thinking = false;
    this.text.text = text;
    this.fill = fill;
    this.redraw();
    if (!this.visible) this.delay = 0; // show the verdict even if the answer was fast
    this.pop.impulse(-6);
    this.dismissAt = this.t + hold;
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.visible && this.t >= this.delay) {
      this.visible = true;
      this.pop.target = 1;
    }
    if (this.thinking) {
      const dots = Math.floor(this.t * 3) % 4;
      const next = `hmm${'.'.repeat(dots)}`;
      if (next !== this.text.text) this.text.text = next;
      this.rotation = Math.sin(this.t * 5) * 0.04;
    } else {
      this.rotation = 0;
    }
    if (this.t >= this.dismissAt) this.pop.target = 0;
    const s = Math.max(0, this.pop.step(dt));
    this.scale.set(s);
    if (this.t >= this.dismissAt && s < 0.05) this.done = true;
  }

  private redraw(): void {
    const w = Math.max(64, this.text.width + 26);
    const h = 30;
    this.bg.clear()
      .roundRect(-w / 2 + 3, -h - 9 + 4, w, h, 14).fill({ color: INK.teal, alpha: 0.5 }) // misprint
      .roundRect(-w / 2, -h - 9, w, h, 14).fill(this.fill)
      .poly([-7, -10, 7, -10, 0, 0]).fill(this.fill);
  }
}
