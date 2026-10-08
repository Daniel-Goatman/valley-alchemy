import { Container, Graphics, Sprite } from 'pixi.js';
import type { ElementDef } from '../data/elements';
import { INK } from '../theme';
import { artFor } from './art';
import { locomotionFor, type Locomotion } from './locomotion';
import { idlePose } from './motion';
import { Spring } from './spring';
import { randomPointIn, riverPoint, type Point, type Zone } from './zones';

const SIZE = 54; // icon size in map units

/** A card living in the valley: its art, moving around its zone. Click it to take it back as a card. */
export class Resident extends Container {
  readonly def: ElementDef;
  readonly zone: Zone;
  readonly loco: Locomotion;
  /** Dawns spent in the valley (used for growing up). */
  age = 0;

  private readonly body = new Container();
  private readonly icon = new Container();
  private readonly shadow = new Graphics();
  private readonly phase = Math.random() * 10;
  private readonly pop = new Spring(0, 300, 16);
  private target: Point;
  private pause = 0;
  private hopT = 0;
  // River swimmers travel along the river instead of to free points.
  private s = 0.2 + Math.random() * 0.6;
  private dir = Math.random() < 0.5 ? 1 : -1;
  private side = Math.random() * 2 - 1;

  constructor(def: ElementDef, zone: Zone, at: Point, onPick: (r: Resident) => void) {
    super();
    this.def = def;
    this.zone = zone;
    this.loco = zone.shape === 'river' && def.tags.includes('fish') ? 'swim' : locomotionFor(def);
    this.position.set(at.x, at.y);
    this.target = randomPointIn(zone);

    this.shadow.ellipse(0, 0, SIZE * 0.34, SIZE * 0.1).fill({ color: INK.text, alpha: 0.18 });
    this.body.addChild(this.icon);
    this.addChild(this.shadow, this.body);
    this.buildIcon();

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', () => onPick(this));
    this.pop.target = 1;
  }

  buildIcon(): void {
    for (const c of this.icon.removeChildren()) c.destroy();
    const tex = artFor(this.def.name);
    if (tex) {
      const s = new Sprite(tex);
      s.anchor.set(0.5, 1);
      s.setSize(SIZE);
      this.icon.addChild(s);
    } else {
      this.icon.addChild(new Graphics().circle(0, -SIZE * 0.4, SIZE * 0.36).fill(this.def.color));
    }
  }

  update(time: number, dt: number): void {
    const s = Math.max(0, this.pop.step(dt));
    this.scale.set(s);
    let lift = 0;

    switch (this.loco) {
      case 'swim': {
        this.s += this.dir * dt * 0.025;
        if (this.s > 0.92 || this.s < 0.06) this.dir *= -1;
        this.side += (Math.sin(time * 0.6 + this.phase) * 0.8 - this.side) * dt;
        const p = riverPoint(this.s, this.side);
        this.icon.scale.x = Math.cos(p.angle) * this.dir < 0 ? -1 : 1;
        this.position.set(p.x, p.y);
        lift = -Math.abs(Math.sin(time * 2 + this.phase)) * 2;
        break;
      }
      case 'flutter':
        this.moveToward(70, dt, 0);
        lift = 18 + Math.sin(time * 6 + this.phase) * 6;
        break;
      case 'wander':
        this.moveToward(26, dt, 1 + Math.random() * 2.5);
        break;
      case 'hop': {
        const moving = this.moveToward(34, dt, 1.5 + Math.random() * 2);
        this.hopT = moving ? this.hopT + dt * 5 : 0;
        lift = Math.abs(Math.sin(this.hopT)) * 9;
        break;
      }
      case 'drift':
        this.moveToward(9, dt, 0);
        lift = 12 + Math.sin(time * 1.2 + this.phase) * 4;
        break;
      case 'rooted':
        break;
    }

    // Idle motion on top (sway, flicker...), as on the cards.
    const pose = idlePose(this.def.motion, time + this.phase);
    this.body.position.set(pose.x, -lift + pose.y);
    this.body.rotation = pose.rot;
    this.body.scale.set(pose.sx, pose.sy);
    this.body.alpha = pose.alpha;
    this.shadow.scale.set(Math.max(0.5, 1 - lift / 40));
    this.shadow.alpha = Math.max(0.3, 1 - lift / 30);
  }

  /** Walk toward the current target; pick a new one after a pause. Returns true while moving. */
  private moveToward(speed: number, dt: number, pauseAfter: number): boolean {
    if (this.pause > 0) {
      this.pause -= dt;
      return false;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 3) {
      this.target = randomPointIn(this.zone);
      this.pause = pauseAfter;
      return false;
    }
    const step = Math.min(d, speed * dt);
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    if (Math.abs(dx) > 1) this.icon.scale.x = dx < 0 ? -1 : 1;
    return true;
  }
}
