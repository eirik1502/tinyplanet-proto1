import { ISLAND_TOP, mulberry32, type Island } from "./island";

// Combat: the enemy swarm (boids), projectiles, sword slashes and hit particles.
// Everything lives on the same flat game plane as the player, with an altitude for depth.

export const COMBAT = {
  playerHp: 5,
  playerRadius: 10,
  invulnTime: 1.0, // seconds of invulnerability after being hit

  swordRange: 52,
  swordArc: 1.35, // half-angle (rad) of the swipe cone
  swordDamage: 2,
  swordTime: 0.18, // seconds the swipe can hit
  swordFade: 0.12, // extra seconds the swipe stays visible while fading out
  swordCooldown: 0.28,

  spearSpeed: 720,
  spearLife: 0.7,
  spearDamage: 1,
  spearCooldown: 0.45,

  meleeCount: 28,
  rangedCount: 14,
  aggroRange: 320, // boids notice the player within this distance
  disengageRange: 650, // ... and give up beyond this
  guardRadius: 480, // boids this close to the queen defend her
  threatRadius: 520, // the queen feels threatened when the player is this close

  meleeSpeed: 190,
  lungeRange: 95,
  lungeSpeed: 470,
  lungeTime: 0.32,
  lungeCooldown: 1.3,

  rangedSpeed: 160,
  rangedKeepAway: 230,
  orbSpeed: 280,
  orbLife: 2.2,
  orbCooldown: 1.7,
  orbRange: 420,

  queenHp: 24,
  queenSpeed: 85,
  queenTether: 230, // the queen stays within this distance of her home
};

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
}

export interface Slash {
  x: number;
  y: number;
  alt: number;
  dx: number;
  dy: number;
  age: number;
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

export class Combat {
  boids: Boid[] = [];
  shots: Shot[] = [];
  slashes: Slash[] = [];
  sparks: Spark[] = [];
  queen!: Boid;
  readonly bounds: { x: number; y: number; r: number };
  private nextId = 0;
  private rand = Math.random;

  constructor(private islands: Island[]) {
    const cx = islands.reduce((a, i) => a + i.cx, 0) / islands.length;
    const cy = islands.reduce((a, i) => a + i.cy, 0) / islands.length;
    const r = Math.max(...islands.map((i) => Math.hypot(i.cx - cx, i.cy - cy) + i.radius)) + 150;
    this.bounds = { x: cx, y: cy, r };
  }

  get queenDead() {
    return this.queen.hp <= 0;
  }

  /** New swarm at random positions, keeping clear of the player's start; the queen on the farthest island. */
  reset(seed: number, startX: number, startY: number) {
    this.rand = mulberry32(seed);
    this.boids = [];
    this.shots = [];
    this.slashes = [];
    this.sparks = [];

    const home = this.islands.reduce((a, b) =>
      Math.hypot(a.cx - startX, a.cy - startY) > Math.hypot(b.cx - startX, b.cy - startY) ? a : b,
    );
    this.queen = this.spawn("queen", home.cx, home.cy);

    const randomSpot = () => {
      for (;;) {
        const a = this.rand() * Math.PI * 2;
        const d = Math.sqrt(this.rand()) * this.bounds.r;
        const x = this.bounds.x + Math.cos(a) * d;
        const y = this.bounds.y + Math.sin(a) * d;
        if (Math.hypot(x - startX, y - startY) > 520) return { x, y };
      }
    };
    for (let i = 0; i < COMBAT.meleeCount; i++) {
      const s = randomSpot();
      this.spawn("melee", s.x, s.y);
    }
    for (let i = 0; i < COMBAT.rangedCount; i++) {
      const s = randomSpot();
      this.spawn("ranged", s.x, s.y);
    }
  }

  private spawn(kind: BoidKind, x: number, y: number): Boid {
    const hp = kind === "queen" ? COMBAT.queenHp : 2;
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

  swing(x: number, y: number, alt: number, dx: number, dy: number) {
    this.slashes.push({ x, y, alt, dx, dy, age: 0, hits: new Set() });
  }

  throwSpear(x: number, y: number, alt: number, dx: number, dy: number) {
    this.shots.push({
      x: x + dx * 10,
      y: y + dy * 10,
      alt,
      vx: dx * COMBAT.spearSpeed,
      vy: dy * COMBAT.spearSpeed,
      vz: 0,
      life: COMBAT.spearLife,
      fromPlayer: true,
    });
  }

  private damage(b: Boid, dmg: number, fromX: number, fromY: number) {
    if (b.hp <= 0) return;
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
      if (s.age > COMBAT.swordTime) continue;
      const cosArc = Math.cos(COMBAT.swordArc);
      for (const b of this.boids) {
        if (b.hp <= 0 || s.hits.has(b)) continue;
        const ox = b.x - s.x;
        const oy = b.y - s.y;
        const d = Math.hypot(ox, oy);
        if (d > COMBAT.swordRange + b.r || Math.abs(b.alt - s.alt) > 45 + b.r) continue;
        if (d > 18 && (ox * s.dx + oy * s.dy) / d < cosArc) continue;
        s.hits.add(b);
        this.damage(b, COMBAT.swordDamage, s.x, s.y);
      }
    }
    this.slashes = this.slashes.filter((s) => s.age < COMBAT.swordTime + COMBAT.swordFade);
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
          if (Math.hypot(b.x - s.x, b.y - s.y) < b.r + 6 && Math.abs(b.alt - s.alt) < b.r + 22) {
            this.damage(b, COMBAT.spearDamage, s.x - s.vx * 0.05, s.y - s.vy * 0.05);
            s.life = 0;
            break;
          }
        }
      } else if (player.targetable) {
        const d = Math.hypot(player.x - s.x, player.y - s.y, (player.alt - s.alt) * 0.7);
        if (d < COMBAT.playerRadius + 5) {
          hitPlayer(1, s.x - s.vx, s.y - s.vy);
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
    const queenThreatened = queenAlive && player.targetable && playerToQueen < COMBAT.threatRadius;

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
      b.engaged = player.targetable && (dP < COMBAT.aggroRange || (b.engaged && dP < COMBAT.disengageRange));
      const toQueen = Math.hypot(q.x - b.x, q.y - b.y);
      const guarding = queenThreatened && toQueen < COMBAT.guardRadius;

      // Lunging melee boids just fly the lunge out.
      if (b.lunge > 0) {
        b.lunge -= dt;
        b.alt += (player.alt + 4 - b.alt) * Math.min(1, dt * 10);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (player.targetable && Math.hypot(px, py, (player.alt - b.alt) * 0.7) < b.r + COMBAT.playerRadius) {
          hitPlayer(1, b.x, b.y);
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
        if (d < 28 && d > 0) {
          sx += ox / (d * d);
          sy += oy / (d * d);
        }
        if (d < 110) {
          avx += o.vx;
          avy += o.vy;
          cx += o.x;
          cy += o.y;
          n++;
        }
      }
      ax += sx * 9000;
      ay += sy * 9000;
      if (n > 0) {
        ax += (avx / n - b.vx) * 0.8;
        ay += (avy / n - b.vy) * 0.8;
        ax += (cx / n - b.x) * 0.6;
        ay += (cy / n - b.y) * 0.6;
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

      const maxSpeed = b.kind === "melee" ? COMBAT.meleeSpeed : COMBAT.rangedSpeed;
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
          const ring = COMBAT.rangedKeepAway;
          const tx = player.x - (px / dP) * ring + (-py / dP) * 60 * Math.sign(Math.sin(b.id));
          const ty = player.y - (py / dP) * ring + (px / dP) * 60 * Math.sign(Math.sin(b.id));
          seek(tx, ty, maxSpeed, 1.6);
        }
        targetAlt = player.alt + 6;
      } else {
        // Idle: wander, drifting loosely toward the queen so the swarm gathers around her.
        const wa = Math.sin(b.phase * 0.7 + b.id) * Math.PI;
        ax += Math.cos(wa) * 40;
        ay += Math.sin(wa) * 40;
        if (queenAlive && toQueen < 1000 && toQueen > 200) {
          ax += ((q.x - b.x) / toQueen) * 25;
          ay += ((q.y - b.y) / toQueen) * 25;
        }
      }

      // Attacks
      if (player.targetable && (b.engaged || guarding) && b.cooldown <= 0) {
        if (b.kind === "melee" && dP < COMBAT.lungeRange) {
          b.lunge = COMBAT.lungeTime;
          b.vx = (px / dP) * COMBAT.lungeSpeed;
          b.vy = (py / dP) * COMBAT.lungeSpeed;
          b.cooldown = COMBAT.lungeCooldown + this.rand() * 0.5;
          continue;
        }
        if (b.kind === "ranged" && dP < COMBAT.orbRange) {
          const dz = player.alt - b.alt;
          const d3 = Math.hypot(px, py, dz) || 1;
          this.shots.push({
            x: b.x,
            y: b.y,
            alt: b.alt,
            vx: (px / d3) * COMBAT.orbSpeed,
            vy: (py / d3) * COMBAT.orbSpeed,
            vz: (dz / d3) * COMBAT.orbSpeed,
            life: COMBAT.orbLife,
            fromPlayer: false,
          });
          b.cooldown = COMBAT.orbCooldown + this.rand() * 0.8;
        }
      }

      const ob = this.outOfBounds(b);
      if (ob) {
        ax += ob.x * 300;
        ay += ob.y * 300;
      }

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
      targetAlt = Math.max(ISLAND_TOP - 15, Math.min(ISLAND_TOP + 170, targetAlt));
      b.alt += Math.max(-90 * dt, Math.min(90 * dt, targetAlt - b.alt));
    }
  }

  private updateQueen(b: Boid, dt: number, player: PlayerView, dP: number) {
    let ax = 0;
    let ay = 0;
    if (player.targetable && dP < 320) {
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
    if (hd > COMBAT.queenTether * 0.6) {
      const pull = ((hd - COMBAT.queenTether * 0.6) / (COMBAT.queenTether * 0.4)) * 220;
      ax += (hx / hd) * pull;
      ay += (hy / hd) * pull;
    }
    b.vx += ax * dt;
    b.vy += ay * dt;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > COMBAT.queenSpeed) {
      const k = Math.max(COMBAT.queenSpeed / sp, Math.exp(-3 * dt));
      b.vx *= k;
      b.vy *= k;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.alt = ISLAND_TOP + 50 + Math.sin(b.phase * 1.1) * 8;
  }

  private outOfBounds(b: Boid): { x: number; y: number } | null {
    const dx = b.x - this.bounds.x;
    const dy = b.y - this.bounds.y;
    const d = Math.hypot(dx, dy);
    if (d < this.bounds.r) return null;
    return { x: -dx / d, y: -dy / d };
  }
}
