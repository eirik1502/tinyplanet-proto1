import { ISLAND_TOP, mulberry32, type Island } from "./island";
import type { Planet } from "./planet";
import { params } from "./tuning";

// Combat: the enemy swarm (boids), projectiles, sword slashes and hit particles.
// Everything lives on the same flat game plane as the player, with an altitude for depth.

export type BoidKind = "melee" | "ranged" | "queen";

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
  r: number;
  cooldown: number;
  lunge: number; // seconds of lunge left (melee)
  flash: number; // hit flash timer
  phase: number; // wander / wing-flap phase
  engaged: boolean;
  homeX: number;
  homeY: number;
}

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

export type HitPlayer = (damage: number, fromX: number, fromY: number) => void;

const CRUISE_ALT = ISLAND_TOP + 35;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Combat {
  boids: Boid[] = [];
  shots: Shot[] = [];
  slashes: Slash[] = [];
  sparks: Spark[] = [];
  queen!: Boid;
  bounds = { x: 0, y: 0, r: 1 };
  private islands: Island[] = [];
  private nextId = 0;
  private rand = Math.random;
  /** Player hits since the last `takePlayerHits()`, by weapon. */
  private playerHits: ("sword" | "spear")[] = [];

  get queenDead() {
    return this.queen.hp <= 0;
  }

  /** New swarm for a planet: boids at its spawn points, the queen at her home. */
  reset(planet: Planet) {
    this.islands = planet.islands;
    this.bounds = planet.bounds;
    this.rand = mulberry32(planet.seed ^ 0x5bd1e995);
    this.boids = [];
    this.shots = [];
    this.slashes = [];
    this.playerHits = [];
    this.sparks = [];
    this.queen = this.spawn("queen", planet.queenHome.x, planet.queenHome.y);
    for (const s of planet.spawns) this.spawn(s.kind, s.x, s.y);
  }

  private spawn(kind: BoidKind, x: number, y: number): Boid {
    const hp = kind === "queen" ? params.boids.queen.hp : 2;
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
      r: kind === "queen" ? 26 : kind === "ranged" ? 9 : 8,
      cooldown: this.rand() * 1.5,
      lunge: 0,
      flash: 0,
      phase: this.rand() * 100,
      engaged: false,
      homeX: x,
      homeY: y,
    };
    this.boids.push(b);
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

  /** The player's hits since the last call, by weapon (one entry per enemy hit). */
  takePlayerHits() {
    const hits = this.playerHits;
    this.playerHits = [];
    return hits;
  }

  private damage(b: Boid, dmg: number, fromX: number, fromY: number, weapon: "sword" | "spear") {
    if (b.hp <= 0) return;
    this.playerHits.push(weapon);
    b.hp -= dmg;
    b.flash = 0.15;
    const l = Math.hypot(b.x - fromX, b.y - fromY) || 1;
    const push = b.kind === "queen" ? 60 : 260;
    b.vx += ((b.x - fromX) / l) * push;
    b.vy += ((b.y - fromY) / l) * push;
    b.lunge = 0;
    this.burst(b.x, b.y, b.alt, b.hp <= 0 ? 18 : 6, b.kind === "queen" ? "#ff8cf0" : b.kind === "ranged" ? "#6ff5dd" : "#ff6b7d");
    if (b.hp <= 0 && b.kind === "queen") this.burst(b.x, b.y, b.alt, 60, "#ffe27a");
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

  update(dt: number, player: PlayerView, hitPlayer: HitPlayer) {
    this.updateBoids(dt, player, hitPlayer);
    this.updateSlashes(dt);
    this.updateShots(dt, player, hitPlayer);
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
    this.boids = this.boids.filter((b) => b.hp > 0 || b.kind === "queen");
  }

  private updateSlashes(dt: number) {
    for (const s of this.slashes) {
      s.age += dt;
      if (s.age > params.player.sword.activeTime) continue;
      const cosArc = Math.cos(params.player.sword.arc);
      for (const b of this.boids) {
        if (b.hp <= 0 || s.hits.has(b)) continue;
        const ox = b.x - s.x;
        const oy = b.y - s.y;
        const d = Math.hypot(ox, oy);
        if (d > s.range + b.r || Math.abs(b.alt - s.alt) > 45 + b.r) continue;
        if (d > 18 && (ox * s.dx + oy * s.dy) / d < cosArc) continue;
        s.hits.add(b);
        this.damage(b, s.damage, s.x, s.y, "sword");
      }
      // The blade also blocks enemy projectiles passing through the swipe.
      for (const sh of this.shots) {
        if (sh.fromPlayer || sh.life <= 0) continue;
        const ox = sh.x - s.x;
        const oy = sh.y - s.y;
        const d = Math.hypot(ox, oy);
        if (d > s.range + 8 || Math.abs(sh.alt - s.alt) > 50) continue;
        if (d > 18 && (ox * s.dx + oy * s.dy) / d < cosArc) continue;
        sh.life = 0;
        this.burst(sh.x, sh.y, sh.alt, 8, "#f4ffd0");
      }
    }
    this.slashes = this.slashes.filter((s) => s.age < params.player.sword.activeTime + params.player.sword.fadeTime);
  }

  private updateShots(dt: number, player: PlayerView, hitPlayer: HitPlayer) {
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.alt += s.vz * dt;
      s.life -= dt;
      if (s.fromPlayer) {
        for (const b of this.boids) {
          if (b.hp <= 0) continue;
          if (Math.hypot(b.x - s.x, b.y - s.y) < b.r + params.player.spear.hitRadius * s.scale && Math.abs(b.alt - s.alt) < b.r + 26) {
            this.damage(b, s.damage, s.x - s.vx * 0.05, s.y - s.vy * 0.05, "spear");
            s.life = 0;
            break;
          }
        }
      } else if (player.targetable) {
        const d = Math.hypot(player.x - s.x, player.y - s.y, (player.alt - s.alt) * 0.7);
        if (d < params.player.health.hitRadius + 5) {
          hitPlayer(s.damage, s.x - s.vx, s.y - s.vy);
          s.life = 0;
        }
      }
      // Islands block projectiles.
      if (s.life > 0 && this.islands.some((i) => i.intersects(s.x, s.y, s.alt, 2))) {
        this.burst(s.x, s.y, s.alt, 4, s.fromPlayer ? "#f4e3c0" : "#c9ff7a");
        s.life = 0;
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  private updateBoids(dt: number, player: PlayerView, hitPlayer: HitPlayer) {
    const q = this.queen;
    const queenAlive = q.hp > 0;
    const playerToQueen = Math.hypot(player.x - q.x, player.y - q.y);
    const queenThreatened = queenAlive && player.targetable && playerToQueen < params.boids.queen.threatRadius;

    for (const b of this.boids) {
      if (b.hp <= 0) continue;
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

      // Engage when close; stay engaged until the player gets well away.
      b.engaged = player.targetable && (dP < params.boids.swarm.aggroRange || (b.engaged && dP < params.boids.swarm.disengageRange));
      const toQueen = Math.hypot(q.x - b.x, q.y - b.y);
      const guarding = queenThreatened && toQueen < params.boids.queen.guardRadius;

      // Lunging melee boids just fly the lunge out.
      if (b.lunge > 0) {
        b.lunge -= dt;
        b.alt += (player.alt + 4 - b.alt) * Math.min(1, dt * 10);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        this.keepOffIslands(b);
        this.keepInBounds(b);
        if (player.targetable && Math.hypot(px, py, (player.alt - b.alt) * 0.7) < b.r + params.player.health.hitRadius) {
          hitPlayer(params.enemyAttacks.hit.damage, b.x, b.y);
          b.lunge = 0;
          b.vx = (-px / dP) * 160;
          b.vy = (-py / dP) * 160;
        }
        continue;
      }

      let ax = 0;
      let ay = 0;

      // Classic boids: separation, alignment, cohesion among the non-queen swarm.
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (const o of this.boids) {
        if (o === b || o.hp <= 0 || o.kind === "queen") continue;
        const ox = b.x - o.x;
        const oy = b.y - o.y;
        const d = Math.hypot(ox, oy);
        if (d < params.boids.flocking.separationRadius && d > 0) {
          const push = 1 - d / params.boids.flocking.separationRadius;
          sx += (ox / d) * push;
          sy += (oy / d) * push;
        }
        if (d < params.boids.flocking.neighborRadius) {
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

      const seek = (tx: number, ty: number, speed: number, weight: number) => {
        const dx = tx - b.x;
        const dy = ty - b.y;
        const d = Math.hypot(dx, dy) || 1;
        // Arrive: slow down near the target.
        const want = Math.min(speed, d * 3);
        ax += ((dx / d) * want - b.vx) * weight;
        ay += ((dy / d) * want - b.vy) * weight;
      };

      const maxSpeed = b.kind === "melee" ? params.boids.swarm.meleeSpeed : params.boids.swarm.rangedSpeed;
      let targetAlt = CRUISE_ALT + Math.sin(b.phase * 1.3) * 10;

      if (guarding) {
        // Form a screen between the queen and the player, spread out by id.
        const qx = (player.x - q.x) / (playerToQueen || 1);
        const qy = (player.y - q.y) / (playerToQueen || 1);
        const spread = ((b.id % 7) - 3) * 0.35;
        const dist = q.r + 45 + (b.id % 4) * 22;
        const gx = q.x + (qx * Math.cos(spread) - qy * Math.sin(spread)) * dist;
        const gy = q.y + (qx * Math.sin(spread) + qy * Math.cos(spread)) * dist;
        seek(gx, gy, maxSpeed * 1.3, 2.5);
        targetAlt = player.alt + 6;
      } else if (b.engaged) {
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
        // Idle: wander, drifting loosely toward the queen so the swarm gathers around her.
        const wa = Math.sin(b.phase * 0.7 + b.id) * Math.PI;
        ax += Math.cos(wa) * params.boids.flocking.wander;
        ay += Math.sin(wa) * params.boids.flocking.wander;
        if (queenAlive && toQueen < 1000 && toQueen > 200) {
          ax += ((q.x - b.x) / toQueen) * params.boids.flocking.queenAttraction;
          ay += ((q.y - b.y) / toQueen) * params.boids.flocking.queenAttraction;
        }
      }

      // Attacks
      if (player.targetable && (b.engaged || guarding) && b.cooldown <= 0) {
        if (b.kind === "melee" && dP < params.enemyAttacks.melee.lungeRange) {
          b.lunge = params.enemyAttacks.melee.lungeTime;
          b.vx = (px / dP) * params.enemyAttacks.melee.lungeSpeed;
          b.vy = (py / dP) * params.enemyAttacks.melee.lungeSpeed;
          b.cooldown = params.enemyAttacks.melee.cooldown + this.rand() * 0.5;
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
        // Ease back down (knockback and lunges decay smoothly rather than snapping).
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
    let ax = 0;
    let ay = 0;
    if (player.targetable && dP < params.boids.queen.fleeRange) {
      // Flee from the player...
      ax += ((b.x - player.x) / dP) * 160;
      ay += ((b.y - player.y) / dP) * 160;
    } else {
      const wa = b.phase * 0.4;
      ax += Math.cos(wa) * 50;
      ay += Math.sin(wa * 1.3) * 50;
    }
    // ...but stay near home so she remains reachable.
    const hx = b.homeX - b.x;
    const hy = b.homeY - b.y;
    const hd = Math.hypot(hx, hy);
    if (hd > params.boids.queen.tether * 0.6) {
      const pull = ((hd - params.boids.queen.tether * 0.6) / (params.boids.queen.tether * 0.4)) * 220;
      ax += (hx / hd) * pull;
      ay += (hy / hd) * pull;
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
