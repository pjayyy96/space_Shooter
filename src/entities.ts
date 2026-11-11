// Game objects: bullets, particles, enemies, the stage boss, the player ship, and stars.

export const WIDTH = 480;
export const HEIGHT = 720;

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export interface Entity extends Circle {
  alive: boolean;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export function overlaps(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ------------------------------------------------------------- Skills
export type SkillId = "multishot" | "pierce" | "rapid" | "heavy" | "crit" | "rear" | "hull";

export interface SkillInfo {
  id: SkillId;
  /** Short label for the HUD. */
  tag: string;
  name: string;
  desc: string;
  /** How many times this skill can be taken. */
  max: number;
}

export const SKILLS: SkillInfo[] = [
  { id: "multishot", tag: "MULTI", name: "MULTISHOT", desc: "+1 bullet per volley", max: 4 },
  { id: "pierce", tag: "PIERCE", name: "PIERCE", desc: "Shots pass through +1 enemy", max: 3 },
  { id: "rapid", tag: "RAPID", name: "RAPID FIRE", desc: "Shoot 15% faster", max: 4 },
  { id: "heavy", tag: "HEAVY", name: "HEAVY ROUNDS", desc: "+1 damage per shot", max: 4 },
  { id: "crit", tag: "CRIT", name: "CRITICAL", desc: "15% chance for 2x damage", max: 3 },
  { id: "rear", tag: "REAR", name: "REAR CANNON", desc: "Also fires backward", max: 1 },
  { id: "hull", tag: "HULL", name: "HULL PLATING", desc: "+1 max life and heal 1", max: 3 },
];

export const GUN_COLOR = "#7fffd4";
export const CRIT_COLOR = "#ffe066";
export const BOSS_COLOR = "#ff3d7f";
const SHOT_COOLDOWN = 0.18;

// -------------------------------------------------------------- Bullet
interface BulletOptions {
  color?: string;
  radius?: number;
  damage?: number;
  /** Extra enemies this bullet can pass through before it ends. */
  pierce?: number;
}

export class Bullet implements Entity {
  alive = true;
  readonly radius: number;
  readonly color: string;
  readonly damage: number;
  private pierceLeft: number;
  private readonly hitTargets = new Set<object>();

  constructor(
    public x: number,
    public y: number,
    private readonly vx: number,
    private readonly vy: number,
    readonly friendly: boolean,
    opts: BulletOptions = {},
  ) {
    this.radius = opts.radius ?? 4;
    this.color = opts.color ?? (friendly ? GUN_COLOR : "#ff5577");
    this.damage = opts.damage ?? 1;
    this.pierceLeft = opts.pierce ?? 0;
  }

  hasHit(target: object): boolean {
    return this.hitTargets.has(target);
  }

  registerHit(target: object): void {
    this.hitTargets.add(target);
  }

  /** Spends one pierce charge after a hit. Returns false (and ends the bullet) when none are left. */
  consume(): boolean {
    if (this.pierceLeft > 0) {
      this.pierceLeft--;
      return true;
    }
    this.alive = false;
    return false;
  }

  update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < -20 || this.x > WIDTH + 20 || this.y < -20 || this.y > HEIGHT + 20) {
      this.alive = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ------------------------------------------------------------ Particle
export class Particle implements Entity {
  alive = true;
  private age = 0;

  constructor(
    public x: number,
    public y: number,
    private readonly vx: number,
    private readonly vy: number,
    private readonly color: string,
    private readonly lifetime: number,
    public radius: number,
  ) {}

  update(dt: number): void {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.age >= this.lifetime) this.alive = false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = 1 - this.age / this.lifetime;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ Enemy
export type EnemyKind = "grunt" | "weaver" | "tank";

interface EnemyStats {
  hp: number;
  radius: number;
  speed: number;
  points: number;
  color: string;
}

const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  grunt: { hp: 1, radius: 14, speed: 120, points: 10, color: "#ff7a59" },
  weaver: { hp: 1, radius: 14, speed: 95, points: 20, color: "#b38cff" },
  tank: { hp: 4, radius: 22, speed: 55, points: 50, color: "#ffd166" },
};

export class Enemy implements Entity {
  alive = true;
  readonly radius: number;
  readonly points: number;
  readonly color: string;
  private hp: number;
  private readonly maxHp: number;
  private readonly speed: number;
  private readonly baseX: number;
  private age = 0;
  private fireCooldown = 1.2 + Math.random();

  constructor(public x: number, public y: number, readonly kind: EnemyKind, stage = 1) {
    const s = ENEMY_STATS[kind];
    this.radius = s.radius;
    this.points = s.points;
    this.color = s.color;
    // Later stages make enemies tougher and a bit faster
    this.hp = s.hp + Math.floor((stage - 1) / 2);
    this.maxHp = this.hp;
    this.speed = s.speed * (1 + 0.07 * (stage - 1));
    this.baseX = x;
  }

  update(dt: number): void {
    this.age += dt;
    this.y += this.speed * dt;
    if (this.kind === "weaver") {
      // Side-to-side wave motion
      this.x = clamp(this.baseX + Math.sin(this.age * 3) * 80, this.radius, WIDTH - this.radius);
    }
    this.fireCooldown -= dt;
    if (this.y > HEIGHT + this.radius) this.alive = false;
  }

  /** Only tanks shoot. Returns an aimed bullet, or null if not ready. */
  tryFire(targetX: number, targetY: number): Bullet | null {
    if (this.kind !== "tank" || this.fireCooldown > 0 || this.y < 0) return null;
    this.fireCooldown = 1.3;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 240;
    return new Bullet(this.x, this.y + this.radius, (dx / len) * speed, (dy / len) * speed, false);
  }

  /** Returns true when this hit destroys the enemy. */
  takeHit(damage: number): boolean {
    this.hp -= damage;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const r = this.radius;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;

    if (this.kind === "grunt") {
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, -r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
    } else if (this.kind === "weaver") {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#070b1a";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#070b1a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      // Health bar
      const w = r * 2;
      ctx.fillStyle = "#333";
      ctx.fillRect(-r, -r - 8, w, 4);
      ctx.fillStyle = "#6ef08a";
      ctx.fillRect(-r, -r - 8, w * (this.hp / this.maxHp), 4);
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------ Boss
/** Stage boss: sits at the top, sweeps side to side, and fires volleys that get denser each stage. */
export class Boss implements Entity {
  alive = true;
  readonly radius = 42;
  hp: number;
  readonly maxHp: number;
  x = WIDTH / 2;
  y = 130;
  private age = 0;
  private fireTimer = 1.5;
  private volley = 0;

  constructor(private readonly stage: number) {
    this.maxHp = 45 + 25 * stage;
    this.hp = this.maxHp;
  }

  update(dt: number): void {
    this.age += dt;
    this.x = WIDTH / 2 + Math.sin(this.age * 0.7) * (WIDTH / 2 - 80);
    this.fireTimer -= dt;
  }

  /** Returns the volley to fire this frame, or nothing if it is not ready. */
  tryFire(targetX: number, targetY: number): Bullet[] {
    if (this.fireTimer > 0) return [];
    this.fireTimer = Math.max(0.45, 1.3 - 0.12 * this.stage);
    const speed = 220 + 15 * this.stage;
    const startY = this.y + this.radius;
    const ring = this.stage >= 2 && this.volley % 2 === 1;
    this.volley++;
    const out: Bullet[] = [];
    if (ring) {
      // Ring of bullets that turns a little each volley
      const n = 8 + this.stage;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.age;
        out.push(new Bullet(this.x, startY, Math.sin(a) * speed, Math.cos(a) * speed, false, { radius: 6 }));
      }
    } else {
      // Aimed three-way burst
      const aim = Math.atan2(targetX - this.x, targetY - this.y);
      for (const off of [-0.2, 0, 0.2]) {
        const a = aim + off;
        out.push(new Bullet(this.x, startY, Math.sin(a) * speed, Math.cos(a) * speed, false, { radius: 6 }));
      }
    }
    return out;
  }

  /** Returns true when this hit destroys the boss. */
  takeHit(damage: number): boolean {
    this.hp -= damage;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const r = this.radius;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.age * 0.5);
    ctx.fillStyle = BOSS_COLOR;
    ctx.shadowColor = BOSS_COLOR;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const rr = i % 2 === 0 ? r : r * 0.78;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#070b1a";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CRIT_COLOR;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- Player
export class Player implements Entity {
  alive = true;
  radius = 14;
  x = WIDTH / 2;
  y = HEIGHT - 70;
  lives = 3;
  maxLives = 3;
  invulnerableTimer = 0;
  skills: Record<SkillId, number> = {
    multishot: 0,
    pierce: 0,
    rapid: 0,
    heavy: 0,
    crit: 0,
    rear: 0,
    hull: 0,
  };
  /** Visual bank angle (radians) while moving sideways. */
  private tilt = 0;
  private cooldown = 0;
  private readonly speed = 340;

  get isInvulnerable(): boolean {
    return this.invulnerableTimer > 0;
  }

  stacks(id: SkillId): number {
    return this.skills[id];
  }

  addSkill(id: SkillId): void {
    this.skills[id]++;
    if (id === "hull") {
      this.maxLives++;
      this.lives++;
    }
  }

  move(dx: number, dy: number, dt: number): void {
    this.x = clamp(this.x + dx * this.speed * dt, this.radius, WIDTH - this.radius);
    this.y = clamp(this.y + dy * this.speed * dt, HEIGHT * 0.5, HEIGHT - this.radius);
    // Bank toward the direction of movement, smoothly
    const targetTilt = dx * 0.35;
    this.tilt += (targetTilt - this.tilt) * Math.min(1, dt * 10);
  }

  update(dt: number): void {
    this.cooldown -= dt;
    this.invulnerableTimer -= dt;
  }

  /** Fires the volley the current skills describe, or nothing while cooling down. */
  tryShoot(): Bullet[] {
    if (this.cooldown > 0) return [];
    this.cooldown = Math.max(0.05, SHOT_COOLDOWN * (1 - 0.15 * this.skills.rapid));

    const count = 1 + this.skills.multishot;
    const out: Bullet[] = [];
    for (let i = 0; i < count; i++) {
      // Fan the shots out 9 degrees apart, centered on the nose
      const angle = (i - (count - 1) / 2) * 9;
      out.push(this.shot(0, angle, 600, this.bulletOpts()));
    }
    if (this.skills.rear > 0) out.push(this.shot(0, 180, 500, this.bulletOpts(), true));
    return out;
  }

  private bulletOpts(): BulletOptions {
    const crit = Math.random() < 0.15 * this.skills.crit;
    return {
      damage: (1 + this.skills.heavy) * (crit ? 2 : 1),
      color: crit ? CRIT_COLOR : GUN_COLOR,
      radius: crit ? 5 : 4,
      pierce: this.skills.pierce,
    };
  }

  /** Creates one bullet angled `angleDeg` from straight up (or from behind the ship). */
  private shot(
    offsetX: number,
    angleDeg: number,
    speed: number,
    opts: BulletOptions,
    fromBehind = false,
  ): Bullet {
    const rad = (angleDeg * Math.PI) / 180;
    return new Bullet(
      this.x + offsetX,
      fromBehind ? this.y + 18 : this.y - 18,
      Math.sin(rad) * speed,
      -Math.cos(rad) * speed,
      true,
      opts,
    );
  }

  hit(): void {
    this.lives--;
    this.invulnerableTimer = 1.5;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Blink while invulnerable
    if (this.isInvulnerable && Math.floor(this.invulnerableTimer * 10) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tilt);

    // Engine flame
    ctx.fillStyle = "#ffb703";
    ctx.beginPath();
    ctx.moveTo(-5, 10);
    ctx.lineTo(0, 17 + Math.random() * 5);
    ctx.lineTo(5, 10);
    ctx.closePath();
    ctx.fill();

    // Main hull
    ctx.shadowColor = GUN_COLOR;
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#cfe9ff";
    ctx.strokeStyle = "#4cc9f0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(6, -6);
    ctx.lineTo(18, 10);
    ctx.lineTo(8, 14);
    ctx.lineTo(0, 8);
    ctx.lineTo(-8, 14);
    ctx.lineTo(-18, 10);
    ctx.lineTo(-6, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0b1d3a";
    ctx.beginPath();
    ctx.ellipse(0, -4, 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wing stripes and gun pods
    ctx.fillStyle = GUN_COLOR;
    ctx.fillRect(-16, 7, 5, 2.5);
    ctx.fillRect(11, 7, 5, 2.5);
    ctx.shadowColor = GUN_COLOR;
    ctx.shadowBlur = 8;
    ctx.fillRect(-14, -4, 3, 12);
    ctx.fillRect(11, -4, 3, 12);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ Stars
export class Star {
  readonly x = Math.random() * WIDTH;
  y = Math.random() * HEIGHT;
  readonly speed = 20 + Math.random() * 80;
  readonly size = 0.5 + Math.random() * 1.5;

  update(dt: number): void {
    this.y += this.speed * dt;
    if (this.y > HEIGHT) this.y = 0;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + this.speed / 200})`;
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}
