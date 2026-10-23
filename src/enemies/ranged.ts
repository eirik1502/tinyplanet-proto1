import type { BaseParams, BoidType } from "./types";

// Ranged boid: keeps its distance on its side of the player, circling a little. To shoot it stops
// and charges (a hit interrupts it), fires an orb with a kick back, and holds a moment before
// moving on.

export interface RangedParams extends BaseParams {
  damage: number;
  keepAway: number;
  range: number;
  windup: number;
  orbSpeed: number;
  orbLife: number;
  orbRadius: number;
  recoil: number;
  recover: number;
  cooldown: number;
}

/** How long the muzzle flash and squash last after a shot (s). */
export const KICK = 0.14;

export const RANGED: BoidType<RangedParams> = {
  id: "ranged",
  name: "Ranged boid",
  radius: 9,
  params: {
    hp: 2,
    speed: 160,
    size: 1,
    cost: 1.5,
    damage: 2,
    keepAway: 230,
    range: 420,
    windup: 0.55,
    orbSpeed: 340,
    orbLife: 2,
    orbRadius: 6,
    recoil: 240,
    recover: 0.4,
    cooldown: 1.7,
  },
  inputs: {
    hp: ["Health", 1, 50, 1],
    speed: ["Speed", 20, 600, 5],
    size: ["Size", 0.5, 3, 0.1],
    cost: ["Budget cost", 0.1, 10, 0.1],
    damage: ["Damage (%)", 0, 50, 0.5],
    keepAway: ["Keep-away distance", 0, 800, 10],
    range: ["Shooting range", 50, 1500, 10],
    windup: ["Windup (s)", 0, 2, 0.05],
    orbSpeed: ["Orb speed", 20, 1500, 10],
    orbLife: ["Orb life (s)", 0.2, 6, 0.1],
    orbRadius: ["Orb radius", 1, 40, 1],
    recoil: ["Recoil", 0, 800, 10],
    recover: ["Hold after a shot (s)", 0, 2, 0.05],
    cooldown: ["Cooldown (s)", 0.1, 6, 0.05],
  },

  preempt(b, c) {
    const p = b.params;
    if (b.windup > 0) {
      if (!c.player.targetable) {
        b.windup = 0;
        return false;
      }
      b.windup -= c.dt;
      b.aim = Math.atan2(c.py, c.px);
      b.heading = b.aim;
      c.swarm.brake(b, 6, c.dt);
      if (b.windup <= 0) {
        c.swarm.shoot(b, p.orbSpeed, p.orbLife, p.orbRadius, p.damage);
        b.vx = -Math.cos(b.aim) * p.recoil;
        b.vy = -Math.sin(b.aim) * p.recoil;
        b.recover = Math.max(p.recover, KICK);
      }
      return true;
    }
    if (b.recover > 0) {
      // Rides the kick out, still facing where it shot.
      b.recover -= c.dt;
      b.heading = b.aim;
      c.swarm.brake(b, 5, c.dt);
      return true;
    }
    return false;
  },

  fight(b, c) {
    // Hold off at keep-away distance on the side it's on, drifting sideways.
    const ring = b.params.keepAway;
    const side = 60 * Math.sign(Math.sin(b.id));
    const tx = c.player.x - (c.px / c.dP) * ring + (-c.py / c.dP) * side;
    const ty = c.player.y - (c.py / c.dP) * ring + (c.px / c.dP) * side;
    c.seek(tx, ty, b.params.speed, 1.6);
    c.steer.alt = c.player.alt + 6;
  },

  attack(b, c) {
    const p = b.params;
    if (c.dP >= p.range) return false;
    b.windup = Math.max(p.windup, 0.001);
    b.aim = Math.atan2(c.py, c.px);
    b.cooldown = p.windup + p.cooldown + c.rand() * 0.8;
    c.swarm.events.emit("windup", { source: b.id, x: b.x, y: b.y, alt: b.alt, kind: "ranged", dur: p.windup });
    return true;
  },
};
