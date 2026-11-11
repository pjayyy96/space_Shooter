import {
  BOSS_COLOR,
  Boss,
  Bullet,
  Enemy,
  EnemyKind,
  HEIGHT,
  Particle,
  Player,
  SKILLS,
  SkillInfo,
  Star,
  WIDTH,
  overlaps,
} from "./entities";
import { Input } from "./input";
import { sfx } from "./sfx";

type Mode = "menu" | "playing" | "levelup" | "paused" | "gameover";

const BEST_KEY = "space-shooter-best";
const NEON_TEXT = "#00f0ff"; // neon blue for body text
const GOLD = "#ffe066";
/** Keys that pick the 1st, 2nd and 3rd skill card. */
const CHOICE_KEYS: string[][] = [
  ["Digit1", "Numpad1"],
  ["Digit2", "Numpad2"],
  ["Digit3", "Numpad3"],
];

/** XP needed to go from `level` to `level + 1`. */
function xpToNext(level: number): number {
  return 40 + 25 * level;
}

/** Regular enemies to face in a stage before its boss appears. */
function stageGoal(stage: number): number {
  return 12 + 5 * stage;
}

/** Picks up to three skills the player can still take, in random order. */
function pickChoices(player: Player): SkillInfo[] {
  const pool = SKILLS.filter((s) => player.stacks(s.id) < s.max);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

/** Splits text into lines of at most `maxChars` characters, breaking on spaces. */
function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage blocked; best score just won't persist.
  }
}

export class Game {
  private mode: Mode = "menu";
  private player = new Player();
  private bullets: Bullet[] = [];
  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private particles: Particle[] = [];
  private readonly stars = Array.from({ length: 80 }, () => new Star());
  private score = 0;
  private best = loadBest();
  private spawnTimer = 1;
  private flashTimer = 0;
  // Stage progress
  private stage = 1;
  private stageSpawned = 0;
  private stageKills = 0;
  // Player XP and skill picks
  private xp = 0;
  private playerLevel = 1;
  private pendingLevelUps = 0;
  private choices: SkillInfo[] = [];
  // Center-screen announcement
  private banner = "";
  private bannerTimer = 0;

  constructor(private readonly input: Input) {}

  // ------------------------------------------------------------ update

  update(dt: number): void {
    for (const star of this.stars) star.update(dt);

    if (this.input.wasPressed("KeyP")) {
      if (this.mode === "playing") this.mode = "paused";
      else if (this.mode === "paused") this.mode = "playing";
    }

    switch (this.mode) {
      case "menu":
        if (this.input.wasPressed("Enter", "NumpadEnter", "Space")) this.start();
        break;
      case "gameover":
        if (this.input.wasPressed("Enter", "NumpadEnter", "KeyR")) this.start();
        break;
      case "levelup":
        this.handleLevelUpInput();
        break;
      case "paused":
        break;
      case "playing":
        this.step(dt);
        break;
    }
  }

  private start(): void {
    this.player = new Player();
    this.bullets = [];
    this.enemies = [];
    this.particles = [];
    this.boss = null;
    this.score = 0;
    this.spawnTimer = 1;
    this.flashTimer = 0;
    this.stage = 1;
    this.stageSpawned = 0;
    this.stageKills = 0;
    this.xp = 0;
    this.playerLevel = 1;
    this.pendingLevelUps = 0;
    this.choices = [];
    this.mode = "playing";
    this.showBanner("STAGE 1");
  }

  private showBanner(text: string, seconds = 2.5): void {
    this.banner = text;
    this.bannerTimer = seconds;
  }

  private handleLevelUpInput(): void {
    for (let i = 0; i < this.choices.length; i++) {
      if (this.input.wasPressed(...CHOICE_KEYS[i])) {
        this.pickSkill(this.choices[i]);
        return;
      }
    }
  }

  private pickSkill(skill: SkillInfo): void {
    this.player.addSkill(skill.id);
    sfx.pickup();
    this.pendingLevelUps--;
    this.refreshLevelUp();
  }

  /** Opens the skill picker if a level-up is waiting, otherwise returns to play. */
  private refreshLevelUp(): void {
    if (this.pendingLevelUps > 0) this.choices = pickChoices(this.player);
    if (this.pendingLevelUps <= 0 || this.choices.length === 0) {
      this.pendingLevelUps = 0;
      this.choices = [];
      this.mode = "playing";
      return;
    }
    this.mode = "levelup";
  }

  private grantXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= xpToNext(this.playerLevel)) {
      this.xp -= xpToNext(this.playerLevel);
      this.playerLevel++;
      this.pendingLevelUps++;
    }
  }

  private step(dt: number): void {
    const p = this.player;

    // Movement (normalized so diagonals aren't faster)
    let dx = 0;
    let dy = 0;
    if (this.input.isDown("ArrowLeft", "KeyA")) dx -= 1;
    if (this.input.isDown("ArrowRight", "KeyD")) dx += 1;
    if (this.input.isDown("ArrowUp", "KeyW")) dy -= 1;
    if (this.input.isDown("ArrowDown", "KeyS")) dy += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }
    p.move(dx, dy, dt);
    p.update(dt);

    if (this.input.isDown("Space")) {
      const shots = p.tryShoot();
      if (shots.length > 0) {
        this.bullets.push(...shots);
        sfx.shoot();
      }
    }

    this.emitExhaust();

    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    this.spawnEnemies(dt);

    for (const b of this.bullets) b.update(dt);
    for (const e of this.enemies) {
      e.update(dt);
      const shot = e.tryFire(p.x, p.y);
      if (shot) this.bullets.push(shot);
    }
    if (this.boss) {
      this.boss.update(dt);
      this.bullets.push(...this.boss.tryFire(p.x, p.y));
    }
    for (const pt of this.particles) pt.update(dt);

    this.handleCollisions();

    this.bullets = this.bullets.filter((b) => b.alive);
    this.enemies = this.enemies.filter((e) => e.alive);
    this.particles = this.particles.filter((pt) => pt.alive);

    this.checkStageClear();

    if (p.lives <= 0) this.gameOver();
    else if (this.pendingLevelUps > 0 && this.mode === "playing") this.refreshLevelUp();
  }

  /** Thruster sparks behind the ship. */
  private emitExhaust(): void {
    if (Math.random() > 0.8) return;
    const p = this.player;
    this.particles.push(
      new Particle(
        p.x + (Math.random() - 0.5) * 8,
        p.y + 14,
        (Math.random() - 0.5) * 30,
        140 + Math.random() * 80,
        Math.random() < 0.5 ? "#ffb703" : "#4cc9f0",
        0.25 + Math.random() * 0.15,
        1.5 + Math.random() * 1.5,
      ),
    );
  }

  private spawnEnemies(dt: number): void {
    if (this.boss || this.stageSpawned >= stageGoal(this.stage)) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    // Spawn faster in later stages, with some randomness
    const interval = Math.max(0.25, 1.1 - this.stage * 0.1);
    this.spawnTimer = interval * (0.7 + Math.random() * 0.6);
    this.stageSpawned++;

    const x = 40 + Math.random() * (WIDTH - 80);
    this.enemies.push(new Enemy(x, -30, this.pickKind(), this.stage));
  }

  private pickKind(): EnemyKind {
    const r = Math.random();
    if (this.stage >= 2 && r < 0.2) return "tank";
    if (this.stage >= 1 && r < 0.5) return "weaver";
    return "grunt";
  }

  /** Spawns the stage boss once the stage's enemies are all spawned and cleared. */
  private checkStageClear(): void {
    if (this.boss || this.stageSpawned < stageGoal(this.stage)) return;
    if (this.enemies.length > 0) return;
    this.boss = new Boss(this.stage);
    this.showBanner("BOSS INCOMING", 2.5);
  }

  private handleCollisions(): void {
    const p = this.player;

    // Player bullets hit enemies and the boss (pierce lets a bullet pass through several)
    for (const b of this.bullets) {
      if (!b.alive || !b.friendly) continue;
      for (const e of this.enemies) {
        if (!e.alive || b.hasHit(e) || !overlaps(b, e)) continue;
        b.registerHit(e);
        if (e.takeHit(b.damage)) this.destroyEnemy(e);
        if (!b.consume()) break;
      }
      const boss = this.boss;
      if (b.alive && boss && !b.hasHit(boss) && overlaps(b, boss)) {
        b.registerHit(boss);
        if (boss.takeHit(b.damage)) this.destroyBoss();
        b.consume();
      }
    }

    // Enemies crashing into the player
    for (const e of this.enemies) {
      if (e.alive && overlaps(e, p)) {
        this.destroyEnemy(e);
        this.damagePlayer();
      }
    }

    // Enemy bullets hit the player
    for (const b of this.bullets) {
      if (b.alive && !b.friendly && overlaps(b, p)) {
        b.alive = false;
        this.damagePlayer();
      }
    }
  }

  private destroyEnemy(e: Enemy): void {
    e.alive = false;
    this.score += e.points;
    this.stageKills++;
    this.grantXp(e.points * 2);
    this.explode(e.x, e.y, e.color, 14);
    sfx.explode();
  }

  private destroyBoss(): void {
    const boss = this.boss;
    if (!boss) return;
    this.boss = null;
    this.score += 100 * this.stage;
    this.grantXp(80 * this.stage);
    this.explode(boss.x, boss.y, BOSS_COLOR, 60);
    sfx.explode();
    sfx.pickup();
    this.stage++;
    this.stageSpawned = 0;
    this.stageKills = 0;
    this.spawnTimer = 1;
    this.showBanner(`STAGE ${this.stage}`);
  }

  private damagePlayer(): void {
    const p = this.player;
    if (p.isInvulnerable) return;
    p.hit();
    this.flashTimer = 0.25;
    this.explode(p.x, p.y, "#4cc9f0", 20);
    sfx.hurt();
  }

  private explode(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 220;
      this.particles.push(
        new Particle(
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          color,
          0.4 + Math.random() * 0.4,
          1.5 + Math.random() * 2.5,
        ),
      );
    }
  }

  private gameOver(): void {
    this.mode = "gameover";
    if (this.score > this.best) {
      this.best = this.score;
      saveBest(this.best);
    }
  }

  // ------------------------------------------------------------ render

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#070b1a";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (const star of this.stars) star.draw(ctx);

    if (this.mode !== "menu") {
      for (const e of this.enemies) e.draw(ctx);
      this.boss?.draw(ctx);
      for (const b of this.bullets) b.draw(ctx);
      for (const pt of this.particles) pt.draw(ctx);
      this.player.draw(ctx);
      this.drawHud(ctx);
    }

    if (this.flashTimer > 0) {
      ctx.fillStyle = `rgba(255, 0, 0, ${this.flashTimer * 0.8})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    switch (this.mode) {
      case "menu":
        this.drawMenu(ctx);
        break;
      case "paused":
        this.drawOverlay(ctx, [
          ["PAUSED", 40, "#ffffff"],
          ["Press P to continue", 18, "#aab4d4"],
        ]);
        break;
      case "levelup":
        this.drawLevelUp(ctx);
        break;
      case "gameover":
        this.drawOverlay(ctx, [
          ["GAME OVER", 40, "#ff5577"],
          [`Score: ${this.score}`, 22, "#ffffff"],
          ["Press Enter to play again", 18, "#aab4d4"],
        ]);
        break;
    }

    if (this.mode === "playing") this.drawBanner(ctx);
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    const p = this.player;
    ctx.font = "16px monospace";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = NEON_TEXT;
    ctx.shadowBlur = 10;
    ctx.fillStyle = NEON_TEXT;

    ctx.textAlign = "left";
    ctx.fillText(`SCORE ${this.score}`, 12, 24);
    ctx.fillText(`BEST  ${this.best}`, 12, 46);

    ctx.textAlign = "right";
    ctx.fillText(`STAGE ${this.stage}`, WIDTH - 12, 24);
    ctx.fillText(`LV ${this.playerLevel}`, WIDTH - 12, 46);
    if (!this.boss) {
      ctx.fillText(`TARGETS ${this.stageKills}/${stageGoal(this.stage)}`, WIDTH - 12, 68);
    }

    // Lives as small ship icons (no glow)
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#4cc9f0";
    for (let i = 0; i < p.lives; i++) {
      const x = 20 + i * 22;
      const y = 62;
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 7, y + 6);
      ctx.lineTo(x - 7, y + 6);
      ctx.closePath();
      ctx.fill();
    }

    // Active skills, bottom-left
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.shadowColor = NEON_TEXT;
    ctx.shadowBlur = 6;
    ctx.fillStyle = NEON_TEXT;
    const tags = SKILLS.filter((s) => p.stacks(s.id) > 0)
      .map((s) => `${s.tag} x${p.stacks(s.id)}`)
      .join("  ");
    ctx.fillText(tags ? `SKILLS ${tags}` : "SKILLS -", 12, HEIGHT - 22);

    // XP bar along the bottom edge
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#1d2a4d";
    ctx.fillRect(0, HEIGHT - 8, WIDTH, 8);
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, HEIGHT - 8, WIDTH * (this.xp / xpToNext(this.playerLevel)), 8);

    // Boss health bar across the top edge
    if (this.boss) {
      ctx.fillStyle = "#1d2a4d";
      ctx.fillRect(0, 0, WIDTH, 8);
      ctx.shadowColor = BOSS_COLOR;
      ctx.shadowBlur = 8;
      ctx.fillStyle = BOSS_COLOR;
      ctx.fillRect(0, 0, WIDTH * (this.boss.hp / this.boss.maxHp), 8);
    }
    ctx.shadowBlur = 0;
  }

  private drawBanner(ctx: CanvasRenderingContext2D): void {
    if (this.bannerTimer <= 0) return;
    const color = this.banner.startsWith("BOSS") ? BOSS_COLOR : NEON_TEXT;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.bannerTimer);
    ctx.font = "bold 34px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = color;
    ctx.fillText(this.banner, WIDTH / 2, HEIGHT * 0.4);
    ctx.restore();
  }

  private drawLevelUp(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 30px monospace";
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 14;
    ctx.fillStyle = GOLD;
    ctx.fillText(`LEVEL UP!  LV ${this.playerLevel}`, WIDTH / 2, HEIGHT * 0.22);
    ctx.shadowBlur = 0;
    ctx.font = "16px monospace";
    ctx.fillStyle = "#aab4d4";
    ctx.fillText("Press 1, 2 or 3 to choose a skill", WIDTH / 2, HEIGHT * 0.22 + 36);

    const cardW = 136;
    const cardH = 230;
    const gap = 12;
    const top = HEIGHT * 0.33;
    const left = (WIDTH - (cardW * 3 + gap * 2)) / 2;
    this.choices.forEach((skill, i) => {
      const x = left + i * (cardW + gap);
      const cx = x + cardW / 2;
      ctx.fillStyle = "#0b1d3a";
      ctx.strokeStyle = NEON_TEXT;
      ctx.lineWidth = 2;
      ctx.shadowColor = NEON_TEXT;
      ctx.shadowBlur = 12;
      ctx.fillRect(x, top, cardW, cardH);
      ctx.strokeRect(x, top, cardW, cardH);
      ctx.shadowBlur = 0;

      ctx.fillStyle = "#ffd166";
      ctx.font = "bold 22px monospace";
      ctx.fillText(String(i + 1), cx, top + 28);
      ctx.fillStyle = NEON_TEXT;
      ctx.font = "bold 14px monospace";
      ctx.fillText(skill.name, cx, top + 64);
      ctx.fillStyle = "#e0e6ff";
      ctx.font = "13px monospace";
      wrap(skill.desc, 14).forEach((line, j) => ctx.fillText(line, cx, top + 100 + j * 18));
      ctx.fillStyle = "#aab4d4";
      ctx.fillText(`Level ${this.player.stacks(skill.id) + 1}/${skill.max}`, cx, top + cardH - 24);
    });
  }

  private drawMenu(ctx: CanvasRenderingContext2D): void {
    this.drawLogo(ctx);
    this.drawOverlay(ctx, [
      ["Arrows / WASD : move", 16, NEON_TEXT],
      ["Space         : shoot", 16, NEON_TEXT],
      ["P             : pause", 16, NEON_TEXT],
      ["Kill enemies to gain XP", 16, "#ffd166"],
      ["Level up to pick gun skills", 16, "#ffd166"],
      ["Beat each stage's boss to advance", 16, "#ffd166"],
      ["Press Enter or Space to start", 18, "#ffd166"],
    ]);
  }

  /** Neon "SPACE SHOOTER" title logo for the start screen. */
  private drawLogo(ctx: CanvasRenderingContext2D): void {
    const cx = WIDTH / 2;
    const gradient = ctx.createLinearGradient(0, 70, 0, 190);
    gradient.addColorStop(0, "#9ffcff");
    gradient.addColorStop(0.5, NEON_TEXT);
    gradient.addColorStop(1, "#9d4edd");

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#0b1d3a";
    ctx.shadowColor = NEON_TEXT;
    ctx.shadowBlur = 24;
    ctx.fillStyle = gradient;
    for (const [word, y, size] of [
      ["NEON", 105, 52],
      ["SPACE SHOOTER", 165, 40],
    ] as const) {
      ctx.font = `bold ${size}px monospace`;
      ctx.strokeText(word, cx, y);
      ctx.fillText(word, cx, y);
    }

    // Accent bar under the title
    ctx.shadowBlur = 12;
    ctx.shadowColor = GOLD;
    ctx.fillStyle = GOLD;
    ctx.fillRect(cx - 120, 196, 240, 3);
    ctx.restore();
  }

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    lines: Array<[string, number, string]>,
  ): void {
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lineHeight = 44;
    const startY = HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach(([text, size, color], i) => {
      ctx.font = `bold ${size}px monospace`;
      ctx.fillStyle = color;
      ctx.shadowColor = NEON_TEXT;
      ctx.shadowBlur = color === NEON_TEXT ? 12 : 0;
      ctx.fillText(text, WIDTH / 2, startY + i * lineHeight);
    });
    ctx.shadowBlur = 0;
  }
}
