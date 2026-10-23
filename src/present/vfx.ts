import type { World } from "../game/world";
import { boidColor } from "../render/sprites";
import { ISLAND_TOP } from "../world/island";

// Visual effects: hit sparks, shock rings, sword strikes fading out, and dust. None of it affects
// play: it's built from the world's events and the player's state, after each step, and only the
// renderer reads it.

export interface Spark {
  x: number;
  y: number;
  alt: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  color: string;
}

/** An expanding shock ring: a bomber's explosion, the queen's blast, the smash. */
export interface BlastRing {
  x: number;
  y: number;
  alt: number;
  age: number;
  radius: number;
  /** "r,g,b" */
  rgb: string;
  /** Thicker, with a second ring and a bigger flash. */
  heavy?: boolean;
}

/** A sword strike's look, playing out after its hit volume is gone. */
export interface StrikeLook {
  attack: string;
  x: number;
  y: number;
  alt: number;
  dx: number;
  dy: number;
  age: number;
  reach: number;
  halfWidth: number;
  power: number;
}

export interface Dust {
  x: number;
  y: number;
  alt: number;
  vx: number;
  vy: number;
  life: number;
}

/** How long a shock ring shows (s). */
export const BLAST_TIME = 0.45;

const BLAST_LOOKS: Record<string, string> = { landingShockwave: "200,240,255", bounceBlast: "160,235,255" };

export class Vfx {
  sparks: Spark[] = [];
  blasts: BlastRing[] = [];
  strikes: StrikeLook[] = [];
  dust: Dust[] = [];
  private dustAcc = 0;

  /** Start over for a new world and follow its events. */
  attach(w: World) {
    this.sparks = [];
    this.blasts = [];
    this.strikes = [];
    this.dust = [];
    const on = w.events.after.bind(w.events);
    const owner = { owner: w.lifetime };
    on("hit", (e) => {
      this.burst(e.x, e.y, e.alt, e.killed ? 18 : 6, boidColor(e.kind));
      if (e.kind === "queen" && e.killed) this.burst(e.x, e.y, e.alt, 60, "#ffe27a");
    }, owner);
    on("block", (e) => this.burst(e.x, e.y, e.alt, 8, e.what === "shield" ? "#9fe8ff" : "#f4ffd0"), owner);
    on("interrupt", (e) => this.burst(e.x, e.y, e.alt, 10, "#ffffff"), owner);
    on("thud", (e) => this.burst(e.x, e.y, e.alt, 4, e.fromPlayer ? "#f4e3c0" : "#c9ff7a"), owner);
    on("smash", (e) => {
      this.blasts.push({ x: e.x, y: e.y, alt: e.alt, age: 0, radius: e.radius, rgb: "255,226,150" });
      this.burst(e.x, e.y, e.alt, 14, "#ffe9a8");
    }, owner);
    on("blast", (e) => {
      this.blasts.push({ x: e.x, y: e.y, alt: e.alt, age: 0, radius: e.radius, rgb: BLAST_LOOKS[e.kind] ?? "255,226,150" });
      this.burst(e.x, e.y, e.alt, 14, "#bff4ff");
    }, owner);
    on("explode", (e) => {
      this.blasts.push({ x: e.x, y: e.y, alt: e.alt, age: 0, radius: e.radius, rgb: "255,200,120" });
      this.burst(e.x, e.y, e.alt, 36, "#ffa040");
      this.burst(e.x, e.y, e.alt, 18, "#fff1a8");
    }, owner);
    on("queenBlast", (e) => {
      this.blasts.push({ x: e.x, y: e.y, alt: e.alt, age: 0, radius: e.radius, rgb: "255,140,240", heavy: true });
      this.burst(e.x, e.y, e.alt, 60, boidColor("queen"));
      this.burst(e.x, e.y, e.alt, 30, "#ffe27a");
      this.burst(e.x, e.y, e.alt, 20, "#ffffff");
    }, owner);
    on("shot", (e) => this.burst(e.x + e.dx * e.r, e.y + e.dy * e.r, e.alt, 8, "#e8ff9a"), owner);
    on("doubleJump", (e) => this.burst(e.x, e.y, e.alt - 6, 10, "#bff4ff"), owner);
    on("netBounce", (e) => this.burst(e.x, e.y, e.alt, 14, "#9fe8ff"), owner);
    on("hurt", (e) => this.burst(e.x, e.y, e.alt, 10, "#ffd0b0"), owner);
    on("jump", (e) => this.emitDust(e.x, e.y, 6, 1 / 60), owner);
    on("land", (e) => this.emitDust(e.x, e.y, 4 + Math.min(10, e.speed / 80), 1 / 60), owner);
    on("attack", (e) => {
      if (e.weapon !== "sword" || e.reach === undefined) return;
      this.strikes.push({
        attack: e.attack,
        x: e.x,
        y: e.y,
        alt: e.alt,
        dx: Math.cos(e.angle),
        dy: Math.sin(e.angle),
        age: 0,
        reach: e.reach,
        halfWidth: e.halfWidth ?? 0,
        power: e.power,
      });
    }, owner);
  }

  /** Age everything by world time `dt`; kick up dust while the player slides along a rim. */
  update(w: World, dt: number) {
    const p = w.player;
    if (p.mode === "hang" && p.freeze <= 0 && p.slide) {
      const e = w.islands[p.island]!.pointAt(p.s);
      this.emitDust(e.x, e.y, Math.min(1, Math.abs(p.slide) / 300), dt);
    }
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i]!;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.alt -= 25 * dt;
      d.life -= dt * 1.6;
      if (d.life <= 0) this.dust.splice(i, 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.alt += s.vz * dt;
      s.vx *= Math.exp(-3 * dt);
      s.vy *= Math.exp(-3 * dt);
      s.vz -= 200 * dt;
      s.life -= dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
    for (const b of this.blasts) b.age += dt;
    this.blasts = this.blasts.filter((b) => b.age < BLAST_TIME);
    const sw = w.params.player.sword;
    for (const s of this.strikes) s.age += dt;
    this.strikes = this.strikes.filter((s) => s.age < sw.activeTime + sw.fadeTime);
  }

  burst(x: number, y: number, alt: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 160;
      this.sparks.push({
        x,
        y,
        alt,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: (Math.random() - 0.3) * 120,
        life: 0.5 + Math.random() * 0.5,
        color,
      });
    }
  }

  private emitDust(x: number, y: number, amount: number, dt: number) {
    this.dustAcc += amount * 60 * dt;
    while (this.dustAcc >= 1) {
      this.dustAcc -= 1;
      const a = Math.random() * Math.PI * 2;
      const sp = 10 + Math.random() * 30;
      this.dust.push({ x, y, alt: ISLAND_TOP - Math.random() * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 });
    }
  }
}
