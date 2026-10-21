import { box, overlaps, type Hitbox, type Hurtbox } from "./hitbox";
import { ISLAND_TOP, mulberry32, type Island } from "./island";
import type { Planet, SpawnKind } from "./planet";
import { params } from "./tuning";

// Combat: the enemy swarm (boids in flocks), projectiles, sword slashes, blasts and hit particles.
// Everything lives on the same flat game plane as the player, with an altitude for depth.

export type BoidKind = SpawnKind | "queen";

/**
 * A group of boids that roams, fights and flocks together: the boids rules (separation, alignment,
 * cohesion) only apply between members. Flocks join other flocks and members split off into new
 * ones. The queen always has a flock, which stays with her and is topped back up to her starting
 * escort from nearby flocks whenever it loses members.
 */
export interface Flock {
  members: Boid[];
  /** Where the flock is roaming to while idle. */
  goalX: number;
  goalY: number;
  /** The flock it is flying over to join, if any. */
  joining: Flock | null;
  engaged: boolean;
  /** Seconds left of staying engaged after a member was hit. */
  provoked: number;
  /** Always engaged while the player can be targeted (reinforcements come looking for them). */
  hunting: boolean;
  /** Centre and mean velocity of the members, updated every frame. */
  cx: number;
  cy: number;
  vx: number;
  vy: number;
}

export interface Boid {
  id: number;
  kind: BoidKind;
  x: number;
  y: number;
  alt: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  /** Body radius, for flocking and drawing; the same as the hurtbox's. */
  r: number;
  cooldown: number;
  lunge: number; // seconds of lunge left (melee)
  windup: number; // seconds of anger left before the queen's blast goes off
  flash: number; // hit flash timer
  freeze: number; // hit-stop left (s, real time): frozen boids don't move, act or animate
  heading: number; // facing for drawing; held while frozen (knockback changes vx/vy at once)
  phase: number; // wander / wing-flap phase
  flock: Flock;
}

/** Level rules the swarm plays by (from the level's modifiers). */
export interface SwarmRules {
  /** Share of the starting swarm (escort excluded) to kill before the queen can be hurt; 0 = no shield. */
  shield: number;
  /** A new hunting flock arrives from the boundary this often (s), while the swarm is under `cap`; null = never. */
  reinforce: { every: number; size: number; kinds: SpawnKind[]; cap: number } | null;
  /** Boids' health and body size multipliers (the queen's excluded). */
  hp: number;
  size: number;
}

export const NO_RULES: SwarmRules = { shield: 0, reinforce: null, hp: 1, size: 1 };

export interface Shot {
  x: number;
  y: number;
  alt: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  fromPlayer: boolean;
  damage: number;
  scale: number; // visual / hit size multiplier
}

export interface Slash {
  x: number;
  y: number;
  alt: number;
  dx: number;
  dy: number;
  age: number;
  range: number;
  damage: number;
  power: number; // 0..1
  hits: Set<Boid>;
}

/** A bomber's explosion or the queen's blast, kept for its expanding shock ring. */
export interface Blast {
  x: number;
  y: number;
  alt: number;
  age: number;
  radius: number;
  /** The ring's colour, as "r,g,b". */
  rgb: string;
  /** A heavier look: thicker, with a second ring and a bigger flash. */
  heavy?: boolean;
}

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

/** What the swarm needs to know about the player. */
export interface PlayerView {
  x: number;
  y: number;
  alt: number;
  /** false while respawning / after defeat: boids ignore the player */
  targetable: boolean;
}

/** What the swarm can do to the player. */
export interface PlayerHooks {
  /** Hurt the player; false if the hit didn't land (invulnerable, or the round is over). */
  hit: (damage: number, fromX: number, fromY: number) => boolean;
  /**
   * Shove the player by this velocity (vz up); knocks them off a rim they hang on. A `hard` shove
   * first cancels any flight against it, so it can't be flown through, and shakes harder.
   */
  push: (vx: number, vy: number, vz: number, hard?: boolean) => void;
}

/** Hit-stop (s) for a hit dealing `damage`, from anyone: more damage freezes longer. */
export function hitStop(damage: number) {
  const h = params.player.hitStop;
  const t = (damage - h.minDamage) / Math.max(1e-6, h.maxDamage - h.minDamage);
  return lerp(h.min, h.max, Math.max(0, Math.min(1, t)));
}

/** Something that happened in combat, for sound. */
export interface CombatEvent {
  type: "hit" | "shot" | "lunge" | "explode" | "anger" | "queenBlast" | "block" | "thud";
  x: number;
  y: number;
  alt: number;
  /** For hits: who was hit, and whether it died. */
  kind?: BoidKind;
  killed?: boolean;
}

export interface PlayerHit {
  weapon: "sword" | "spear";
  damage: number;
}

/** Hurtbox radius of boids, by kind. A lunging melee boid's hurtbox is also its hitbox. */
export const BOID_RADIUS: Record<BoidKind, number> = { queen: 26, melee: 8, ranged: 9, bomber: 9 };

const boidHurtbox = (b: Boid): Hurtbox => box(b.x, b.y, b.alt, b.r);
const playerHurtbox = (p: PlayerView): Hurtbox => box(p.x, p.y, p.alt, params.player.hurtbox.radius);

/** A projectile is both: it hits its target, and the sword can hit (block) the enemies'. */
function shotBox(s: Shot): Hitbox & Hurtbox {
  const radius = s.fromPlayer ? params.player.spear.hitRadius * s.scale : params.enemyAttacks.ranged.orbRadius;
  return box(s.x, s.y, s.alt, radius);
}

const CRUISE_ALT = ISLAND_TOP + 35;

/** How long a blast's shock ring shows (s). */
export const BLAST_TIME = 0.45;

const SPEEDS: Record<BoidKind, () => number> = {
  melee: () => params.boids.swarm.meleeSpeed,
  ranged: () => params.boids.swarm.rangedSpeed,
  bomber: () => params.boids.swarm.bomberSpeed,
  queen: () => params.boids.queen.speed,
};

/** Starting health of the swarm's boids (the queen's is set per level). */
export const BOID_HP: Record<SpawnKind, number> = { melee: 2, ranged: 2, bomber: 1 };

export const BURST_COLORS: Record<BoidKind, string> = {
  melee: "#ff6b7d",
  ranged: "#6ff5dd",
  bomber: "#ffa040",
  queen: "#ff8cf0",
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A blast's push at distance `d` from its centre: full at the centre, half at its edge. */
const blastFalloff = (d: number, radius: number) => 0.5 + 0.5 * (1 - Math.min(1, d / radius));

export class Combat {
  boids: Boid[] = [];
  shots: Shot[] = [];
  slashes: Slash[] = [];
  sparks: Spark[] = [];
  blasts: Blast[] = [];
  flocks: Flock[] = [];
  queen!: Boid;
  /** Where the queen is roaming to while the player isn't close. */
  private queenGoal: { x: number; y: number } | null = null;
  /** The queen's starting escort size: her flock never sheds members below it. */
  private escortSize = 0;
  bounds = { x: 0, y: 0, r: 1 };
  private islands: Island[] = [];
  private nextId = 0;
  private rand = Math.random;
  /** Player hits since the last `takePlayerHits()`, by weapon. */
  private playerHits: PlayerHit[] = [];
  /** Combat events since the last `takeEvents()`. */
  private events: CombatEvent[] = [];
  /** The player as of this update, for blasts set off by the player's own hits. */
  private player: PlayerView = { x: 0, y: 0, alt: 0, targetable: false };
  private hooks: PlayerHooks = { hit: () => false, push: () => {} };

  private rules: SwarmRules = NO_RULES;
  /** Swarm members (escort and queen excluded) the player must still kill to break the queen's shield. */
  shieldLeft = 0;
  /** Seconds until the next reinforcement flock. */
  private reinforceIn = 0;

  get queenDead() {
    return this.queen.hp <= 0;
  }

  get queenShielded() {
    return this.shieldLeft > 0;
  }

  /** New swarm for a planet: its flocks at their spawn points, the queen and her escort at her home. */
  reset(planet: Planet, rules: SwarmRules = NO_RULES) {
    this.rules = rules;
    const swarm = planet.flocks.reduce((n, f) => n + f.kinds.length, 0);
    this.shieldLeft = Math.ceil(swarm * rules.shield);
    this.reinforceIn = rules.reinforce?.every ?? 0;
    this.islands = planet.islands;
    this.bounds = planet.bounds;
    this.rand = mulberry32(planet.seed ^ 0x5bd1e995);
    this.boids = [];
    this.shots = [];
    this.slashes = [];
    this.playerHits = [];
    this.events = [];
    this.sparks = [];
    this.blasts = [];
    this.flocks = [];
    this.queenGoal = null;
    const home = planet.queenHome;
    const escort = this.newFlock(home.x, home.y);
    this.queen = this.spawn("queen", home.x, home.y, escort);
    this.queen.hp = this.queen.maxHp = planet.queenHp;
    this.escortSize = planet.escort.length;
    for (const kind of planet.escort) this.spawnNear(kind, home.x, home.y, escort);
    for (const f of planet.flocks) {
      const flock = this.newFlock(f.x, f.y);
      for (const kind of f.kinds) this.spawnNear(kind, f.x, f.y, flock);
    }
  }

  private newFlock(x: number, y: number): Flock {
    const f: Flock = {
      members: [],
      goalX: x,
      goalY: y,
      joining: null,
      engaged: false,
      provoked: 0,
      hunting: false,
      cx: x,
      cy: y,
      vx: 0,
      vy: 0,
    };
    this.flocks.push(f);
    return f;
  }

  /** Spawn a flock member scattered around the flock's spawn point. */
  private spawnNear(kind: BoidKind, x: number, y: number, flock: Flock) {
    const a = this.rand() * Math.PI * 2;
    const d = 20 + this.rand() * 40;
    this.spawn(kind, x + Math.cos(a) * d, y + Math.sin(a) * d, flock);
  }

  private spawn(kind: BoidKind, x: number, y: number, flock: Flock): Boid {
    const hp = kind === "queen" ? 1 : Math.max(1, Math.round(BOID_HP[kind] * this.rules.hp)); // the queen's is set by `reset`
    const a = this.rand() * Math.PI * 2;
    const b: Boid = {
      id: this.nextId++,
      kind,
      x,
      y,
      alt: kind === "queen" ? ISLAND_TOP + 55 : CRUISE_ALT,
      vx: Math.cos(a) * 60,
      vy: Math.sin(a) * 60,
      hp,
      maxHp: hp,
      r: BOID_RADIUS[kind] * (kind === "queen" ? 1 : this.rules.size),
      cooldown: this.rand() * 1.5,
      lunge: 0,
      windup: 0,
      freeze: 0,
      heading: 0,
      flash: 0,
      phase: this.rand() * 100,
      flock,
    };
    this.boids.push(b);
    flock.members.push(b);
    return b;
  }

  // -------------------------------------------------------------------------------------------
  // Player attacks
  // -------------------------------------------------------------------------------------------

  /** Sword swipe; `power` 0..1 scales reach and damage. */
  swing(x: number, y: number, alt: number, dx: number, dy: number, power: number) {
    const range = lerp(params.player.sword.range, params.player.sword.maxRange, power);
    const damage = lerp(params.player.sword.damage, params.player.sword.maxDamage, power);
    this.slashes.push({ x, y, alt, dx, dy, age: 0, range, damage, power, hits: new Set() });
  }

  /** Spear throw; `power` 0..1 scales speed, damage and size. */
  throwSpear(x: number, y: number, alt: number, dx: number, dy: number, power: number) {
    const speed = lerp(params.player.spear.speed, params.player.spear.maxSpeed, power);
    this.shots.push({
      x: x + dx * 10,
      y: y + dy * 10,
      alt,
      vx: dx * speed,
      vy: dy * speed,
      vz: 0,
      life: params.player.spear.life,
      fromPlayer: true,
      damage: lerp(params.player.spear.damage, params.player.spear.maxDamage, power),
      scale: lerp(1, params.player.spear.maxScale, power),
    });
  }

  /** The player's hits since the last call (one entry per enemy hit). */
  takePlayerHits() {
    const hits = this.playerHits;
    this.playerHits = [];
    return hits;
  }

  /** Combat events since the last call. */
  takeEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  private event(type: CombatEvent["type"], x: number, y: number, alt: number, extra: Partial<CombatEvent> = {}) {
    this.events.push({ type, x, y, alt, ...extra });
  }

  private damage(b: Boid, dmg: number, fromX: number, fromY: number, weapon: PlayerHit["weapon"]) {
    if (b.hp <= 0) return;
    if (b.kind === "queen" && this.queenShielded) {
      // The shield turns the hit; it still angers her flock.
      this.event("block", b.x, b.y, b.alt);
      this.burst(b.x, b.y, b.alt, 8, "#9fe8ff");
      b.flock.provoked = params.boids.swarm.provokedTime;
      return;
    }
    this.playerHits.push({ weapon, damage: dmg });
    b.freeze = Math.max(b.freeze, hitStop(dmg));
    b.hp -= dmg;
    b.flash = 0.15;
    this.event("hit", b.x, b.y, b.alt, { kind: b.kind, killed: b.hp <= 0 });
    const l = Math.hypot(b.x - fromX, b.y - fromY) || 1;
    const push = b.kind === "queen" ? 60 : 260;
    b.vx += ((b.x - fromX) / l) * push;
    b.vy += ((b.y - fromY) / l) * push;
    b.lunge = 0;
    // Hitting any member (the queen too) sets the whole flock on the player; hitting the queen's
    // flock also calls in the flock nearest the player after it.
    b.flock.provoked = params.boids.swarm.provokedTime;
    if (b.flock === this.queen.flock) this.callReinforcements();
    this.burst(b.x, b.y, b.alt, b.hp <= 0 ? 18 : 6, BURST_COLORS[b.kind]);
    if (b.hp <= 0 && b.kind === "queen") this.burst(b.x, b.y, b.alt, 60, "#ffe27a");
    // Each kill wears the queen's shield down.
    if (b.hp <= 0 && b.kind !== "queen") this.shieldLeft = Math.max(0, this.shieldLeft - 1);
    // Killing a bomber sets it off where it is.
    if (b.hp <= 0 && b.kind === "bomber") this.explode(b);
  }

  /**
   * A bomber blows up: everything within the blast radius is shoved away from it (more the closer
   * it is), and the player is hurt and thrown, off their rim if they hang on one.
   */
  private explode(b: Boid) {
    const bp = params.enemyAttacks.bomber;
    const R = bp.blastRadius;
    b.hp = 0;
    this.event("explode", b.x, b.y, b.alt);
    this.blasts.push({ x: b.x, y: b.y, alt: b.alt, age: 0, radius: R, rgb: "255,200,120" });
    this.burst(b.x, b.y, b.alt, 36, "#ffa040");
    this.burst(b.x, b.y, b.alt, 18, "#fff1a8");
    const blast = box(b.x, b.y, b.alt, R);
    for (const o of this.boids) {
      if (o === b || o.hp <= 0) continue;
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const d = Math.hypot(dx, dy);
      if (!overlaps(blast, boidHurtbox(o))) continue;
      const push = bp.boidPush * blastFalloff(d, R) * (o.kind === "queen" ? 0.25 : 1);
      o.vx += (dx / (d || 1)) * push;
      o.vy += (dy / (d || 1)) * push;
      o.lunge = 0;
    }
    this.blastPlayer(blast, bp.damage, bp.playerPush, bp.playerLift);
  }

  /**
   * The queen's blast: throws the player out at full force anywhere within its radius, at any
   * height, but spares her swarm.
   */
  private queenBlast(q: Boid) {
    const qa = params.enemyAttacks.queen;
    this.event("queenBlast", q.x, q.y, q.alt);
    this.blasts.push({ x: q.x, y: q.y, alt: q.alt, age: 0, radius: qa.blastRadius, rgb: "255,140,240", heavy: true });
    this.burst(q.x, q.y, q.alt, 60, BURST_COLORS.queen);
    this.burst(q.x, q.y, q.alt, 30, "#ffe27a");
    this.burst(q.x, q.y, q.alt, 20, "#ffffff");
    this.blastPlayer(box(q.x, q.y, q.alt, qa.blastRadius), qa.damage, qa.playerPush, qa.playerLift, true);
  }

  /**
   * A blast catching the player: hurt, and thrown away from its centre (harder the closer). A
   * `heavy` blast reaches them however far above or below it they are, throws at full force
   * throughout, and can't be flown through.
   */
  private blastPlayer(blast: Hitbox, damage: number, push: number, lift: number, heavy = false) {
    const p = this.player;
    if (!p.targetable || !overlaps(heavy ? { ...blast, alt: p.alt } : blast, playerHurtbox(p))) return;
    this.hooks.hit(damage, blast.x, blast.y);
    const dx = p.x - blast.x;
    const dy = p.y - blast.y;
    const l = Math.hypot(dx, dy) || 1;
    const k = heavy ? 1 : blastFalloff(Math.hypot(dx, dy, p.alt - blast.alt), blast.radius);
    this.hooks.push((dx / l) * push * k, (dy / l) * push * k, lift * k, heavy);
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

  // -------------------------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------------------------

  /** `dt` is world time; `dtReal` is wall-clock time, which hit-stop runs on. */
  update(dt: number, dtReal: number, player: PlayerView, hooks: PlayerHooks) {
    this.player = player;
    this.hooks = hooks;
    this.updateReinforcements(dt);
    this.updateFlocks(dt, player);
    this.updateBoids(dt, dtReal, player);
    this.updateSlashes(dt);
    this.updateShots(dt, player);
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
    this.boids = this.boids.filter((b) => b.hp > 0 || b.kind === "queen");
  }

  private updateSlashes(dt: number) {
    for (const s of this.slashes) {
      s.age += dt;
      if (s.age > params.player.sword.activeTime) continue;
      const hitbox: Hitbox = {
        ...box(s.x, s.y, s.alt, s.range),
        sector: { dx: s.dx, dy: s.dy, arc: params.player.sword.arc },
      };
      for (const b of this.boids) {
        if (b.hp <= 0 || s.hits.has(b) || !overlaps(hitbox, boidHurtbox(b))) continue;
        s.hits.add(b);
        this.damage(b, s.damage, s.x, s.y, "sword");
      }
      // The blade also blocks enemy projectiles passing through the swipe.
      for (const sh of this.shots) {
        if (sh.fromPlayer || sh.life <= 0 || !overlaps(hitbox, shotBox(sh))) continue;
        sh.life = 0;
        this.event("block", sh.x, sh.y, sh.alt);
        this.burst(sh.x, sh.y, sh.alt, 8, "#f4ffd0");
      }
    }
    this.slashes = this.slashes.filter((s) => s.age < params.player.sword.activeTime + params.player.sword.fadeTime);
  }

  private updateShots(dt: number, player: PlayerView) {
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.alt += s.vz * dt;
      s.life -= dt;
      const hitbox = shotBox(s);
      if (s.fromPlayer) {
        for (const b of this.boids) {
          if (b.hp <= 0) continue;
          if (overlaps(hitbox, boidHurtbox(b))) {
            this.damage(b, s.damage, s.x - s.vx * 0.05, s.y - s.vy * 0.05, "spear");
            s.life = 0;
            break;
          }
        }
      } else if (player.targetable && overlaps(hitbox, playerHurtbox(player))) {
        this.hooks.hit(s.damage, s.x - s.vx, s.y - s.vy);
        s.life = 0;
      }
      // Islands block projectiles.
      if (s.life > 0 && this.islands.some((i) => i.intersects(s.x, s.y, s.alt, 2))) {
        this.event("thud", s.x, s.y, s.alt);
        this.burst(s.x, s.y, s.alt, 4, s.fromPlayer ? "#f4e3c0" : "#c9ff7a");
        s.life = 0;
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

// -------------------------------------------------------------------------------------------
  // Flocks
  // -------------------------------------------------------------------------------------------

  /** Every so often a hunting flock flies in from a random point on the boundary, while the swarm is small enough. */
  private updateReinforcements(dt: number) {
    const r = this.rules.reinforce;
    if (!r || this.queenDead) return;
    this.reinforceIn -= dt;
    if (this.reinforceIn > 0) return;
    this.reinforceIn = r.every;
    if (this.boids.length - 1 >= r.cap || !r.kinds.length) return;
    const a = this.rand() * Math.PI * 2;
    const x = this.bounds.x + Math.cos(a) * this.bounds.r * 0.95;
    const y = this.bounds.y + Math.sin(a) * this.bounds.r * 0.95;
    const flock = this.newFlock(x, y);
    flock.hunting = true;
    for (let i = 0; i < r.size; i++) this.spawnNear(r.kinds[Math.floor(this.rand() * r.kinds.length)]!, x, y, flock);
  }

  /**
   * Flock-level decisions: drop the dead, track centres, engage together, and while idle roam,
   * join other flocks or shed members into new flocks.
   */
  private updateFlocks(dt: number, player: PlayerView) {
    const fp = params.boids.flocks;
    const queenFlock = this.queen.flock;
    for (const f of this.flocks) f.members = f.members.filter((b) => b.hp > 0 || b.kind === "queen");
    this.flocks = this.flocks.filter((f) => f.members.length > 0);

    for (const f of this.flocks) {
      let cx = 0;
      let cy = 0;
      let vx = 0;
      let vy = 0;
      for (const b of f.members) {
        cx += b.x;
        cy += b.y;
        vx += b.vx;
        vy += b.vy;
      }
      const n = f.members.length;
      Object.assign(f, { cx: cx / n, cy: cy / n, vx: vx / n, vy: vy / n });
      // The whole flock engages once any member is close or was hit, and stays on until all are
      // well away and the provocation has worn off.
      const near = (r: number) =>
        f.members.some((b) => b.kind !== "queen" && Math.hypot(b.x - player.x, b.y - player.y) < r);
      f.provoked = Math.max(0, f.provoked - dt);
      f.engaged =
        player.targetable &&
        (f.hunting ||
          f.provoked > 0 ||
          near(params.boids.swarm.aggroRange) ||
          (f.engaged && near(params.boids.swarm.disengageRange)));
    }

    this.recruitGuards();

    for (const f of [...this.flocks]) {
      if (!this.flocks.includes(f)) continue; // merged away this frame
      if (f.joining && !this.flocks.includes(f.joining)) f.joining = null;
      if (f.engaged) {
        f.joining = null;
        continue;
      }
      if (f.joining) {
        const o = f.joining;
        f.goalX = o.cx;
        f.goalY = o.cy;
        if (f.members.length + o.members.length > fp.maxSize) f.joining = null;
        else if (Math.hypot(o.cx - f.cx, o.cy - f.cy) < params.boids.flocking.neighborRadius) this.merge(f, o);
        continue;
      }
      if (f === queenFlock) {
        f.goalX = this.queen.x;
        f.goalY = this.queen.y;
      } else if (Math.hypot(f.goalX - f.cx, f.goalY - f.cy) < 80) {
        this.pickGoal(f);
      }
      // The queen's flock stays with her: others come to it, never the other way round.
      if (f !== queenFlock && this.rand() < fp.joinChance * dt) {
        let best: Flock | null = null;
        let bestD = fp.joinRange;
        for (const o of this.flocks) {
          if (o === f || o.engaged || f.members.length + o.members.length > fp.maxSize) continue;
          const d = Math.hypot(o.cx - f.cx, o.cy - f.cy);
          if (d < bestD) {
            best = o;
            bestD = d;
          }
        }
        f.joining = best;
      }
      if (this.rand() < fp.leaveChance * dt) this.split(f);
    }
  }

  /**
   * The queen is always guarded: while her flock is short of her starting escort, the flocks
   * nearest her hand over members (idle flocks before engaged ones), who fly over to her.
   */
  private recruitGuards() {
    const q = this.queen;
    const qf = q.flock;
    let missing = this.escortSize - qf.members.filter((b) => b.kind !== "queen").length;
    if (q.hp <= 0 || missing <= 0) return;
    const toQueen = (x: number, y: number) => Math.hypot(x - q.x, y - q.y);
    const donors = this.flocks
      .filter((f) => f !== qf && toQueen(f.cx, f.cy) < params.boids.queen.recruitRange)
      .sort((a, b) => Number(a.engaged) - Number(b.engaged) || toQueen(a.cx, a.cy) - toQueen(b.cx, b.cy));
    for (const f of donors) {
      const recruits = f.members
        .filter((b) => b.lunge <= 0)
        .sort((a, b) => toQueen(a.x, a.y) - toQueen(b.x, b.y))
        .slice(0, missing);
      f.members = f.members.filter((b) => !recruits.includes(b));
      for (const b of recruits) b.flock = qf;
      qf.members.push(...recruits);
      missing -= recruits.length;
      if (missing <= 0) break;
    }
    this.flocks = this.flocks.filter((f) => f.members.length > 0);
  }

  /** The queen's flock is under attack: the flock nearest the player, besides hers, joins in. */
  private callReinforcements() {
    const p = this.player;
    let best: Flock | null = null;
    let bestD = Infinity;
    for (const f of this.flocks) {
      if (f === this.queen.flock) continue;
      const d = Math.hypot(f.cx - p.x, f.cy - p.y);
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    if (best) best.provoked = params.boids.swarm.provokedTime;
  }

  /** `a` joins `b` (the queen's flock always takes the other in). */
  private merge(a: Flock, b: Flock) {
    if (a === this.queen.flock) [a, b] = [b, a];
    for (const m of a.members) m.flock = b;
    b.members.push(...a.members);
    b.joining = null;
    this.flocks = this.flocks.filter((f) => f !== a);
  }

  /** A random number of members leave together as a new flock, heading somewhere else. */
  private split(f: Flock) {
    const movers = f.members.filter((b) => b.kind !== "queen");
    // Someone always stays behind; the queen keeps at least her starting escort.
    const keep = f === this.queen.flock ? Math.max(1, this.escortSize) : 1;
    if (movers.length <= keep) return;
    const n = 1 + Math.floor(this.rand() * (movers.length - keep));
    for (let i = movers.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [movers[i], movers[j]] = [movers[j]!, movers[i]!];
    }
    const leaving = movers.slice(0, n);
    f.members = f.members.filter((b) => !leaving.includes(b));
    const nf = this.newFlock(f.cx, f.cy);
    nf.members = leaving;
    for (const b of leaving) b.flock = nf;
    Object.assign(nf, { cx: f.cx, cy: f.cy, vx: f.vx, vy: f.vy });
    this.pickGoal(nf);
  }

  /** A new roaming goal some way off, in bounds and not over an island. */
  private pickGoal(f: Flock) {
    for (let i = 0; i < 20; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = 250 + this.rand() * 450;
      const x = f.cx + Math.cos(a) * d;
      const y = f.cy + Math.sin(a) * d;
      if (Math.hypot(x - this.bounds.x, y - this.bounds.y) > this.bounds.r * 0.85) continue;
      if (this.islands.some((isl) => isl.contains(x, y))) continue;
      f.goalX = x;
      f.goalY = y;
      return;
    }
    f.goalX = this.bounds.x;
    f.goalY = this.bounds.y;
  }

  // -------------------------------------------------------------------------------------------
  // Boids
  // -------------------------------------------------------------------------------------------

  private updateBoids(dt: number, dtReal: number, player: PlayerView) {
    const q = this.queen;
    const queenAlive = q.hp > 0;
    const playerToQueen = Math.hypot(player.x - q.x, player.y - q.y);
    const queenThreatened = queenAlive && player.targetable && playerToQueen < params.boids.queen.threatRadius;

    for (const b of this.boids) {
      if (b.hp <= 0) continue;
      if (b.freeze > 0) {
        b.freeze -= dtReal;
        continue;
      }
      b.heading = Math.atan2(b.vy, b.vx);
      b.phase += dt;
      b.flash = Math.max(0, b.flash - dt);
      b.cooldown -= dt;

      const px = player.x - b.x;
      const py = player.y - b.y;
      const dP = Math.hypot(px, py) || 1;

      if (b.kind === "queen") {
        this.updateQueen(b, dt, player, dP);
        continue;
      }

      const flock = b.flock;
      const engaged = flock.engaged;
      // The queen's flock screens her from the player.
      const guarding = queenThreatened && flock === q.flock;

      // Bombers go off on contact with the player.
      const bp = params.enemyAttacks.bomber;
      if (
        b.kind === "bomber" &&
        player.targetable &&
        overlaps(box(b.x, b.y, b.alt, bp.triggerRange), playerHurtbox(player))
      ) {
        this.explode(b);
        continue;
      }

      // Lunging melee boids just fly the lunge out.
      if (b.lunge > 0) {
        b.lunge -= dt;
        b.alt += (player.alt + 4 - b.alt) * Math.min(1, dt * 10);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        this.keepOffIslands(b);
        this.keepInBounds(b);
        if (player.targetable && overlaps(boidHurtbox(b), playerHurtbox(player))) {
          // A landed melee hit freezes the attacker along with the player.
          const dmg = params.enemyAttacks.hit.damage;
          if (this.hooks.hit(dmg, b.x, b.y)) b.freeze = Math.max(b.freeze, hitStop(dmg));
          b.lunge = 0;
          b.vx = (-px / dP) * 160;
          b.vy = (-py / dP) * 160;
        }
        continue;
      }

      let ax = 0;
      let ay = 0;

      // Classic boids, within the flock only: separation, alignment, cohesion.
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (const o of flock.members) {
        if (o === b || o.hp <= 0) continue;
        const ox = b.x - o.x;
        const oy = b.y - o.y;
        const d = Math.hypot(ox, oy);
        // Members keep clear of the queen's larger body, but don't align or gather on her.
        const sepR = params.boids.flocking.separationRadius + (o.kind === "queen" ? o.r : 0);
        if (d < sepR && d > 0) {
          const push = 1 - d / sepR;
          sx += (ox / d) * push;
          sy += (oy / d) * push;
        }
        if (o.kind !== "queen" && d < params.boids.flocking.neighborRadius) {
          avx += o.vx;
          avy += o.vy;
          cx += o.x;
          cy += o.y;
          n++;
        }
      }
      ax += sx * params.boids.flocking.separation;
      ay += sy * params.boids.flocking.separation;
      if (n > 0) {
        ax += (avx / n - b.vx) * params.boids.flocking.alignment;
        ay += (avy / n - b.vy) * params.boids.flocking.alignment;
        ax += (cx / n - b.x) * params.boids.flocking.cohesion;
        ay += (cy / n - b.y) * params.boids.flocking.cohesion;
      }

      const seek = (tx: number, ty: number, speed: number, weight: number, arrive = true) => {
        const dx = tx - b.x;
        const dy = ty - b.y;
        const d = Math.hypot(dx, dy) || 1;
        // Arrive: slow down near the target.
        const want = arrive ? Math.min(speed, d * 3) : speed;
        ax += ((dx / d) * want - b.vx) * weight;
        ay += ((dy / d) * want - b.vy) * weight;
      };

      const maxSpeed = SPEEDS[b.kind]();
      let targetAlt = CRUISE_ALT + Math.sin(b.phase * 1.3) * 10;

      if (b.kind === "bomber" && player.targetable && (engaged || guarding)) {
        // Bombers dive straight at the player.
        seek(player.x, player.y, maxSpeed, 2.5, false);
        targetAlt = player.alt + 4;
      } else if (guarding) {
        // Form a screen between the queen and the player, spread out by id.
        const qx = (player.x - q.x) / (playerToQueen || 1);
        const qy = (player.y - q.y) / (playerToQueen || 1);
        const spread = ((b.id % 7) - 3) * 0.35;
        const dist = q.r + 45 + (b.id % 4) * 22;
        const gx = q.x + (qx * Math.cos(spread) - qy * Math.sin(spread)) * dist;
        const gy = q.y + (qx * Math.sin(spread) + qy * Math.cos(spread)) * dist;
        seek(gx, gy, maxSpeed * 1.3, 2.5);
        targetAlt = player.alt + 6;
      } else if (engaged) {
        if (b.kind === "melee") {
          seek(player.x, player.y, maxSpeed, 1.6);
        } else {
          // Hold a ring around the player, circling.
          const ring = params.enemyAttacks.ranged.keepAway;
          const tx = player.x - (px / dP) * ring + (-py / dP) * 60 * Math.sign(Math.sin(b.id));
          const ty = player.y - (py / dP) * ring + (px / dP) * 60 * Math.sign(Math.sin(b.id));
          seek(tx, ty, maxSpeed, 1.6);
        }
        targetAlt = player.alt + 6;
      } else {
        // Idle: wander a little while the flock roams toward its goal. The queen's flock circles her.
        const wa = Math.sin(b.phase * 0.7 + b.id) * Math.PI;
        ax += Math.cos(wa) * params.boids.flocking.wander;
        ay += Math.sin(wa) * params.boids.flocking.wander;
        const roam = params.boids.flocks.roamSpeed * (flock.joining ? 1.5 : 1);
        if (flock === q.flock && queenAlive) {
          const a = b.phase * 0.5 + b.id * 2.4;
          const d = q.r + 50 + (b.id % 3) * 20;
          seek(q.x + Math.cos(a) * d, q.y + Math.sin(a) * d, Math.max(roam, 120), 0.8);
        } else {
          seek(flock.goalX, flock.goalY, roam, 0.6, false);
        }
      }

      // Attacks
      if (player.targetable && (engaged || guarding) && b.cooldown <= 0) {
        if (b.kind === "melee" && dP < params.enemyAttacks.melee.lungeRange) {
          b.lunge = params.enemyAttacks.melee.lungeTime;
          b.vx = (px / dP) * params.enemyAttacks.melee.lungeSpeed;
          b.vy = (py / dP) * params.enemyAttacks.melee.lungeSpeed;
          b.cooldown = params.enemyAttacks.melee.cooldown + this.rand() * 0.5;
          this.event("lunge", b.x, b.y, b.alt);
          continue;
        }
        if (b.kind === "ranged" && dP < params.enemyAttacks.ranged.range) {
          const dz = player.alt - b.alt;
          const d3 = Math.hypot(px, py, dz) || 1;
          this.shots.push({
            x: b.x,
            y: b.y,
            alt: b.alt,
            vx: (px / d3) * params.enemyAttacks.ranged.orbSpeed,
            vy: (py / d3) * params.enemyAttacks.ranged.orbSpeed,
            vz: (dz / d3) * params.enemyAttacks.ranged.orbSpeed,
            life: params.enemyAttacks.ranged.orbLife,
            fromPlayer: false,
            damage: params.enemyAttacks.hit.damage,
            scale: 1,
          });
          b.cooldown = params.enemyAttacks.ranged.cooldown + this.rand() * 0.8;
          this.event("shot", b.x, b.y, b.alt);
        }
      }

      const ob = this.outOfBounds(b);
      if (ob) {
        ax += ob.x * 300;
        ay += ob.y * 300;
      }
      const away = this.islandForce(b);
      ax += away.x;
      ay += away.y;

      b.vx += ax * dt;
      b.vy += ay * dt;
      const sp = Math.hypot(b.vx, b.vy);
      const cap = maxSpeed * (guarding ? 1.3 : 1);
      if (sp > cap) {
        // Ease back down (knockback, lunges and blasts decay smoothly rather than snapping).
        const k = Math.max(cap / sp, Math.exp(-4 * dt));
        b.vx *= k;
        b.vy *= k;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      this.keepOffIslands(b);
      this.keepInBounds(b);
      targetAlt = Math.max(ISLAND_TOP - 15, Math.min(ISLAND_TOP + 170, targetAlt));
      b.alt += Math.max(-90 * dt, Math.min(90 * dt, targetAlt - b.alt));
    }
  }

  private updateQueen(b: Boid, dt: number, player: PlayerView, dP: number) {
    // When the player comes close she gets angry, and after the wind-up lets off a blast.
    const qa = params.enemyAttacks.queen;
    if (b.windup > 0) {
      b.windup -= dt;
      if (b.windup <= 0) {
        b.windup = 0;
        b.cooldown = qa.cooldown;
        this.queenBlast(b);
      }
    } else if (
      player.targetable &&
      b.cooldown <= 0 &&
      overlaps(box(b.x, b.y, b.alt, qa.triggerRange), playerHurtbox(player))
    ) {
      b.windup = qa.windup;
      this.event("anger", b.x, b.y, b.alt);
    }

    let ax = 0;
    let ay = 0;
    if (b.windup > 0) {
      // Holding still while she seethes.
      ax -= b.vx * 4;
      ay -= b.vy * 4;
    } else {
      const qp = params.boids.queen;
      let dx: number;
      let dy: number;
      let speed = qp.speed;
      if (player.targetable && dP < qp.fleeRange) {
        // Flee from the player, but the nearer the boundary the more she turns back inward, so she
        // slips past them toward open space rather than being run into the edge.
        const ix = this.bounds.x - b.x;
        const iy = this.bounds.y - b.y;
        const id = Math.hypot(ix, iy) || 1;
        const edge = Math.max(0, Math.min(1, (id / this.bounds.r - 0.35) / 0.45));
        dx = (b.x - player.x) / dP + (ix / id) * edge * 1.6;
        dy = (b.y - player.y) / dP + (iy / id) * edge * 1.6;
        this.queenGoal = null;
      } else {
        // Otherwise roam between spots in the inner part of the planet, slowly.
        if (!this.queenGoal || Math.hypot(this.queenGoal.x - b.x, this.queenGoal.y - b.y) < 40) {
          this.queenGoal = this.queenRoamGoal(player);
        }
        dx = this.queenGoal.x - b.x;
        dy = this.queenGoal.y - b.y;
        speed = Math.min(qp.speed * 0.55, Math.hypot(dx, dy));
      }
      const l = Math.hypot(dx, dy) || 1;
      ax += ((dx / l) * speed - b.vx) * 2;
      ay += ((dy / l) * speed - b.vy) * 2;
    }
    const ob = this.outOfBounds(b);
    if (ob) {
      ax += ob.x * 300;
      ay += ob.y * 300;
    }
    const away = this.islandForce(b);
    ax += away.x;
    ay += away.y;
    b.vx += ax * dt;
    b.vy += ay * dt;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > params.boids.queen.speed) {
      const k = Math.max(params.boids.queen.speed / sp, Math.exp(-3 * dt));
      b.vx *= k;
      b.vy *= k;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    this.keepOffIslands(b);
    this.keepInBounds(b);
    b.alt = ISLAND_TOP + 50 + Math.sin(b.phase * 1.1) * 8;
  }

  /** Somewhere in the inner part of the planet, not over an island, and preferably away from the player. */
  private queenRoamGoal(player: PlayerView): { x: number; y: number } {
    let best = { x: this.bounds.x, y: this.bounds.y };
    let bestScore = -Infinity;
    for (let i = 0; i < 12; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = Math.sqrt(this.rand()) * this.bounds.r * 0.55;
      const x = this.bounds.x + Math.cos(a) * d;
      const y = this.bounds.y + Math.sin(a) * d;
      if (this.islands.some((isl) => isl.contains(x, y))) continue;
      const score = player.targetable ? Math.hypot(x - player.x, y - player.y) : this.rand();
      if (score > bestScore) {
        best = { x, y };
        bestScore = score;
      }
    }
    return best;
  }

  /** Signed distance from an island's rim (negative inside) with the rim's outward normal there. */
  private rimDistance(isl: Island, b: Boid): { d: number; nx: number; ny: number; x: number; y: number } | null {
    // Cheap reject: far from the island's bounding circle.
    if (Math.hypot(b.x - isl.cx, b.y - isl.cy) > isl.radius * 1.35 + params.boids.islands.margin + b.r) return null;
    const c = isl.closest(b.x, b.y);
    const e = isl.pointAt(c.s);
    return { d: isl.contains(b.x, b.y) ? -c.d : c.d, nx: e.nx, ny: e.ny, x: e.x, y: e.y };
  }

  /** Soft push away from island rims, growing as a boid gets within islandMargin. */
  private islandForce(b: Boid): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const isl of this.islands) {
      const r = this.rimDistance(isl, b);
      if (!r || r.d > params.boids.islands.margin) continue;
      const depth = params.boids.islands.margin - r.d;
      x += r.nx * depth * params.boids.islands.avoid;
      y += r.ny * depth * params.boids.islands.avoid;
    }
    return { x, y };
  }

  /** Hard constraint: a boid never ends up over an island; it is put back just outside the rim. */
  private keepOffIslands(b: Boid) {
    const clearance = b.r * 0.6;
    for (const isl of this.islands) {
      const r = this.rimDistance(isl, b);
      if (!r || r.d >= clearance) continue;
      b.x = r.x + r.nx * clearance;
      b.y = r.y + r.ny * clearance;
      // Drop the velocity component pointing into the island.
      const into = b.vx * r.nx + b.vy * r.ny;
      if (into < 0) {
        b.vx -= r.nx * into;
        b.vy -= r.ny * into;
      }
    }
  }

  /** Inward steering that ramps up over the last stretch before the boundary. */
  private outOfBounds(b: Boid): { x: number; y: number } | null {
    const dx = b.x - this.bounds.x;
    const dy = b.y - this.bounds.y;
    const d = Math.hypot(dx, dy);
    const start = this.bounds.r - 100;
    if (d < start) return null;
    const k = (d - start) / 100;
    return { x: (-dx / d) * k, y: (-dy / d) * k };
  }

  /** Hard constraint: boids never leave the boundary circle. */
  private keepInBounds(b: Boid) {
    const dx = b.x - this.bounds.x;
    const dy = b.y - this.bounds.y;
    const d = Math.hypot(dx, dy);
    const max = this.bounds.r - b.r;
    if (d <= max) return;
    const nx = dx / d;
    const ny = dy / d;
    b.x = this.bounds.x + nx * max;
    b.y = this.bounds.y + ny * max;
    const out = b.vx * nx + b.vy * ny;
    if (out > 0) {
      b.vx -= nx * out;
      b.vy -= ny * out;
    }
  }
}
