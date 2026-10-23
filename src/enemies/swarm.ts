import { lerp } from "../core/math";
import { mulberry32, type Rng } from "../core/rng";
import { Hurtable, type HitInfo } from "../combat/components";
import { box, type Hitbox } from "../combat/hitbox";
import type { World } from "../game/world";
import { ISLAND_TOP, type Island } from "../world/island";
import { Boid } from "./boid";
import type { BomberParams } from "./bomber";
import { DEFAULT_STYLE, type FlockSpec, type FlockStyle } from "./flocks";
import { boidType, BOID_TYPES, type BoidTypeId } from "./index";
import type { QueenParams } from "./queen";
import { resolveParams, type BaseParams, type BoidApi, type BoidContext, type BoidType, type PlayerView } from "./types";

// The enemy swarm: boids in flocks, and the queen. What each kind of boid does lives in its type;
// this is the shared machinery: spawning, flocking, engaging, guarding the queen, reinforcements,
// and what happens when a boid is hit. Boids are game objects with Health and a Hurtable, so the
// combat rules hit them like anything else.

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

const CRUISE_ALT = ISLAND_TOP + 35;

/** How long a boid staggers after its windup is interrupted by a hit (s). */
const STAGGER = 0.7;

/** A blast's push at distance `d` from its centre: full at the centre, half at its edge. */
const blastFalloff = (d: number, radius: number) => 0.5 + 0.5 * (1 - Math.min(1, d / radius));

/** How hard members push apart inside their flock's spacing. */
const SEPARATION = 720;

const reach = (b: Boid) => b.type.reach?.(b) ?? 0;

export class Swarm implements BoidApi {
  boids: Boid[] = [];
  flocks: Flock[] = [];
  /** null on planets without a queen: the swarm is just its flocks. */
  queen: Boid<QueenParams> | null = null;
  /** Members her escort started with: while fewer guard her, nearby flocks are called in to. */
  private escortSize = 0;
  readonly bounds: { x: number; y: number; r: number };
  readonly islands: readonly Island[];
  private rand: Rng;
  /** Swarm members (escort and queen excluded) the player must still kill to break the queen's shield. */
  shieldLeft = 0;
  /** Seconds until the next reinforcement flock. */
  private reinforceIn = 0;

  constructor(
    private w: World,
    private rules: SwarmRules = NO_RULES,
  ) {
    const planet = w.planet;
    this.islands = planet.islands;
    this.bounds = planet.bounds;
    this.rand = mulberry32(planet.seed ^ 0x5bd1e995);
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

  get events() {
    return this.w.events;
  }

  /** The planet is won: the queen is dead, or with no queen, the whole swarm. */
  get cleared() {
    return this.queen ? this.queen.hp <= 0 : this.boids.length === 0;
  }

  get queenShielded() {
    return this.shieldLeft > 0;
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
    const b = this.w.objects.add(new Boid(type, { ...p }, flock));
    b.x = x;
    b.y = y;
    b.alt = type.update ? ISLAND_TOP + 55 : CRUISE_ALT;
    b.vx = Math.cos(a) * 60;
    b.vy = Math.sin(a) * 60;
    b.cooldown = this.rand() * 1.5;
    b.phase = this.rand() * 100;
    b.add(Hurtable, {
      team: "swarm",
      hurtbox: () => ({ ...box(b.x, b.y, b.alt, b.r), height: reach(b) }),
      targetable: () => b.hp > 0,
      hit: (h) => this.damage(b, h),
      push: (vx, vy) => {
        const k = b.type.knockback ?? 1;
        b.vx += vx * k;
        b.vy += vy * k;
      },
    });
    this.boids.push(b);
    flock.members.push(b);
    return b;
  }

  private damage(b: Boid, h: HitInfo): boolean {
    const dmg = h.damage;
    if (b.hp <= 0 || dmg <= 0) return false;
    const isQueen = b === this.queen;
    if (isQueen && this.queenShielded) {
      // The shield turns the hit; it still angers her guard.
      this.events.emit("block", { x: b.x, y: b.y, alt: b.alt, what: "shield" });
      this.provokeEscort();
      return false;
    }
    b.freeze = Math.max(b.freeze, this.w.combat.hitStop(dmg));
    b.hp -= dmg;
    b.flash = 0.15;
    this.events.emit("hit", {
      source: h.source,
      target: b.id,
      x: b.x,
      y: b.y,
      alt: b.alt,
      kind: b.type.id,
      damage: dmg,
      killed: b.hp <= 0,
      weapon: h.weapon,
      attack: h.attack,
      step: h.step,
    });
    const l = Math.hypot(b.x - h.fromX, b.y - h.fromY) || 1;
    const push = isQueen ? 60 : 260;
    b.vx += ((b.x - h.fromX) / l) * push;
    b.vy += ((b.y - h.fromY) / l) * push;
    b.lunge = 0;
    // A hit while winding up interrupts the attack and staggers the boid: a window to punish.
    if (!isQueen && b.windup > 0 && b.hp > 0) {
      b.windup = 0;
      b.recover = Math.max(b.recover, STAGGER);
      this.events.emit("interrupt", { target: b.id, x: b.x, y: b.y, alt: b.alt });
    }
    // Hitting any member sets the whole flock on the player; hitting the queen or her guard also
    // calls in the flock nearest the player after it.
    if (isQueen) this.provokeEscort();
    else b.flock.provoked = b.flock.style.grudge;
    if (isQueen || b.flock.escort) this.callReinforcements();
    // Each kill wears the queen's shield down.
    if (b.hp <= 0 && !isQueen) this.shieldLeft = Math.max(0, this.shieldLeft - 1);
    // Killing a bomber sets it off where it is.
    if (b.hp <= 0 && b.type.id === "bomber") this.explode(b);
    return true;
  }

  private provokeEscort() {
    for (const f of this.flocks) if (f.escort) f.provoked = f.style.grudge;
  }

  // -------------------------------------------------------------------------------------------
  // Attacks on the player (for the boid types)
  // -------------------------------------------------------------------------------------------

  private playerView(): PlayerView {
    const p = this.w.player;
    return { x: p.x, y: p.y, alt: p.alt, targetable: !!p.get(Hurtable)?.targetable() };
  }

  /**
   * A bomber blows up: everything within the blast radius is shoved away from it (more the closer
   * it is), and the player is hurt and thrown, off their rim if they hang on one.
   */
  explode(b: Boid) {
    const bp = b.params as unknown as BomberParams;
    const R = bp.blastRadius;
    b.hp = 0;
    this.events.emit("explode", { source: b.id, x: b.x, y: b.y, alt: b.alt, radius: R });
    const blast = box(b.x, b.y, b.alt, R);
    for (const o of this.boids) {
      if (o === b || o.hp <= 0) continue;
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const d = Math.hypot(dx, dy);
      if (!this.w.combat.overlaps(blast, o.require(Hurtable).hurtbox())) continue;
      const push = bp.boidPush * blastFalloff(d, R) * (o.type.knockback ?? 1);
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
    const qa = q.params as unknown as QueenParams;
    this.events.emit("queenBlast", { source: q.id, x: q.x, y: q.y, alt: q.alt, radius: qa.blastRadius });
    this.blastPlayer(box(q.x, q.y, q.alt, qa.blastRadius), qa.damage, qa.playerPush, qa.playerLift, true);
  }

  /** An orb from `b` straight at the player. */
  shoot(b: Boid, speed: number, life: number, radius: number, damage: number) {
    const p = this.w.player;
    const px = p.x - b.x;
    const py = p.y - b.y;
    const dz = p.alt - b.alt;
    const d3 = Math.hypot(px, py, dz) || 1;
    const d2 = Math.hypot(px, py) || 1;
    this.w.combat.spawnVolume(
      {
        team: "swarm",
        owner: b.id,
        attack: "orb",
        shape: { radius },
        damage,
        power: 0,
        active: Infinity,
        age: 0,
        projectile: { life, scale: 1 },
        hits: new Set(),
      },
      { x: b.x, y: b.y, alt: b.alt, vx: (px / d3) * speed, vy: (py / d3) * speed, vz: (dz / d3) * speed },
    );
    this.events.emit("shot", { source: b.id, x: b.x, y: b.y, alt: b.alt, dx: px / d2, dy: py / d2, r: b.r });
  }

  touchesPlayer(b: Boid, range = b.r) {
    return this.w.combat.touching({ ...box(b.x, b.y, b.alt, range), height: reach(b) }, "swarm").length > 0;
  }

  hitPlayer(b: Boid, damage: number) {
    if (!this.w.player.require(Hurtable).hit({ damage, fromX: b.x, fromY: b.y, source: b.id })) return false;
    b.freeze = Math.max(b.freeze, this.w.combat.hitStop(damage));
    return true;
  }

  /** Whether `b` is out of reach of hits from (or to) this altitude: too high or too low. */
  outOfReach(b: Boid, alt: number) {
    return Math.abs(b.alt - alt) > this.w.combat.hitHeight + reach(b);
  }

  /**
   * A blast catching the player: hurt, and thrown away from its centre (harder the closer). A
   * `heavy` blast reaches them however far above or below it they are, throws at full force
   * throughout, and can't be flown through.
   */
  private blastPlayer(blast: Hitbox, damage: number, push: number, lift: number, heavy = false) {
    this.w.combat.blast(
      blast,
      "swarm",
      (o, h) => {
        h.hit({ damage, fromX: blast.x, fromY: blast.y });
        const dx = o.x - blast.x;
        const dy = o.y - blast.y;
        const l = Math.hypot(dx, dy) || 1;
        const k = heavy ? 1 : blastFalloff(Math.hypot(dx, dy, o.alt - blast.alt), blast.radius);
        h.push((dx / l) * push * k, (dy / l) * push * k, lift * k, heavy);
      },
      heavy,
    );
  }

  // -------------------------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------------------------

  /** `dt` is world time; `dtReal` is wall-clock time, which hit-stop runs on. */
  update(dt: number, dtReal: number) {
    const player = this.playerView();
    this.updateReinforcements(dt);
    this.updateFlocks(dt, player);
    this.updateBoids(dt, dtReal, player);
  }

  /** Remove the dead (the queen stays, for the record). */
  cull() {
    for (const b of this.boids) if (b.hp <= 0 && b !== this.queen) this.w.objects.destroy(b);
    this.boids = this.boids.filter((b) => b.hp > 0 || b === this.queen);
  }

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
    const p = this.w.player;
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
        swarm: this,
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

  coast(b: Boid, dt: number) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    this.keepOffIslands(b);
    this.keepInBounds(b);
  }

  /** Signed distance from an island's rim (negative inside) with the rim's outward normal there. */
  private rimDistance(isl: Island, b: Boid): { d: number; nx: number; ny: number; x: number; y: number } | null {
    // Cheap reject: far from the island's bounding circle.
    if (Math.hypot(b.x - isl.cx, b.y - isl.cy) > isl.radius * 1.35 + this.w.params.combat.islands.margin + b.r) return null;
    const c = isl.closest(b.x, b.y);
    const e = isl.pointAt(c.s);
    return { d: isl.contains(b.x, b.y) ? -c.d : c.d, nx: e.nx, ny: e.ny, x: e.x, y: e.y };
  }

  /** Soft push away from island rims, growing as a boid gets within islandMargin. */
  private islandForce(b: Boid): { x: number; y: number } {
    const ci = this.w.params.combat.islands;
    let x = 0;
    let y = 0;
    for (const isl of this.islands) {
      const r = this.rimDistance(isl, b);
      if (!r || r.d > ci.margin) continue;
      const depth = ci.margin - r.d;
      x += r.nx * depth * ci.avoid;
      y += r.ny * depth * ci.avoid;
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

export type { BoidTypeId };
