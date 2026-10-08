// The hand-made valley map, in a fixed 1200 × 540 design space that the Valley scales to fit.
// Provisional layout and colours: pending Daniel's approval.
import { INK } from '../theme';

// Map units = pixels of the world map image (1536 × 1024). Zone shapes are traced to match the drawing.
export const MAP_W = 1536;
export const MAP_H = 1024;

export type Point = { x: number; y: number };

interface Base {
  id: string;
  habitat: string;
  label: string;
  color: number;
  capacity: number;
  /** Locked zones open when a card with this habitat is discovered. */
  startsLocked: boolean;
  labelAt: Point;
}

export type Zone =
  | (Base & { shape: 'ellipse'; cx: number; cy: number; rx: number; ry: number })
  | (Base & { shape: 'rect'; x: number; y: number; w: number; h: number })
  | (Base & { shape: 'river'; path: Point[]; width: number });

/** The river, traced along map B (art/map/b-angled.png): from the spring pool down to the marsh. */
export const RIVER_PATH: Point[] = [
  { x: 1040, y: 245 }, { x: 1085, y: 300 }, { x: 1120, y: 345 }, { x: 1000, y: 420 }, { x: 870, y: 470 },
  { x: 760, y: 545 }, { x: 640, y: 640 }, { x: 520, y: 700 }, { x: 420, y: 770 }, { x: 300, y: 860 }, { x: 150, y: 950 },
];

/** The spring pool at the top of the river. */
export const HEART: Point = { x: 1075, y: 195 };
export const HEART_R = 60;

// Areas traced to map B. Provisional until Daniel picks the map.
export const ZONES: Zone[] = [
  { id: 'river', habitat: 'river', label: 'River', color: INK.blue, capacity: 6, startsLocked: false,
    labelAt: { x: 930, y: 520 }, shape: 'river', path: RIVER_PATH, width: 60 },
  { id: 'meadow', habitat: 'meadow', label: 'Meadow', color: INK.yellow, capacity: 6, startsLocked: false,
    labelAt: { x: 760, y: 265 }, shape: 'ellipse', cx: 760, cy: 350, rx: 240, ry: 80 },
  { id: 'grove', habitat: 'grove', label: 'Grove', color: INK.teal, capacity: 6, startsLocked: false,
    labelAt: { x: 1150, y: 445 }, shape: 'ellipse', cx: 1150, cy: 700, rx: 200, ry: 230 },
  { id: 'settlement', habitat: 'settlement', label: 'Village', color: INK.coral, capacity: 5, startsLocked: false,
    labelAt: { x: 640, y: 450 }, shape: 'ellipse', cx: 660, cy: 615, rx: 290, ry: 140 },
  { id: 'marsh', habitat: 'marsh', label: 'Marsh', color: INK.teal, capacity: 5, startsLocked: true,
    labelAt: { x: 230, y: 660 }, shape: 'ellipse', cx: 230, cy: 830, rx: 230, ry: 180 },
  { id: 'hills', habitat: 'hills', label: 'Hills', color: INK.coral, capacity: 5, startsLocked: true,
    labelAt: { x: 300, y: 175 }, shape: 'ellipse', cx: 290, cy: 310, rx: 270, ry: 140 },
  { id: 'sky', habitat: 'sky', label: 'Sky', color: INK.blue, capacity: 4, startsLocked: true,
    labelAt: { x: 640, y: 40 }, shape: 'ellipse', cx: 770, cy: 95, rx: 740, ry: 75 },
  { id: 'coast', habitat: 'coast', label: 'Shore', color: INK.yellow, capacity: 4, startsLocked: true,
    labelAt: { x: 1420, y: 420 }, shape: 'ellipse', cx: 1400, cy: 720, rx: 130, ry: 320 },
];

export const zoneForHabitat = (habitat: string | null | undefined) => ZONES.find((z) => z.habitat === habitat);

function distToSegment(p: Point, a: Point, b: Point): { d: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { d: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)), t };
}

export function contains(z: Zone, p: Point): boolean {
  switch (z.shape) {
    case 'ellipse':
      return ((p.x - z.cx) / z.rx) ** 2 + ((p.y - z.cy) / z.ry) ** 2 <= 1;
    case 'rect':
      return p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;
    case 'river':
      for (let i = 0; i < z.path.length - 1; i++) if (distToSegment(p, z.path[i], z.path[i + 1]).d <= z.width / 2) return true;
      return false;
  }
}

/** A point along the river, `s` from 0 (spring) to 1 (mouth), offset sideways by `side` (-1..1). */
export function riverPoint(s: number, side = 0): Point & { angle: number } {
  const path = RIVER_PATH;
  const lens = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
  const total = lens.reduce((a, b) => a + b, 0);
  let d = Math.max(0, Math.min(1, s)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const a = path[i];
      const b = path[i + 1];
      const t = Math.min(1, d / lens[i]);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const off = side * 20;
      return { x: a.x + (b.x - a.x) * t - Math.sin(angle) * off, y: a.y + (b.y - a.y) * t + Math.cos(angle) * off, angle };
    }
    d -= lens[i];
  }
  return { ...path[path.length - 1], angle: 0 };
}

/** A random point well inside a zone (for residents to wander to). */
export function randomPointIn(z: Zone): Point {
  if (z.shape === 'river') return riverPoint(0.08 + Math.random() * 0.8, Math.random() * 2 - 1);
  for (let i = 0; i < 40; i++) {
    const p = z.shape === 'ellipse'
      ? { x: z.cx + (Math.random() * 2 - 1) * z.rx * 0.78, y: z.cy + (Math.random() * 2 - 1) * z.ry * 0.7 }
      : { x: z.x + 30 + Math.random() * (z.w - 60), y: z.y + 35 + Math.random() * (z.h - 55) };
    if (contains(z, p)) return p;
  }
  return z.shape === 'ellipse' ? { x: z.cx, y: z.cy } : { x: z.x + z.w / 2, y: z.y + z.h / 2 };
}
