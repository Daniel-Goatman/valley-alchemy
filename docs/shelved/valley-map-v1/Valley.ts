import { Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { ElementDef } from '../data/elements';
import { FONT_NAME, FONT_UI, INK } from '../theme';
import { Resident } from './Resident';
import { HEART, HEART_R, MAP_H, MAP_W, RIVER_PATH, ZONES, contains, zoneForHabitat, type Point, type Zone } from './zones';

export type PlaceResult = { ok: true; resident: Resident } | { ok: false; reason: 'no-home' | 'locked' | 'full' | 'wrong-zone' };

const MAX_ZOOM = 2.2;

/**
 * The world: a drawn map you pan and zoom around, full screen. Zones are areas of the drawing; they only
 * show an outline while a card is dragged over them. Locked areas sit under a paper fog.
 * Provisional look: pending Daniel's approval.
 */
export class Valley extends Container {
  readonly residents = new Container();
  private readonly map = new Container();
  private readonly ground = new Container();
  private readonly fog = new Container();
  private readonly labels = new Container();
  private readonly hover = new Graphics();
  private readonly heart = new Container();
  private readonly heartGlow = new Graphics();
  private unlocked = new Set<string>();
  private heartPulse = 0;
  private view = { w: 800, h: 600, bottomInset: 0 };
  private zoom = 1;

  constructor(private readonly onPick: (r: Resident) => void) {
    super();
    this.map.addChild(this.ground, this.fog, this.labels, this.hover, this.heart, this.residents);
    this.addChild(this.map);
    this.residents.sortableChildren = true;
    this.ground.addChild(this.fallbackGround());
    this.drawHeart();
    this.setUnlocked(ZONES.filter((z) => !z.startsLocked).map((z) => z.id));
  }

  /** Swap the drawn map in when it has loaded. */
  async loadMap(url: string): Promise<boolean> {
    try {
      const tex = await Assets.load<Texture>(url);
      const art = new Sprite(tex);
      art.setSize(MAP_W, MAP_H);
      for (const c of this.ground.removeChildren()) c.destroy();
      this.ground.addChild(art);
      return true;
    } catch {
      return false;
    }
  }

  // --- Camera ---------------------------------------------------------------------------------------

  /** Screen size, and how much of the bottom is covered by the card tray (so the map can scroll above it). */
  resize(w: number, h: number, bottomInset: number): void {
    this.view = { w, h, bottomInset };
    this.setZoom(Math.max(this.zoom, this.minZoom()));
  }

  /** Start centred on the Heart Spring and its river. */
  frameStart(): void {
    // A little zoomed out so you see most of the valley and can pan for the rest.
    this.setZoom(Math.max(this.minZoom(), 0.85));
    this.centerOn({ x: MAP_W * 0.55, y: MAP_H * 0.45 });
  }

  /** The smallest zoom at which the map still covers the whole screen. */
  private minZoom(): number {
    return Math.max(this.view.w / MAP_W, this.view.h / MAP_H);
  }

  private setZoom(z: number): void {
    this.zoom = Math.max(this.minZoom(), Math.min(MAX_ZOOM, z));
    this.map.scale.set(this.zoom);
    this.clampCamera();
  }

  private centerOn(p: Point): void {
    this.map.position.set(this.view.w / 2 - p.x * this.zoom, (this.view.h - this.view.bottomInset) / 2 - p.y * this.zoom);
    this.clampCamera();
  }

  /** Keep the map covering the screen; it can scroll far enough that its bottom clears the tray. */
  private clampCamera(): void {
    const w = MAP_W * this.zoom;
    const h = MAP_H * this.zoom;
    this.map.x = Math.min(0, Math.max(this.view.w - w, this.map.x));
    this.map.y = Math.min(0, Math.max(this.view.h - this.view.bottomInset - h, this.map.y));
  }

  panBy(dx: number, dy: number): void {
    this.map.x += dx;
    this.map.y += dy;
    this.clampCamera();
  }

  /** Zoom by a factor, keeping the screen point under the cursor fixed. */
  zoomAt(screen: Point, factor: number): void {
    const before = this.map.toLocal(screen);
    this.setZoom(this.zoom * factor);
    const after = this.map.toGlobal(before);
    this.panBy(screen.x - after.x, screen.y - after.y);
  }

  // --- Zones ----------------------------------------------------------------------------------------

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  setUnlocked(ids: Iterable<string>): void {
    this.unlocked = new Set(ids);
    this.redrawZones();
  }

  /** Unlock the zone for a habitat if it's locked. Returns the zone if this call unlocked it. */
  unlockFor(habitat: string | null | undefined): Zone | null {
    const z = zoneForHabitat(habitat);
    if (!z || this.unlocked.has(z.id)) return null;
    this.unlocked.add(z.id);
    this.redrawZones();
    return z;
  }

  private local(p: Point): Point {
    return this.map.toLocal(p);
  }

  toScreen(p: Point): Point {
    return this.map.toGlobal(p);
  }

  isOver(p: Point): boolean {
    const l = this.local(p);
    return l.x >= 0 && l.x <= MAP_W && l.y >= 0 && l.y <= MAP_H;
  }

  isOverHeart(p: Point): boolean {
    const l = this.local(p);
    return Math.hypot(l.x - HEART.x, l.y - HEART.y) <= HEART_R + 16;
  }

  zoneAt(p: Point): Zone | null {
    const l = this.local(p);
    // Areas first, so the river doesn't swallow everything it passes.
    const order = [...ZONES].sort((a, b) => (a.shape === 'river' ? 1 : 0) - (b.shape === 'river' ? 1 : 0));
    return order.find((z) => contains(z, l)) ?? null;
  }

  residentsIn(z: Zone): Resident[] {
    return this.residents.children.filter((r): r is Resident => r instanceof Resident && r.zone === z);
  }

  allResidents(): Resident[] {
    return this.residents.children.filter((r): r is Resident => r instanceof Resident);
  }

  place(def: ElementDef, at: Point): PlaceResult {
    const home = zoneForHabitat(def.habitat);
    if (!home) return { ok: false, reason: 'no-home' };
    if (!this.unlocked.has(home.id)) return { ok: false, reason: 'locked' };
    if (this.zoneAt(at) !== home) return { ok: false, reason: 'wrong-zone' };
    if (this.residentsIn(home).length >= home.capacity) return { ok: false, reason: 'full' };
    const resident = new Resident(def, home, this.local(at), this.onPick);
    this.residents.addChild(resident);
    return { ok: true, resident };
  }

  replace(old: Resident, def: ElementDef): Resident {
    const r = new Resident(def, old.zone, { x: old.x, y: old.y }, this.onPick);
    old.destroy({ children: true });
    this.residents.addChild(r);
    return r;
  }

  remove(r: Resident): void {
    r.destroy({ children: true });
  }

  clearResidents(): void {
    for (const r of this.allResidents()) r.destroy({ children: true });
  }

  refreshArt(name: string): void {
    for (const r of this.allResidents()) if (r.def.name === name) r.buildIcon();
  }

  /** While a card is dragged over the world: outline its home (teal if it can go there, coral if not). */
  showDrop(def: ElementDef | null, at: Point | null): void {
    this.hover.clear();
    if (!def || !at || !this.isOver(at)) return;
    const home = zoneForHabitat(def.habitat);
    const over = this.zoneAt(at);
    if (home && this.unlocked.has(home.id)) {
      const fits = over === home && this.residentsIn(home).length < home.capacity;
      this.outline(this.hover, home, fits ? INK.teal : INK.coral, 5 / this.zoom, false);
    } else if (over) {
      this.outline(this.hover, over, INK.coral, 4 / this.zoom, true);
    }
  }

  update(time: number, dt: number): void {
    for (const r of this.allResidents()) {
      r.update(time, dt);
      r.zIndex = r.y;
    }
    this.heartPulse += dt;
    const k = 1 + Math.sin(this.heartPulse * 2) * 0.06;
    this.heartGlow.scale.set(k);
    this.heartGlow.alpha = 0.5 + Math.sin(this.heartPulse * 2) * 0.2;
  }

  heartGulp(): void {
    this.heartPulse = -0.4;
  }

  heartScreen(): Point {
    return this.toScreen(HEART);
  }

  // --- Drawing ----------------------------------------------------------------------------------------

  /** Used until the drawn map loads (or if it can't): flat land with the river and areas. */
  private fallbackGround(): Graphics {
    const g = new Graphics().rect(0, 0, MAP_W, MAP_H).fill(0xece2c6);
    for (const z of ZONES) {
      if (z.shape === 'river') this.riverStroke(g, z.width, INK.blue, 0.4);
      else if (z.shape === 'ellipse') g.ellipse(z.cx, z.cy, z.rx, z.ry).fill({ color: z.color, alpha: 0.22 });
    }
    return g;
  }

  private redrawZones(): void {
    for (const c of this.fog.removeChildren()) c.destroy({ children: true });
    for (const c of this.labels.removeChildren()) c.destroy({ children: true });
    for (const z of ZONES) {
      const open = this.unlocked.has(z.id);
      if (!open && z.shape === 'ellipse') {
        // Paper fog over a locked area, soft-edged in a few layers.
        const fog = new Graphics();
        for (let i = 0; i < 4; i++) {
          fog.ellipse(z.cx, z.cy, z.rx * (1.12 - i * 0.07), z.ry * (1.12 - i * 0.07)).fill({ color: 0xf2ead6, alpha: 0.28 });
        }
        this.fog.addChild(fog);
        const dash = new Graphics();
        this.outline(dash, z, INK.text, 2, true, 0.35);
        this.fog.addChild(dash);
      }
      // Map-style place names.
      const label = new Text({ text: z.label, style: { fontFamily: FONT_NAME, fontSize: 26, fill: INK.text, letterSpacing: 1 } });
      label.anchor.set(0.5);
      label.position.set(z.labelAt.x, z.labelAt.y);
      label.alpha = open ? 0.8 : 0.45;
      this.labels.addChild(label);
      if (!open) {
        const lock = new Text({ text: 'UNEXPLORED', style: { fontFamily: FONT_UI, fontSize: 12, fontWeight: '700', letterSpacing: 2, fill: INK.text } });
        lock.anchor.set(0.5, 0);
        lock.position.set(z.labelAt.x, z.labelAt.y + 18);
        lock.alpha = 0.4;
        this.labels.addChild(lock);
      }
    }
  }

  private riverStroke(g: Graphics, width: number, color: number, alpha: number): void {
    g.moveTo(RIVER_PATH[0].x, RIVER_PATH[0].y);
    for (let i = 1; i < RIVER_PATH.length - 1; i++) {
      const p = RIVER_PATH[i];
      const n = RIVER_PATH[i + 1];
      g.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2);
    }
    const last = RIVER_PATH[RIVER_PATH.length - 1];
    g.lineTo(last.x, last.y);
    g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
  }

  private outline(g: Graphics, z: Zone, color: number, width: number, dashed: boolean, alpha = 0.9): void {
    if (z.shape === 'river') {
      this.riverStroke(g, z.width + 14, color, 0.45);
      return;
    }
    const pts: Point[] = [];
    if (z.shape === 'ellipse') {
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        pts.push({ x: z.cx + Math.cos(a) * z.rx, y: z.cy + Math.sin(a) * z.ry });
      }
    } else {
      const c = [{ x: z.x, y: z.y }, { x: z.x + z.w, y: z.y }, { x: z.x + z.w, y: z.y + z.h }, { x: z.x, y: z.y + z.h }, { x: z.x, y: z.y }];
      for (let i = 0; i < 4; i++) for (let k = 0; k < 12; k++) pts.push({ x: c[i].x + (c[i + 1].x - c[i].x) * (k / 12), y: c[i].y + (c[i + 1].y - c[i].y) * (k / 12) });
      pts.push(c[4]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (dashed && i % 2 === 1) continue;
      g.moveTo(pts[i].x, pts[i].y).lineTo(pts[i + 1].x, pts[i + 1].y);
    }
    g.stroke({ width, color, alpha, cap: 'round' });
  }

  private drawHeart(): void {
    // A soft glowing ring over the spring in the drawing, so it reads as something you can give to.
    this.heartGlow.circle(0, 0, HEART_R + 14).stroke({ width: 6, color: INK.yellow, alpha: 0.9 });
    const label = new Text({ text: 'Heart Spring', style: { fontFamily: FONT_NAME, fontSize: 24, fill: INK.text } });
    label.anchor.set(0.5, 0);
    label.position.set(0, HEART_R + 24);
    this.heart.addChild(this.heartGlow, label);
    this.heart.position.set(HEART.x, HEART.y);
  }
}
