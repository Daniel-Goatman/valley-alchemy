import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { ElementDef } from '../data/elements';
import { idlePose } from './motion';
import { Spring } from './spring';
import { artFor } from './art';
import { PrintingIcon } from './PrintingIcon';
import { tween } from './tween';
import { FONT_NAME, FONT_UI, INK } from '../theme';

export const CARD_W = 92;
export const CARD_H = 112;
const ICON_R = 26;
const ICON_SIZE = 68; // art is square with its own margin
const ICON_BASE_Y = 16; // icon pivots at its base, this far below the card centre

let nextId = 1;

/**
 * A card on the table. The container's position is the card's logical spot on the table;
 * everything visual (lift, tilt, squash, shadow) is driven by springs on top of it.
 */
export class Card extends Container {
  readonly uid = nextId++;
  readonly def: ElementDef;
  /** True while the card is part of a merge or arrival and can't be picked up. */
  busy = false;

  private readonly shadow = new Graphics(); // teal misprint
  private readonly misprint = new Graphics(); // coral misprint, shows when lifted
  private readonly body = new Container();
  private readonly highlight = new Graphics();
  private readonly icon = new Container();
  private readonly newBadge = new Container();
  private readonly phase = Math.random() * 10;
  private iconY = ICON_BASE_Y;

  // Visual springs.
  private readonly lift = new Spring(0, 620, 38); // px the card floats above the table
  private readonly zoom = new Spring(1, 620, 36); // overall scale
  private readonly tilt = new Spring(0, 180, 20); // rotation (rad)
  private readonly squash = new Spring(0, 420, 26); // + = flattened, - = stretched (damped: about one wobble)
  private readonly iconSquash = new Spring(0, 380, 22);

  private hovered = false;
  private held = false;
  private thinking = false;
  private printing: PrintingIcon | null = null;
  private targeted = false;
  private shakeX = 0;

  constructor(def: ElementDef) {
    super();
    this.def = def;
    this.eventMode = 'static';
    this.cursor = 'grab';

    this.shadow.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10).fill(INK.teal);
    this.misprint.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10).fill(INK.coral);

    this.highlight
      .roundRect(-CARD_W / 2 - 5, -CARD_H / 2 - 5, CARD_W + 10, CARD_H + 10, 14)
      .stroke({ width: 4, color: INK.coral });
    this.highlight.visible = false;

    const face = new Graphics()
      .roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 10)
      .fill(INK.paper);

    this.buildIcon();

    const label = new Text({
      text: def.name,
      style: { fontFamily: FONT_NAME, fontSize: 14, fill: INK.text },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, CARD_H / 2 - 30);

    const pill = new Graphics().roundRect(-17, -9, 34, 18, 9).fill(INK.yellow);
    const pillText = new Text({ text: 'NEW', style: { fontFamily: FONT_UI, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, fill: INK.text } });
    pillText.anchor.set(0.5);
    this.newBadge.addChild(pill, pillText);
    this.newBadge.position.set(CARD_W / 2 - 8, -CARD_H / 2 + 2);
    this.newBadge.rotation = 0.14;
    this.newBadge.visible = false;

    this.body.addChild(this.highlight, face, this.icon, label, this.newBadge);
    this.addChild(this.shadow, this.misprint, this.body);

    this.on('pointerover', () => (this.hovered = true));
    this.on('pointerout', () => (this.hovered = false));
  }

  /** Swap in art that arrived after the card was created: printed cards reveal top to bottom. */
  refreshArt(): void {
    const wasPrinting = this.printing !== null;
    this.buildIcon();
    this.iconSquash.impulse(-5);
    const art = this.icon.children[0];
    if (!wasPrinting || !(art instanceof Sprite)) return;
    const mask = new Graphics();
    this.icon.addChild(mask);
    art.mask = mask;
    const top = this.def.motion === 'spin' ? -ICON_SIZE / 2 : -ICON_SIZE;
    tween(this, 0.6, (p) => {
      const e = 1 - Math.pow(1 - p, 2);
      mask.clear().rect(-ICON_SIZE / 2 - 2, top - 2, ICON_SIZE + 4, (ICON_SIZE + 4) * e).fill(0xffffff);
    }, () => {
      art.mask = null;
      mask.destroy();
    });
  }

  private buildIcon(): void {
    // Spin turns around the icon's centre; every other motion pivots at its base. (Motion can change once art is in.)
    const spins = this.def.motion === 'spin';
    this.iconY = spins ? ICON_BASE_Y - ICON_SIZE / 2 : ICON_BASE_Y;
    for (const child of this.icon.removeChildren()) child.destroy();
    this.printing = null;
    const texture = artFor(this.def.name);
    if (texture) {
      const art = new Sprite(texture);
      art.anchor.set(0.5, spins ? 0.5 : 1);
      art.setSize(ICON_SIZE);
      this.icon.addChild(art);
    } else if (this.def.art === 'queued' || this.def.art === 'drawing') {
      // Art is on its way: show the little riso press instead of a placeholder.
      this.printing = new PrintingIcon();
      if (spins) this.printing.y = ICON_SIZE / 2;
      this.icon.addChild(this.printing);
    } else {
      // No art yet: a flat disc in the element's ink.
      this.icon.addChild(new Graphics().circle(0, spins ? 0 : -ICON_R, ICON_R).fill(this.def.color));
    }
  }

  /** Waiting for the server to decide what this pair makes. */
  setThinking(on: boolean): void {
    this.thinking = on;
    this.setBusy(on);
    if (on) {
      this.held = false;
      this.targeted = false;
      this.highlight.visible = false;
      this.lift.target = 8;
      this.zoom.target = 1.04;
    }
  }

  update(time: number, dt: number): void {
    this.lift.target = this.held ? 14 : this.targeted ? 6 : this.busy ? this.lift.target : this.hovered ? 4 : 0;
    this.zoom.target = this.held ? 1.07 : this.targeted ? 1.06 : this.busy ? this.zoom.target : this.hovered ? 1.03 : 1;
    if (this.thinking) this.tilt.target = Math.sin(time * 7 + this.phase) * 0.07;
    else if (!this.held && !this.busy) this.tilt.target = this.targeted ? Math.sin(time * 18) * 0.035 : 0;

    const lift = this.lift.step(dt);
    const zoom = this.zoom.step(dt);
    const sq = this.squash.step(dt);

    this.body.position.set(this.shakeX, -lift);
    this.body.rotation = this.tilt.step(dt);
    this.body.scale.set(zoom * (1 + sq), zoom * (1 - sq));

    // The teal misprint slides further out as the card rises; a coral one appears on the other side.
    const up = Math.min(1, Math.max(0, lift / 14));
    this.shadow.position.set(4 + lift * 0.35, 5 + lift * 0.6);
    this.shadow.scale.set(zoom);
    this.shadow.alpha = 0.55 - up * 0.12;
    this.shadow.rotation = this.body.rotation;
    this.misprint.position.set(-2 * up, -lift - 1.5 * up);
    this.misprint.scale.set(zoom * (1 + sq), zoom * (1 - sq));
    this.misprint.alpha = 0.5 * up;
    this.misprint.rotation = this.body.rotation;

    this.printing?.update(dt);
    // The press stays still while it works; idle motion starts once the art is in.
    const pose = this.printing ? idlePose('still', 0) : idlePose(this.def.motion, time + this.phase);
    const isq = this.iconSquash.step(dt);
    this.icon.position.set(pose.x, this.iconY + pose.y);
    this.icon.scale.set(pose.sx * (1 + isq), pose.sy * (1 - isq));
    this.icon.rotation = pose.rot;
    this.icon.alpha = pose.alpha;

    if (this.highlight.visible) this.highlight.alpha = 0.65 + 0.35 * Math.sin(time * 10);
    if (this.newBadge.visible) this.newBadge.rotation = 0.14 + Math.sin(time * 4) * 0.06;
  }

  pickUp(): void {
    this.held = true;
    this.cursor = 'grabbing';
    this.squash.impulse(-1.2); // slight stretch as it leaves the table
    this.iconSquash.impulse(-1.2);
  }

  /** Lean into the drag direction based on horizontal speed (px/s). */
  setDragVelocity(vx: number): void {
    this.tilt.target = Math.max(-0.18, Math.min(0.18, vx * 0.0005));
  }

  /** Released onto empty table. */
  land(): void {
    this.held = false;
    this.cursor = 'grab';
    this.tilt.target = 0;
    this.squash.impulse(2.2);
    this.iconSquash.impulse(2);
  }

  setTargeted(on: boolean): void {
    this.targeted = on;
    this.highlight.visible = on;
    if (on) this.iconSquash.impulse(-1.5);
  }

  popIn(isNew: boolean): void {
    this.zoom.value = 0.15;
    this.zoom.velocity = 9;
    this.squash.impulse(-6);
    this.iconSquash.impulse(-7);
    this.tilt.value = (Math.random() - 0.5) * 0.5;
    if (isNew) this.showNewBadge();
  }

  /** Quick shake: "these don't combine". */
  refuse(): void {
    tween(this, 0.4, (p) => {
      this.shakeX = Math.sin(p * Math.PI * 7) * 6 * (1 - p);
    });
    this.squash.impulse(3);
  }

  /** Shrink and tip slightly while being merged. Leaves the card busy until destroyed. */
  mergeOut(): void {
    this.setBusy(true);
    this.held = false;
    this.targeted = false;
    this.highlight.visible = false;
    this.zoom.target = 0.8;
    this.lift.target = 10;
    this.tilt.target = (Math.random() - 0.5) * 0.4;
  }

  /** Land squash after flying in from off the table. */
  arrive(): void {
    this.setBusy(false);
    this.lift.target = 0;
    this.zoom.target = 1;
    this.tilt.target = 0;
    this.squash.impulse(6);
    this.iconSquash.impulse(6);
  }

  /** Card in flight (arrival): floats high and tilted. */
  launch(tiltDir: number): void {
    this.setBusy(true);
    this.lift.value = this.lift.target = 18;
    this.tilt.value = this.tilt.target = tiltDir * 0.3;
  }

  setBusy(on: boolean): void {
    this.busy = on;
    this.eventMode = on ? 'none' : 'static';
  }

  private showNewBadge(): void {
    this.newBadge.visible = true;
    this.newBadge.alpha = 1;
    tween(this, 4, (p) => {
      if (p > 0.9) this.newBadge.alpha = (1 - p) / 0.1;
    }, () => (this.newBadge.visible = false));
  }
}
