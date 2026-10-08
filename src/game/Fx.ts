import { Container, Graphics } from 'pixi.js';

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
  drag: number;
  grow: number;
}

interface Ring {
  g: Graphics;
  life: number;
  maxLife: number;
  radius: number;
  color: number;
  width: number;
}

/** Lightweight particle and shockwave layer drawn above the cards. */
export class Fx extends Container {
  private particles: Particle[] = [];
  private rings: Ring[] = [];

  /** Radial burst of round particles. */
  burst(x: number, y: number, colors: number[], count = 18, speed = 260, size = 5): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const s = speed * (0.45 + Math.random() * 0.75);
      const r = size * (0.6 + Math.random() * 0.8);
      const g = new Graphics().circle(0, 0, r).fill(colors[i % colors.length]);
      g.position.set(x, y);
      this.addChild(g);
      const maxLife = 0.45 + Math.random() * 0.35;
      this.particles.push({ g, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: maxLife, maxLife, gravity: 520, drag: 3.2, grow: -0.6 });
    }
  }

  /** Small dust puff at a card's feet (landing, refusal). */
  dust(x: number, y: number, count = 7): void {
    for (let i = 0; i < count; i++) {
      const dir = i % 2 === 0 ? -1 : 1;
      const g = new Graphics().circle(0, 0, 3 + Math.random() * 3).fill({ color: 0xb8b09c, alpha: 0.7 });
      g.position.set(x + dir * (10 + Math.random() * 30), y);
      this.addChild(g);
      const maxLife = 0.35 + Math.random() * 0.25;
      this.particles.push({ g, vx: dir * (40 + Math.random() * 70), vy: -20 - Math.random() * 40, life: maxLife, maxLife, gravity: 60, drag: 4, grow: 1.4 });
    }
  }

  /** Twinkling sparkles that drift upward (new discoveries). */
  sparkle(x: number, y: number, count = 10): void {
    for (let i = 0; i < count; i++) {
      const g = new Graphics().star(0, 0, 4, 6, 2).fill(0xfff4c2);
      g.position.set(x + (Math.random() - 0.5) * 110, y + (Math.random() - 0.5) * 110);
      g.rotation = Math.random();
      this.addChild(g);
      const maxLife = 0.7 + Math.random() * 0.6;
      this.particles.push({ g, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 40, life: maxLife, maxLife, gravity: 0, drag: 1, grow: 0.3 });
    }
  }

  /** Brief white flash at the merge point. */
  flash(x: number, y: number): void {
    const g = new Graphics().circle(0, 0, 46).fill(0xffffff);
    g.position.set(x, y);
    this.addChild(g);
    this.particles.push({ g, vx: 0, vy: 0, life: 0.18, maxLife: 0.18, gravity: 0, drag: 0, grow: 0.8 });
  }

  /** Grey puff between two cards that refuse to combine. */
  puff(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const g = new Graphics().circle(0, 0, 5 + Math.random() * 4).fill({ color: 0x9a9384, alpha: 0.55 });
      g.position.set(x, y);
      this.addChild(g);
      const maxLife = 0.35 + Math.random() * 0.2;
      this.particles.push({ g, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 20, life: maxLife, maxLife, gravity: 0, drag: 3, grow: 1.2 });
    }
  }

  /** Expanding ring shockwave. */
  ring(x: number, y: number, color: number, radius = 90, width = 6, duration = 0.45): void {
    const g = new Graphics();
    g.position.set(x, y);
    this.addChild(g);
    this.rings.push({ g, life: duration, maxLife: duration, radius, color, width });
  }

  update(dt: number): void {
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        p.g.destroy();
        return false;
      }
      p.vx *= Math.exp(-p.drag * dt);
      p.vy = p.vy * Math.exp(-p.drag * dt) + p.gravity * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      const t = p.life / p.maxLife; // 1 → 0
      p.g.alpha = Math.min(1, t * 2);
      p.g.scale.set(Math.max(0.05, 1 + p.grow * (1 - t)));
      p.g.rotation += dt * 2;
      return true;
    });
    this.rings = this.rings.filter((r) => {
      r.life -= dt;
      if (r.life <= 0) {
        r.g.destroy();
        return false;
      }
      const p = 1 - r.life / r.maxLife; // 0 → 1
      const eased = 1 - Math.pow(1 - p, 3);
      r.g.clear().circle(0, 0, 12 + r.radius * eased).stroke({ width: r.width * (1 - p) + 0.5, color: r.color, alpha: 1 - p });
      return true;
    });
  }
}
