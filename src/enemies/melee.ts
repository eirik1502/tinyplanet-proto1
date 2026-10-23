import type { BaseParams, BoidType } from "./types";

// Melee boid: chases the player and, when close, winds up (stops, rears back, aims) and lunges.
// The aim locks shortly before the lunge, so a late sidestep dodges it; a whiffed or landed lunge
// leaves it drifting a moment, and a hit during the windup interrupts it.

export interface MeleeParams extends BaseParams {
  damage: number;
  lungeRange: number;
  windup: number;
  lungeSpeed: number;
  lungeTime: number;
  recover: number;
  cooldown: number;
}

/** Share of the windup, at its end, during which the aim is locked. */
export const LOCK = 0.35;

export const MELEE: BoidType<MeleeParams> = {
  id: "melee",
  name: "Melee boid",
  radius: 8,
  params: { hp: 2, speed: 190, size: 1, cost: 1, damage: 2, lungeRange: 110, windup: 0.45, lungeSpeed: 520, lungeTime: 0.3, recover: 0.5, cooldown: 1.3 },
  inputs: {
    hp: ["Health", 1, 50, 1],
    speed: ["Speed", 20, 600, 5],
    size: ["Size", 0.5, 3, 0.1],
    cost: ["Budget cost", 0.1, 10, 0.1],
    damage: ["Damage (%)", 0, 50, 0.5],
    lungeRange: ["Lunge range", 10, 400, 5],
    windup: ["Windup (s)", 0, 2, 0.05],
    lungeSpeed: ["Lunge speed", 50, 1500, 10],
    lungeTime: ["Lunge time (s)", 0.05, 1.5, 0.01],
    recover: ["Recovery (s)", 0, 2, 0.05],
    cooldown: ["Cooldown (s)", 0, 5, 0.05],
  },

  preempt(b, c) {
    const p = b.params;
    if (b.windup > 0) {
      if (!c.player.targetable) {
        b.windup = 0;
        return false;
      }
      b.windup -= c.dt;
      if (b.windup > p.windup * LOCK) b.aim = Math.atan2(c.py, c.px);
      b.heading = b.aim;
      b.alt += (c.player.alt + 4 - b.alt) * Math.min(1, c.dt * 6);
      c.swarm.brake(b, 7, c.dt);
      if (b.windup <= 0) {
        b.lunge = p.lungeTime;
        b.vx = Math.cos(b.aim) * p.lungeSpeed;
        b.vy = Math.sin(b.aim) * p.lungeSpeed;
        c.swarm.events.emit("enemyLunge", { source: b.id, x: b.x, y: b.y, alt: b.alt });
      }
      return true;
    }
    if (b.lunge > 0) {
      // Fly the lunge out; it ends early on a hit, bouncing off.
      b.lunge -= c.dt;
      b.alt += (c.player.alt + 4 - b.alt) * Math.min(1, c.dt * 10);
      c.swarm.coast(b, c.dt);
      if (c.swarm.touchesPlayer(b) && c.swarm.hitPlayer(b, p.damage)) {
        b.lunge = 0;
        b.vx = (-c.px / c.dP) * 160;
        b.vy = (-c.py / c.dP) * 160;
      }
      if (b.lunge <= 0) b.recover = p.recover;
      return true;
    }
    if (b.recover > 0) {
      b.recover -= c.dt;
      c.swarm.brake(b, 3, c.dt);
      return true;
    }
    return false;
  },

  fight(b, c) {
    c.seek(c.player.x, c.player.y, b.params.speed, 1.6);
    c.steer.alt = c.player.alt + 6;
  },

  attack(b, c) {
    const p = b.params;
    if (c.dP >= p.lungeRange) return false;
    b.windup = Math.max(p.windup, 0.001);
    b.aim = Math.atan2(c.py, c.px);
    b.cooldown = p.windup + p.cooldown + c.rand() * 0.5;
    c.swarm.events.emit("windup", { source: b.id, x: b.x, y: b.y, alt: b.alt, kind: "melee", dur: p.windup });
    return true;
  },
};
