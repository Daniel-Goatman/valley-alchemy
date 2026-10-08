/** Critically-tunable damped spring for one number. Good for "juicy" UI motion. */
export class Spring {
  value: number;
  velocity = 0;
  target: number;

  constructor(value: number, private stiffness = 320, private damping = 22) {
    this.value = value;
    this.target = value;
  }

  step(dt: number): number {
    // Semi-implicit Euler, sub-stepped so long frames stay stable.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += force * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }

  /** Kick the spring (e.g. a squash on landing). */
  impulse(v: number): void {
    this.velocity += v;
  }
}
