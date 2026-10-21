import { boidType, BOID_TYPES, type BoidTypeId } from "./boids";
import type { BomberParams } from "./boids/bomber";
import type { QueenParams } from "./boids/queen";
import { resolveParams, type BaseParams, type BoidContext, type BoidType } from "./boids/types";
import { DEFAULT_STYLE, type FlockSpec, type FlockStyle } from "./flocks";
import { box, outOfHitHeight, overlaps, type Hitbox, type Hurtbox } from "./hitbox";
import { ISLAND_TOP, mulberry32, type Island } from "./island";
import type { Planet } from "./planet";
import { params } from "./tuning";

// Combat: the enemy swarm (boids in flocks), projectiles, sword slashes, blasts and hit particles.
// Everything lives on the same flat game plane as the player, with an altitude for depth.
// What each kind of boid does lives in its type (src/boids); this is the shared machinery:
// spawning, flocking, hits, blasts and the queen's guard.

/**
 * A group of boids that roams, fights and flocks together. The boids rules only apply between
 * members, and pull toward the whole flock (with a soft leash past its spread), so a flock never
 * comes apart. Flocks with `escort` set guard the queen.
 */
export interface Flock {
  members: Boid[];
  style: FlockStyle;
  /** Where the flock is roaming to while idle. */
  goalX: number;
  goalY: number;
  engaged: boolean;
  /** Seconds left of staying engaged after a member was hit. */
  provoked: number;
  /** Always engaged while the player can be targeted. */
  hunting: boolean;
  /** Guards the queen: circles her while idle, screens her from the player when they're near. */
  escort: boolean;
  /** Centre and mean velocity of the members, updated every frame. */
  cx: number;
  cy: number;
  vx: number;
  vy: number;
}

export interface Boid<P extends BaseParams = BaseParams> {
  id: number;
  type: BoidType<P>;
  /** The type's params with this boid's overrides (and the level's elite multipliers). */
  params: P;
  x: number;
  y: number;
  alt: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  /** Body radius (the type's, × size); the same as the hurtbox's. */
  r: number;
  cooldown: number;
  lunge: number; // seconds of lunge left (melee)
  /** Seconds left winding up an attack (telegraphed), or of the queen's anger before her blast. */
  windup: number;
  /** Seconds left recovering after an attack, or staggered after an interrupted one: drifts, can't act. */
  recover: number;
  /** Direction of the attack being wound up (rad); it locks shortly before the attack goes off. */
  aim: number;
  flash: number; // hit flash timer
  freeze: number; // hit-stop left (s, real time): frozen boids don't move, act or animate
  heading: number; // facing for drawing; held while frozen (knockback changes vx/vy at once)
  phase: number; // wander / wing-flap phase
  /** Where a boid that roams on its own (the queen) is heading. */
  goal: { x: number; y: number } | null;
  /** Its flock (the queen's is her first escort flock; she isn't one of its members). */
  flock: Flock;
}

/** Level rules the swarm plays by (from the level's modifiers). */
export interface SwarmRules {
  /** Share of the starting swarm (escort excluded) to kill before the queen can be hurt; 0 = no shield. */
  shield: number;
  /** A copy of one of `flocks` arrives from the boundary this often (s), hunting, while the swarm is under `cap`; null = never. */
  reinforce: { every: number; flocks: FlockSpec[]; cap: number } | null;
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
  /** Hit radius of an enemy orb. */
  radius: number;
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
  type: "hit" | "shot" | "lunge" | "windup" | "interrupt" | "explode" | "anger" | "queenBlast" | "block" | "thud";
  x: number;
  y: number;
  alt: number;
  /** For hits: the type of who was hit, and whether it died; for windups, who winds up. */
  kind?: BoidTypeId;
  /** For windups: how long until the attack goes off (s). */
  dur?: number;
  killed?: boolean;
}

export interface PlayerHit {
  weapon: "sword" | "spear";
  damage: number;
}

const reach = (b: Boid) => b.type.reach?.(b) ?? 0;
const boidHurtbox = (b: Boid): Hurtbox => ({ ...box(b.x, b.y, b.alt, b.r), height: reach(b) });
const playerHurtbox = (p: PlayerView): Hurtbox => box(p.x, p.y, p.alt, params.player.hurtbox.radius);

/** A projectile is both: it hits its target, and the sword can hit (block) the enemies'. */
function shotBox(s: Shot): Hitbox & Hurtbox {
  const radius = s.fromPlayer ? params.player.spear.hitRadius * s.scale : s.radius;
  return box(s.x, s.y, s.alt, radius);
}

const CRUISE_ALT = ISLAND_TOP + 35;

/** How long a blast's shock ring shows (s). */
export const BLAST_TIME = 0.45;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A blast's push at distance `d` from its centre: full at the centre, half at its edge. */
/** How long a boid staggers after its windup is interrupted by a hit (s). */
const STAGGER = 0.7;

const blastFalloff = (d: number, radius: number) => 0.5 + 0.5 * (1 - Math.min(1, d / radius));

/** How hard members push apart inside their flock's spacing. */
const SEPARATION = 720;

export class Combat {
  boids: Boid[] = [];
  shots: Shot[] = [];
  slashes: Slash[] = [];
  sparks: Spark[] = [];
  blasts: Blast[] = [];
  flocks: Flock[] = [];
  /** null on planets without a queen: the swarm is just its flocks. */
  queen: Boid<QueenParams> | null = null;
  /** Members her escort started with: while fewer guard her, nearby flocks are called in to. */
  private escortSize = 0;
  bounds = { x: 0, y: 0, r: 1 };
  islands: Island[] = [];
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

  /** The planet is won: the queen is dead, or with no queen, the whole swarm. */
  get cleared() {
    return this.queen ? this.queen.hp <= 0 : this.boids.length === 0;
  }

  get queenShielded() {
    return this.shieldLeft > 0;
  }

  /** New swarm for a planet: its flocks at their spawn points, the queen and her escort at her home. */
  reset(planet: Planet, rules: SwarmRules = NO_RULES) {
    this.rules = rules;
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
    this.queen = null;
    this.escortSize = 0;
    const q = planet.queen;
    if (q) {
      const escort = this.spawnFlock(q.escort, q.x, q.y);
      escort.escort = true;
      this.escortSize = escort.members.length;
      const queen = this.spawn(BOID_TYPES.queen as unknown as BoidType, resolveParams(BOID_TYPES.queen, q.params), q.x, q.y, escort);
      escort.members.pop(); // she flies with them but isn't one of them
      this.queen = queen as unknown as Boid<QueenParams>;
    }
    for (const f of planet.flocks) this.spawnFlock(f.spec, f.x, f.y);
    const swarm = this.boids.filter((b) => !b.flock.escort).length;
    this.shieldLeft = Math.ceil(swarm * rules.shield);
    this.reinforceIn = rules.reinforce?.every ?? 0;
  }

  /** A flock from its spec, its members scattered around (x, y). */
  private spawnFlock(spec: FlockSpec, x: number, y: number): Flock {
    const style = { ...DEFAULT_STYLE, ...spec.style };
    const f: Flock = {
      members: [],
      style,
      goalX: x,
      goalY: y,
      engaged: false,
      provoked: 0,
      hunting: style.hunts >= 0.5,
      escort: false,
      cx: x,
      cy: y,
      vx: 0,
      vy: 0,
    };
    this.flocks.push(f);
    for (const m of spec.members) {
      const type = boidType(m.type);
      const p = resolveParams(type, m.params);
      // Elite levels: tougher and bigger.
      p.hp = Math.max(1, Math.round(p.hp * this.rules.hp));
      p.size *= this.rules.size;
      for (let i = 0; i < Math.round(m.count); i++) {
        const a = this.rand() * Math.PI * 2;
        const d = 20 + this.rand() * 40;
        this.spawn(type, p, x + Math.cos(a) * d, y + Math.sin(a) * d, f);
      }
    }
    return f;
  }

  private spawn(type: BoidType, p: BaseParams, x: number, y: number, flock: Flock): Boid {
    const a = this.rand() * Math.PI * 2;
    const b: Boid = {
      id: this.nextId++,
      type,
      params: { ...p },
      x,
      y,
      alt: type.update ? ISLAND_TOP + 55 : CRUISE_ALT,
      vx: Math.cos(a) * 60,
      vy: Math.sin(a) * 60,
      hp: p.hp,
      maxHp: p.hp,
      r: type.radius * p.size,
      cooldown: this.rand() * 1.5,
      lunge: 0,
      windup: 0,
      recover: 0,
      aim: 0,
      freeze: 0,
      heading: 0,
      flash: 0,
      phase: this.rand() * 100,
      goal: null,
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
      radius: 0,
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

  event(type: CombatEvent["type"], x: number, y: number, alt: number, extra: Partial<CombatEvent> = {}) {
    this.events.push({ type, x, y, alt, ...extra });
  }

  private damage(b: Boid, dmg: number, fromX: number, fromY: number, weapon: PlayerHit["weapon"]) {
    if (b.hp <= 0) return;
    const isQueen = b === this.queen;
    if (isQueen && this.queenShielded) {
      // The shield turns the hit; it still angers her guard.
      this.event("block", b.x, b.y, b.alt);
      this.burst(b.x, b.y, b.alt, 8, "#9fe8ff");
      this.provokeEscort();
      return;
    }
    this.playerHits.push({ weapon, damage: dmg });
    b.freeze = Math.max(b.freeze, hitStop(dmg));
    b.hp -= dmg;
    b.flash = 0.15;
    this.event("hit", b.x, b.y, b.alt, { kind: b.type.id as BoidTypeId, killed: b.hp <= 0 });
    const l = Math.hypot(b.x - fromX, b.y - fromY) || 1;
    const push = isQueen ? 60 : 260;
    b.vx += ((b.x - fromX) / l) * push;
    b.vy += ((b.y - fromY) / l) * push;
    b.lunge = 0;
    // A hit while winding up interrupts the attack and staggers the boid: a window to punish.
    if (!isQueen && b.windup > 0 && b.hp > 0) {
      b.windup = 0;
      b.recover = Math.max(b.recover, STAGGER);
      this.event("interrupt", b.x, b.y, b.alt);
      this.burst(b.x, b.y, b.alt, 10, "#ffffff");
    }
    // Hitting any member sets the whole flock on the player; hitting the queen or her guard also
    // calls in the flock nearest the player after it.
    if (isQueen) this.provokeEscort();
    else b.flock.provoked = b.flock.style.grudge;
    if (isQueen || b.flock.escort) this.callReinforcements();
    this.burst(b.x, b.y, b.alt, b.hp <= 0 ? 18 : 6, b.type.color);
    if (b.hp <= 0 && isQueen) this.burst(b.x, b.y, b.alt, 60, "#ffe27a");
    // Each kill wears the queen's shield down.
    if (b.hp <= 0 && !isQueen) this.shieldLeft = Math.max(0, this.shieldLeft - 1);
    // Killing a bomber sets it off where it is.
    if (b.hp <= 0 && b.type.id === "bomber") this.explode(b);
  }

  private provokeEscort() {
    for (const f of this.flocks) if (f.escort) f.provoked = f.style.grudge;
  }

  /**
   * A bomber blows up: everything within the blast radius is shoved away from it (more the closer
   * it is), and the player is hurt and thrown, off their rim if they hang on one.
   */
  explode(b: Boid) {
    const bp = b.params as BomberParams;
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
      const push = bp.boidPush * blastFalloff(d, R) * (o === this.queen ? 0.25 : 1);
      o.vx += (dx / (d || 1)) * push;
      o.vy += (dy / (d || 1)) * push;
      o.lunge = 0;
      if (o !== this.queen) o.windup = 0;
    }
    this.blastPlayer(blast, bp.damage, bp.playerPush, bp.playerLift);
  }

  /**
   * The queen's blast: throws the player out at full force anywhere within its radius, at any
   * height, but spares her swarm.
   */
  queenBlast(q: Boid) {
    const qa = q.params as QueenParams;
    this.event("queenBlast", q.x, q.y, q.alt);
    this.blasts.push({ x: q.x, y: q.y, alt: q.alt, age: 0, radius: qa.blastRadius, rgb: "255,140,240", heavy: true });
    this.burst(q.x, q.y, q.alt, 60, q.type.color);
    this.burst(q.x, q.y, q.alt, 30, "#ffe27a");
    this.burst(q.x, q.y, q.alt, 20, "#ffffff");
    this.blastPlayer(box(q.x, q.y, q.alt, qa.blastRadius), qa.damage, qa.playerPush, qa.playerLift, true);
  }

  /** An orb from `b` straight at the player. */
  shoot(b: Boid, speed: number, life: number, radius: number, damage: number) {
    const p = this.player;
    const px = p.x - b.x;
    const py = p.y - b.y;
    const dz = p.alt - b.alt;
    const d3 = Math.hypot(px, py, dz) || 1;
    this.shots.push({
      x: b.x,
      y: b.y,
      alt: b.alt,
      vx: (px / d3) * speed,
      vy: (py / d3) * speed,
      vz: (dz / d3) * speed,
      life,
      fromPlayer: false,
      damage,
      radius,
      scale: 1,
    });
    this.event("shot", b.x, b.y, b.alt);
  }

  /** Whether the player can be hit within `range` of `b` (default: its body). */
  touchesPlayer(b: Boid, range = b.r) {
    return this.player.targetable && overlaps({ ...box(b.x, b.y, b.alt, range), height: reach(b) }, playerHurtbox(this.player));
  }

  /** Whether `b` is out of reach of hits from (or to) this altitude: too high or too low. */
  outOfReach(b: Boid, alt: number) {
    return outOfHitHeight(b.alt, alt, reach(b)) !== 0;
  }

  /** `b` hits the player; a hit that lands freezes it along with them. */
  hitPlayer(b: Boid, damage: number) {
    if (!this.hooks.hit(damage, b.x, b.y)) return false;
    b.freeze = Math.max(b.freeze, hitStop(damage));
    return true;
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
    this.boids = this.boids.filter((b) => b.hp > 0 || b === this.queen);
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

  // -------------------------------------------------------------------------------------------
  // Flocks
  // -------------------------------------------------------------------------------------------

  /** Every so often a hunting flock flies in from a random point on the boundary, while the swarm is small enough. */
  private updateReinforcements(dt: number) {
    const r = this.rules.reinforce;
    if (!r || this.cleared || !r.flocks.length) return;
    this.reinforceIn -= dt;
    if (this.reinforceIn > 0) return;
    this.reinforceIn = r.every;
    if (this.boids.length - (this.queen ? 1 : 0) >= r.cap) return;
    const a = this.rand() * Math.PI * 2;
    const x = this.bounds.x + Math.cos(a) * this.bounds.r * 0.95;
    const y = this.bounds.y + Math.sin(a) * this.bounds.r * 0.95;
    this.spawnFlock(r.flocks[Math.floor(this.rand() * r.flocks.length)]!, x, y).hunting = true;
  }

  /** Flock-level decisions: drop the dead, track centres, engage together, and roam or guard while idle. */
  private updateFlocks(dt: number, player: PlayerView) {
    for (const f of this.flocks) f.members = f.members.filter((b) => b.hp > 0);
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
      // well away and the grudge has worn off.
      const near = (r: number) => f.members.some((b) => Math.hypot(b.x - player.x, b.y - player.y) < r);
      f.provoked = Math.max(0, f.provoked - dt);
      f.engaged =
        player.targetable &&
        (f.hunting || f.provoked > 0 || near(f.style.aggroRange) || (f.engaged && near(f.style.giveUpRange)));
      // Idle: escorts stay with the queen, the rest roam from goal to goal.
      const q = this.queen;
      if (f.escort && q && q.hp > 0) {
        f.goalX = q.x;
        f.goalY = q.y;
      } else if (Math.hypot(f.goalX - f.cx, f.goalY - f.cy) < 80) this.pickGoal(f);
    }

    this.recruitGuards();
  }

  /**
   * The queen is always guarded: while fewer guard her than she started with, the nearest flock
   * within her recruit range (idle ones first) is called in, whole, to guard her too.
   */
  private recruitGuards() {
    const q = this.queen;
    if (!q || q.hp <= 0 || !this.escortSize) return;
    const guards = this.flocks.reduce((n, f) => n + (f.escort ? f.members.length : 0), 0);
    if (guards >= this.escortSize) return;
    const toQueen = (f: Flock) => Math.hypot(f.cx - q.x, f.cy - q.y);
    const pick = this.flocks
      .filter((f) => !f.escort && !f.hunting && toQueen(f) < q.params.recruitRange)
      .sort((a, b) => Number(a.engaged) - Number(b.engaged) || toQueen(a) - toQueen(b))[0];
    if (pick) pick.escort = true;
  }

  /** The queen's guard is under attack: the flock nearest the player, besides hers, joins in. */
  private callReinforcements() {
    const p = this.player;
    let best: Flock | null = null;
    let bestD = Infinity;
    for (const f of this.flocks) {
      if (f.escort) continue;
      const d = Math.hypot(f.cx - p.x, f.cy - p.y);
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    if (best) best.provoked = best.style.grudge;
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
    const queenAlive = !!q && q.hp > 0;
    const playerToQueen = q ? Math.hypot(player.x - q.x, player.y - q.y) : Infinity;
    const queenThreatened = queenAlive && player.targetable && playerToQueen < q!.params.threatRadius;

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
      const flock = b.flock;
      // The queen's guard screens her from the player.
      const guarding = queenThreatened && flock.escort;
      const steer = { ax: 0, ay: 0, alt: CRUISE_ALT + Math.sin(b.phase * 1.3) * 10 };
      const c: BoidContext = {
        dt,
        player,
        px,
        py,
        dP,
        fighting: player.targetable && (flock.engaged || guarding),
        steer,
        combat: this,
        rand: this.rand,
        seek(tx, ty, speed, weight, arrive = true) {
          const dx = tx - b.x;
          const dy = ty - b.y;
          const d = Math.hypot(dx, dy) || 1;
          // Arrive: slow down near the target.
          const want = arrive ? Math.min(speed, d * 3) : speed;
          steer.ax += ((dx / d) * want - b.vx) * weight;
          steer.ay += ((dy / d) * want - b.vy) * weight;
        },
      };

      const type = b.type;
      if (type.update) {
        type.update(b, c);
        continue;
      }
      if (type.preempt?.(b, c)) continue;

      this.flocking(b, steer);

      if (guarding && q) {
        // Form a screen between the queen and the player, spread out by id.
        const qx = (player.x - q.x) / (playerToQueen || 1);
        const qy = (player.y - q.y) / (playerToQueen || 1);
        const spread = ((b.id % 7) - 3) * 0.35;
        const dist = q.r + 45 + (b.id % 4) * 22;
        const gx = q.x + (qx * Math.cos(spread) - qy * Math.sin(spread)) * dist;
        const gy = q.y + (qx * Math.sin(spread) + qy * Math.cos(spread)) * dist;
        c.seek(gx, gy, b.params.speed * 1.3, 2.5);
        steer.alt = player.alt + 6;
      } else if (c.fighting) {
        type.fight?.(b, c);
      } else {
        // Idle: wander a little while the flock roams toward its goal. Escorts circle the queen.
        const st = flock.style;
        const wa = Math.sin(b.phase * 0.7 + b.id) * Math.PI;
        steer.ax += Math.cos(wa) * st.restlessness * 115;
        steer.ay += Math.sin(wa) * st.restlessness * 115;
        const roam = Math.min(st.pace, b.params.speed);
        if (flock.escort && q && queenAlive) {
          const a = b.phase * 0.5 + b.id * 2.4;
          const d = q.r + 50 + (b.id % 3) * 20;
          c.seek(q.x + Math.cos(a) * d, q.y + Math.sin(a) * d, Math.max(roam, 120), 0.8);
        } else {
          c.seek(flock.goalX, flock.goalY, roam, 0.6, false);
        }
      }

      // Only so many members of a flock attack at once, so a flock comes at you in a readable rhythm.
      if (c.fighting && b.cooldown <= 0 && this.attacking(flock) < flock.style.attackers && type.attack?.(b, c)) continue;

      this.fly(b, steer.ax, steer.ay, b.params.speed * (guarding ? 1.3 : 1), 4, dt);
      const alt = Math.max(ISLAND_TOP - 15, Math.min(ISLAND_TOP + 170, steer.alt));
      b.alt += Math.max(-90 * dt, Math.min(90 * dt, alt - b.alt));
    }
  }

  /** How many of a flock's members are winding up or carrying out an attack. */
  private attacking(f: Flock) {
    let n = 0;
    for (const o of f.members) if (o.hp > 0 && (o.windup > 0 || o.lunge > 0)) n++;
    return n;
  }

  /** Bleed off a boid's speed (`rate` per s) and let it drift: winding up, recovering. */
  brake(b: Boid, rate: number, dt: number) {
    const k = Math.exp(-rate * dt);
    b.vx *= k;
    b.vy *= k;
    this.coast(b, dt);
  }

  /**
   * The boids rules within a flock, from its style: members keep their spacing, match the flock's
   * heading (coordination), are drawn to its centre (tightness), and past its spread are pulled
   * back harder the further out they are, so the flock never comes apart. Escorts also keep
   * clear of the queen's larger body.
   */
  private flocking(b: Boid, steer: { ax: number; ay: number }) {
    const f = b.flock;
    const st = f.style;
    let sx = 0;
    let sy = 0;
    const clear = (o: Boid, radius: number) => {
      const ox = b.x - o.x;
      const oy = b.y - o.y;
      const d = Math.hypot(ox, oy);
      if (d >= radius || d <= 0) return;
      const push = 1 - d / radius;
      sx += (ox / d) * push;
      sy += (oy / d) * push;
    };
    for (const o of f.members) if (o !== b) clear(o, st.spacing);
    if (f.escort && this.queen && this.queen.hp > 0) clear(this.queen, st.spacing + this.queen.r);
    steer.ax += sx * SEPARATION;
    steer.ay += sy * SEPARATION;

    const n = f.members.length;
    if (n < 2) return;
    // The flock's centre and heading without this member.
    const cx = (f.cx * n - b.x) / (n - 1);
    const cy = (f.cy * n - b.y) / (n - 1);
    const vx = (f.vx * n - b.vx) / (n - 1);
    const vy = (f.vy * n - b.vy) / (n - 1);
    const align = st.coordination * 1.2;
    steer.ax += (vx - b.vx) * align;
    steer.ay += (vy - b.vy) * align;
    const pull = lerp(0.03, 0.6, st.tightness);
    steer.ax += (cx - b.x) * pull;
    steer.ay += (cy - b.y) * pull;
    const d = Math.hypot(cx - b.x, cy - b.y);
    if (d > st.spread) {
      const leash = (d - st.spread) * lerp(2, 10, st.tightness);
      steer.ax += ((cx - b.x) / d) * leash;
      steer.ay += ((cy - b.y) / d) * leash;
    }
  }

  /**
   * Move a boid: steering plus the push back from the boundary and island rims, speed eased back
   * down to `cap` at `ease` (knockback, lunges and blasts decay smoothly rather than snapping),
   * then kept off islands and inside the boundary.
   */
  fly(b: Boid, ax: number, ay: number, cap: number, ease: number, dt: number) {
    const ob = this.outOfBounds(b);
    if (ob) {
      ax += ob.x * 300;
      ay += ob.y * 300;
    }
    const away = this.islandForce(b);
    b.vx += (ax + away.x) * dt;
    b.vy += (ay + away.y) * dt;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > cap) {
      const k = Math.max(cap / sp, Math.exp(-ease * dt));
      b.vx *= k;
      b.vy *= k;
    }
    this.coast(b, dt);
  }

  /** Move a boid along its velocity, kept off islands and inside the boundary. */
  coast(b: Boid, dt: number) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    this.keepOffIslands(b);
    this.keepInBounds(b);
  }

  /** Signed distance from an island's rim (negative inside) with the rim's outward normal there. */
  private rimDistance(isl: Island, b: Boid): { d: number; nx: number; ny: number; x: number; y: number } | null {
    // Cheap reject: far from the island's bounding circle.
    if (Math.hypot(b.x - isl.cx, b.y - isl.cy) > isl.radius * 1.35 + params.combat.islands.margin + b.r) return null;
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
      if (!r || r.d > params.combat.islands.margin) continue;
      const depth = params.combat.islands.margin - r.d;
      x += r.nx * depth * params.combat.islands.avoid;
      y += r.ny * depth * params.combat.islands.avoid;
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
