import { Container, Graphics, Text } from 'pixi.js';
import { FONT_UI, INK } from '../theme';

const SIZE = 60;
const PASS_TIME = 0.9;
const INKS = [INK.teal, INK.yellow, INK.coral, INK.blue];

/**
 * Placeholder while a card's art is being drawn: a little riso press. An ink roller sweeps down the
 * blank print area one ink at a time (teal, yellow, coral, blue), leaving bands of colour, then starts over.
 */
export class PrintingIcon extends Container {
  private readonly bands = new Graphics();
  private readonly roller = new Container();
  private readonly caption: Text;
  private t = 0;

  constructor() {
    super();
    const frame = new Graphics()
      .roundRect(-SIZE / 2, -SIZE, SIZE, SIZE, 6)
      .stroke({ width: 1.5, color: INK.blue, alpha: 0.35 });

    // Upright roller at the leading edge of the band, with a handle sticking up.
    const bandH = SIZE / INKS.length;
    const drum = new Graphics().roundRect(-4, -bandH / 2 - 3, 8, bandH + 6, 4).fill(INK.blue);
    const shine = new Graphics().roundRect(-2, -bandH / 2, 2, bandH, 1).fill({ color: 0xffffff, alpha: 0.35 });
    const handle = new Graphics()
      .moveTo(0, -bandH / 2 - 3).lineTo(7, -bandH / 2 - 11).lineTo(7, -bandH / 2 - 20)
      .stroke({ width: 2, color: INK.text });
    this.roller.addChild(handle, drum, shine);

    this.caption = new Text({ text: 'printing', style: { fontFamily: FONT_UI, fontSize: 9, fontWeight: '700', letterSpacing: 1, fill: INK.text } });
    this.caption.anchor.set(0.5, 1);
    this.caption.position.set(0, -SIZE - 2);
    this.caption.alpha = 0.55;

    this.addChild(frame, this.bands, this.roller, this.caption);
  }

  update(dt: number): void {
    this.t += dt;
    const pass = Math.floor(this.t / PASS_TIME) % (INKS.length + 1); // last slot = pause on the finished print
    const p = (this.t % PASS_TIME) / PASS_TIME;

    this.bands.clear();
    const bandH = SIZE / INKS.length;
    for (let i = 0; i < INKS.length; i++) {
      // Each finished pass leaves a band; the current pass grows its band behind the roller.
      const done = i < pass;
      const current = i === pass;
      if (!done && !current) continue;
      const w = done ? SIZE - 8 : (SIZE - 8) * p;
      this.bands.rect(-SIZE / 2 + 4, -SIZE + 4 + i * bandH, w, bandH - 3).fill({ color: INKS[i], alpha: 0.75 });
    }

    if (pass < INKS.length) {
      this.roller.visible = true;
      this.roller.y = -SIZE + 4 + pass * bandH + bandH / 2;
      this.roller.x = -SIZE / 2 + 4 + (SIZE - 8) * p;
      this.roller.rotation = Math.sin(this.t * 30) * 0.02;
    } else {
      this.roller.visible = false;
    }
    const dots = Math.floor(this.t * 3) % 4;
    this.caption.text = `printing${'.'.repeat(dots)}`;
  }
}
