import { Container, type FederatedPointerEvent, Point } from 'pixi.js';
import { ELEMENTS } from '../data/elements';
import { lookupRecipe } from './mode';
import { Bubble } from './Bubble';
import { Card, CARD_H, CARD_W } from './Card';
import type { Fx } from './Fx';
import { tween } from './tween';
import { INK } from '../theme';

export interface TableEvents {
  /** Called when a recipe fires. Returns true if this is a first discovery. */
  onCombine(result: string, a: string, b: string): boolean;
  /**
   * Decide a pair the table has no recipe for (asks the game server). Resolves to the result's name,
   * or null for "nothing happens". Rejects if it can't be decided right now (offline).
   */
  resolve(a: string, b: string): Promise<string | null>;
  /** A card is being dragged at this screen point (null when the drag ends). Used to highlight valley zones. */
  dragOver?(card: Card | null, at: Point | null): void;
  /**
   * A card was released above the table (over the valley or the Heart). Return true if the game took it
   * (the table then forgets the card), false to send it back where it was picked up.
   */
  dropAbove?(card: Card, at: Point): boolean;
  /** Checked first on every release: return true if something else (e.g. the bin) took the card. */
  dropOn?(card: Card, at: Point): boolean;
}

const MERGE_TIME = 0.16;
/** Default top of the card area when no valley is above it. */
export const TABLE_TOP = 140; // below the two-row top bar

export class Table extends Container {
  private dragging: Card | null = null;
  private target: Card | null = null;
  private readonly grabOffset = new Point();
  private readonly pointer = new Point();
  private readonly pickupFrom = new Point();
  private lastDragX = 0;
  private dragVx = 0;
  /** Landing spots of cards still in flight, so deliveries don't pick the same place. */
  private readonly reserved = new Set<Point>();
  private readonly inFlight = new Set<Card>();
  private bubbles: Bubble[] = [];
  private bounds = { w: 800, h: 600, top: TABLE_TOP };

  constructor(private readonly events: TableEvents, private readonly fx: Fx) {
    super();
    this.sortableChildren = true;
  }

  get cards(): Card[] {
    return this.children.filter((c): c is Card => c instanceof Card);
  }

  /** The card area spans the full width and from `top` down to `h`; held cards can go anywhere. */
  resize(w: number, h: number, top = TABLE_TOP): void {
    this.bounds = { w, h, top };
  }

  spawn(name: string, x: number, y: number): Card {
    const card = new Card(ELEMENTS[name]);
    card.position.set(this.clampX(x), this.clampY(y));
    card.zIndex = this.topZ();
    card.on('pointerdown', (e: FederatedPointerEvent) => this.startDrag(card, e));
    this.addChild(card);
    return card;
  }

  /** A card arrives from above the table and lands in a free spot. */
  deliver(name: string, delay = 0): void {
    const spot = this.freeSpot();
    this.reserved.add(spot);
    const card = this.spawn(name, spot.x, spot.y);
    this.inFlight.add(card);
    const fromX = spot.x + (Math.random() - 0.5) * 160;
    const fromY = -CARD_H;
    card.position.set(fromX, fromY);
    card.launch(fromX < spot.x ? 1 : -1);
    card.visible = false;
    tween(card, delay, () => {}, () => {
      card.visible = true;
      tween(card, 0.55, (p) => {
        const e = 1 - Math.pow(1 - p, 3);
        card.x = fromX + (spot.x - fromX) * e;
        card.y = fromY + (spot.y - fromY) * p * p; // falls, accelerating
      }, () => {
        this.reserved.delete(spot);
        this.inFlight.delete(card);
        card.arrive();
        this.fx.dust(card.x, card.y + CARD_H / 2);
      });
    });
  }

  clear(): void {
    this.dragging = null;
    this.target = null;
    this.reserved.clear();
    this.inFlight.clear();
    for (const b of this.bubbles) b.destroy({ children: true });
    this.bubbles = [];
    for (const c of this.cards) c.destroy({ children: true });
  }

  update(time: number, dt: number): void {
    const card = this.dragging;
    if (card) {
      // The card itself follows the pointer exactly (see attach); here we only lean it with a smoothed speed.
      if (dt > 0) {
        const vx = (card.x - this.lastDragX) / dt;
        this.dragVx += (vx - this.dragVx) * Math.min(1, dt * 20);
        card.setDragVelocity(this.dragVx);
      }
      this.lastDragX = card.x;
      this.setTarget(this.cardUnder(card));
    }
    for (const c of this.cards) c.update(time, dt);
    this.bubbles = this.bubbles.filter((b) => {
      b.update(dt);
      if (b.done) b.destroy({ children: true });
      return !b.done;
    });
  }

  /** Wire stage-level pointer events (moves and releases can happen anywhere). */
  attach(stage: Container): void {
    stage.on('globalpointermove', (e: FederatedPointerEvent) => {
      this.toLocal(e.global, undefined, this.pointer);
      // Move the held card on the event itself, not the next frame, so it sticks to the cursor.
      const card = this.dragging;
      if (card) {
        card.position.set(this.clampX(this.pointer.x + this.grabOffset.x), this.clampHeldY(this.pointer.y + this.grabOffset.y));
        this.events.dragOver?.(card, new Point(this.pointer.x, this.pointer.y));
      }
    });
    stage.on('pointerup', () => this.endDrag());
    stage.on('pointerupoutside', () => this.endDrag());
  }

  private startDrag(card: Card, e: FederatedPointerEvent): void {
    if (card.busy || this.dragging) return;
    this.dragging = card;
    card.zIndex = this.topZ() + 1;
    this.toLocal(e.global, undefined, this.pointer);
    this.grabOffset.set(card.x - this.pointer.x, card.y - this.pointer.y);
    this.pickupFrom.set(card.x, card.y);
    this.lastDragX = card.x;
    this.dragVx = 0;
    card.pickUp();
  }

  /** Start dragging a fresh copy of a card from outside the canvas (the Almanac). Screen coordinates. */
  grabNew(name: string, x: number, y: number): void {
    if (this.dragging) return;
    const home = this.freeSpot(); // where it goes if it's refused
    const card = this.spawn(name, x, y);
    card.position.set(x, y);
    card.zIndex = this.topZ() + 1;
    this.dragging = card;
    this.pointer.set(x, y);
    this.grabOffset.set(0, 0);
    this.pickupFrom.set(home.x, home.y);
    this.lastDragX = x;
    this.dragVx = 0;
    card.pickUp();
  }

  /** Pointer moved outside the canvas during a drag (e.g. still over the Almanac). */
  dragTo(x: number, y: number): void {
    this.pointer.set(x, y);
    const card = this.dragging;
    if (card) {
      card.position.set(this.clampX(x + this.grabOffset.x), this.clampHeldY(y + this.grabOffset.y));
      this.events.dragOver?.(card, new Point(x, y));
    }
  }

  releaseDrag(): void {
    this.endDrag();
  }

  private endDrag(): void {
    const card = this.dragging;
    if (!card) return;
    this.dragging = null;
    this.events.dragOver?.(null, null);
    const at = new Point(this.pointer.x, this.pointer.y);
    if (this.events.dropOn?.(card, at)) {
      this.setTarget(null);
      return;
    }
    // Released above the card area: the valley or the Heart decides; otherwise it flies back.
    if (at.y < this.bounds.top) {
      this.setTarget(null);
      if (this.events.dropAbove?.(card, at)) return;
      this.flyBack(card, new Point(this.pickupFrom.x, this.pickupFrom.y));
      return;
    }
    // Snap to where the pointer actually is, so fast drops land on what's under the cursor.
    card.position.set(this.clampX(this.pointer.x + this.grabOffset.x), this.clampY(this.pointer.y + this.grabOffset.y));
    const target = this.cardUnder(card);
    this.setTarget(null);
    if (target) this.combine(card, target);
    else {
      card.land();
      this.fx.dust(card.x, card.y + CARD_H / 2, 5);
    }
  }

  combine(dragged: Card, target: Card): void {
    const origin = new Point(this.pickupFrom.x, this.pickupFrom.y);
    const known = lookupRecipe(dragged.def.name, target.def.name);
    // Answer locally only when we also have the result card's details (synced recipes may name new cards).
    if (known === null || (known !== undefined && known in ELEMENTS)) {
      const result = known;
      if (result) this.merge(dragged, target, result);
      else this.refuse(dragged, target, origin);
      return;
    }

    // Nobody has made this pair yet: hold the two cards together while the server decides.
    dragged.position.set(this.clampX(target.x + 12), this.clampY(target.y + 14));
    dragged.zIndex = this.topZ() + 1;
    dragged.setThinking(true);
    target.setThinking(true);
    const bubble = new Bubble();
    bubble.position.set(target.x + 6, target.y - CARD_H / 2 - 10);
    this.fx.addChild(bubble);
    this.bubbles.push(bubble);
    this.events.resolve(dragged.def.name, target.def.name).then(
      (result) => {
        if (dragged.destroyed || target.destroyed) return;
        dragged.setThinking(false);
        target.setThinking(false);
        if (result) {
          bubble.say('!', INK.yellow, 0.35);
          this.merge(dragged, target, result);
        } else {
          bubble.say('nothing happens', INK.paper, 1.1);
          this.refuse(dragged, target, origin);
        }
      },
      () => {
        bubble.say('offline', INK.paper, 1.1);
        if (dragged.destroyed || target.destroyed) return;
        dragged.setThinking(false);
        target.setThinking(false);
        this.refuse(dragged, target, origin);
      },
    );
  }

  /** Pull together, burst, and pop the result in. */
  private merge(dragged: Card, target: Card, result: string): void {
    const { x, y } = target.position;
    const from = { x: dragged.x, y: dragged.y };
    dragged.mergeOut();
    target.mergeOut();
    tween(dragged, MERGE_TIME, (p) => {
      const e = p * p;
      dragged.x = from.x + (x - from.x) * e;
      dragged.y = from.y + (y - from.y) * e;
    }, () => {
      if (dragged.destroyed || target.destroyed) return;
      const isNew = this.events.onCombine(result, dragged.def.name, target.def.name);
      const colors = [dragged.def.color, target.def.color, ELEMENTS[result].color];
      this.fx.flash(x, y);
      this.fx.ring(x, y, ELEMENTS[result].color, isNew ? 130 : 90, isNew ? 8 : 5);
      this.fx.burst(x, y, colors, isNew ? 30 : 18, isNew ? 340 : 260);
      if (isNew) {
        this.fx.ring(x, y, 0xf2b630, 180, 4, 0.7);
        this.fx.sparkle(x, y, 14);
      }
      // Both cards are always used up (Daniel, 2026-10-08: no more workers that survive a combination).
      dragged.destroy({ children: true });
      target.destroy({ children: true });
      const card = this.spawn(result, x, y);
      card.popIn(isNew);
    });
  }

  /** Send a card back to a spot on the table with a little hop. */
  flyBack(card: Card, to: Point): void {
    card.land();
    card.refuse();
    const fx = card.x;
    const fy = card.y;
    const tx = this.clampX(to.x);
    const ty = this.clampY(to.y);
    card.setBusy(true);
    tween(card, 0.38, (p) => {
      const e = 1 - Math.pow(1 - p, 3);
      card.x = fx + (tx - fx) * e;
      card.y = fy + (ty - fy) * e - Math.sin(p * Math.PI) * 30;
    }, () => {
      card.arrive();
      this.fx.dust(card.x, card.y + CARD_H / 2, 5);
    });
  }

  /** The card leaves the table toward a screen point (into the valley or the Heart), shrinking away. */
  consume(card: Card, to: { x: number; y: number }, then?: () => void): void {
    card.setBusy(true);
    const fx = card.x;
    const fy = card.y;
    tween(card, 0.28, (p) => {
      const e = p * p;
      card.x = fx + (to.x - fx) * e;
      card.y = fy + (to.y - fy) * e;
      card.scale.set(1 - 0.85 * e);
      card.alpha = 1 - e * 0.6;
    }, () => {
      card.destroy({ children: true });
      then?.();
    });
  }

  /** A card arrives on the table from a point on screen (e.g. produced by a valley zone). */
  deliverFrom(name: string, from: { x: number; y: number }, delay = 0): void {
    const spot = this.freeSpot();
    this.reserved.add(spot);
    const card = this.spawn(name, spot.x, spot.y);
    this.inFlight.add(card);
    card.position.set(from.x, from.y);
    card.scale.set(0.3);
    card.launch(from.x < spot.x ? 1 : -1);
    card.visible = false;
    tween(card, delay, () => {}, () => {
      card.visible = true;
      tween(card, 0.6, (p) => {
        const e = 1 - Math.pow(1 - p, 3);
        card.x = from.x + (spot.x - from.x) * e;
        card.y = from.y + (spot.y - from.y) * e - Math.sin(p * Math.PI) * 60;
        card.scale.set(0.3 + 0.7 * e);
      }, () => {
        this.reserved.delete(spot);
        this.inFlight.delete(card);
        card.arrive();
        this.fx.dust(card.x, card.y + CARD_H / 2);
      });
    });
  }

  /** Swap freshly drawn art onto every card of this name. */
  refreshArt(name: string): void {
    for (const c of this.cards) if (c.def.name === name) c.refreshArt();
  }

  /** Cards that don't combine: both shake, and the dragged card flies back to where it was picked up. */
  /**
   * Cards that don't combine: both shake, and the dragged card hops just clear of the other one
   * (a short bounce, not all the way back to where it came from).
   */
  private refuse(dragged: Card, target: Card, origin: Point): void {
    dragged.land();
    dragged.refuse();
    target.refuse();
    this.fx.puff((dragged.x + target.x) / 2, (dragged.y + target.y) / 2);
    // Bounce away from the target; if dropped dead centre, bounce toward where it came from.
    let dx = dragged.x - target.x;
    let dy = dragged.y - target.y;
    if (Math.hypot(dx, dy) < 4) [dx, dy] = [origin.x - target.x, origin.y - target.y];
    if (Math.hypot(dx, dy) < 1) [dx, dy] = [1, 0];
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    // Just far enough that the two cards no longer overlap.
    const reach = Math.min((CARD_W + 14) / Math.max(Math.abs(dx), 1e-3), (CARD_H + 14) / Math.max(Math.abs(dy), 1e-3));
    const fx = dragged.x;
    const fy = dragged.y;
    const tx = this.clampX(target.x + dx * reach);
    const ty = this.clampY(target.y + dy * reach);
    dragged.setBusy(true);
    tween(dragged, 0.28, (p) => {
      const e = 1 - Math.pow(1 - p, 3);
      dragged.x = fx + (tx - fx) * e;
      dragged.y = fy + (ty - fy) * e - Math.sin(p * Math.PI) * 14;
    }, () => {
      dragged.arrive();
      this.fx.dust(dragged.x, dragged.y + CARD_H / 2, 5);
    });
  }

  /** The card whose face contains the dragged card's centre (topmost wins). */
  private cardUnder(dragged: Card): Card | null {
    let best: Card | null = null;
    for (const c of this.cards) {
      if (c === dragged || c.busy) continue;
      if (Math.abs(c.x - dragged.x) < CARD_W * 0.55 && Math.abs(c.y - dragged.y) < CARD_H * 0.55) {
        if (!best || c.zIndex > best.zIndex) best = c;
      }
    }
    return best;
  }

  private setTarget(card: Card | null): void {
    if (card === this.target) return;
    this.target?.setTargeted(false);
    this.target = card;
    card?.setTargeted(true);
  }

  /** Pick the open spot farthest from existing cards. */
  /**
   * Where a new card should land: the free spot (not overlapping any card) closest to the middle of the table,
   * with a little jitter. If nothing is free, the emptiest spot.
   */
  private freeSpot(): Point {
    const taken = [...this.cards.filter((c) => !this.inFlight.has(c)).map((c) => c.position), ...this.reserved];
    const cx = this.bounds.w / 2;
    const cy = (this.bounds.top + this.bounds.h) / 2;
    let nearest: Point | null = null;
    let nearestD = Infinity;
    let emptiest = new Point(cx, cy);
    let emptiestScore = -1;
    const top = this.bounds.top + CARD_H / 2 + 8;
    for (let y = top; y <= this.bounds.h - CARD_H / 2 - 8; y += CARD_H / 3) {
      for (let x = CARD_W / 2 + 12; x <= this.bounds.w - CARD_W / 2 - 8; x += CARD_W / 3) {
        const clearance = taken.reduce((m, c) => Math.min(m, Math.max(Math.abs(c.x - x) / CARD_W, Math.abs(c.y - y) / CARD_H)), 99);
        if (clearance >= 1.1) {
          const d = Math.hypot((x - cx) / CARD_W, (y - cy) / CARD_H) + Math.random() * 0.6;
          if (d < nearestD) {
            nearestD = d;
            nearest = new Point(this.clampX(x), this.clampY(y));
          }
        } else if (clearance > emptiestScore) {
          emptiestScore = clearance;
          emptiest = new Point(this.clampX(x), this.clampY(y));
        }
      }
    }
    return nearest ?? emptiest;
  }

  private topZ(): number {
    return this.cards.reduce((m, c) => Math.max(m, c.zIndex), 0) + 1;
  }

  private clampX(x: number): number {
    return Math.min(this.bounds.w - CARD_W / 2 - 8, Math.max(CARD_W / 2 + 8, x));
  }

  private clampY(y: number): number {
    return Math.min(this.bounds.h - CARD_H / 2 - 8, Math.max(this.bounds.top + CARD_H / 2 + 8, y));
  }

  /** Held cards may be lifted over the valley. */
  private clampHeldY(y: number): number {
    return Math.min(this.bounds.h - CARD_H / 2 - 8, Math.max(CARD_H / 2 + 8, y));
  }
}
