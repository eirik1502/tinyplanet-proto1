import { wings } from "./melee";
import { fmt, type BaseParams, type BoidType } from "./types";

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
const KICK = 0.14;

export const RANGED: BoidType<RangedParams> = {
  id: "ranged",
  name: "Ranged boid",
  color: "#6ff5dd",
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
      c.combat.brake(b, 6, c.dt);
      if (b.windup <= 0) {
        c.combat.shoot(b, p.orbSpeed, p.orbLife, p.orbRadius, p.damage);
        b.vx = -Math.cos(b.aim) * p.recoil;
        b.vy = -Math.sin(b.aim) * p.recoil;
        b.recover = Math.max(p.recover, KICK);
        c.combat.burst(b.x + Math.cos(b.aim) * b.r, b.y + Math.sin(b.aim) * b.r, b.alt, 8, "#e8ff9a");
      }
      return true;
    }
    if (b.recover > 0) {
      // Rides the kick out, still facing where it shot.
      b.recover -= c.dt;
      b.heading = b.aim;
      c.combat.brake(b, 5, c.dt);
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
    c.combat.event("windup", b.x, b.y, b.alt, { kind: "ranged", dur: p.windup });
    return true;
  },

  draw(ctx, b, k) {
    const p = b.params;
    const charge = b.windup > 0 ? 1 - b.windup / Math.max(p.windup, 0.001) : 0;
    const kick = b.recover > 0 ? Math.max(0, 1 - (Math.max(p.recover, KICK) - b.recover) / KICK) : 0;
    if (charge > 0) {
      // Light gathering in: a ring closing onto the body.
      ctx.strokeStyle = `rgba(210,255,130,${0.35 + 0.6 * charge})`;
      ctx.lineWidth = (1 + 2 * charge) * k;
      ctx.beginPath();
      ctx.arc(0, 0, (26 - 16 * charge) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.rotate(b.heading);
    if (charge > 0) {
      // A faint sight line toward the player.
      const grad = ctx.createLinearGradient(10 * k, 0, 120 * k, 0);
      grad.addColorStop(0, `rgba(210,255,130,${0.1 + 0.35 * charge})`);
      grad.addColorStop(1, "rgba(210,255,130,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(10 * k, -1.2 * k, 110 * k, 2.4 * k);
    }
    if (kick > 0) {
      // Muzzle flash.
      ctx.fillStyle = `rgba(240,255,190,${kick})`;
      ctx.beginPath();
      ctx.arc(10 * k, 0, (4 + 7 * kick) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    wings(ctx, b, k, "rgba(170,255,240,0.45)");
    // Squashed by the kick, swelling while charging.
    ctx.scale(1 - 0.25 * kick + 0.1 * charge, 1 + 0.15 * kick + 0.1 * charge);
    // Round body whose core brightens as the next shot charges, white-hot just before it fires.
    const ready = charge > 0 ? 1 : 1 - Math.max(0, Math.min(1, b.cooldown / p.cooldown));
    ctx.fillStyle = "#1f8f86";
    ctx.strokeStyle = "#0b3b38";
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.arc(0, 0, 7 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const hot = Math.round(130 + 125 * charge);
    ctx.fillStyle = `rgba(${210 + Math.round(45 * charge)},255,${hot},${0.3 + 0.7 * ready})`;
    ctx.beginPath();
    ctx.arc(1.5 * k, 0, (2.5 + 1.5 * ready + 1.5 * charge) * k, 0, Math.PI * 2);
    ctx.fill();
  },

  card: (p) => [
    { icon: "orb", name: "Orb shot", text: "Stops to charge, then fires. Hit it first to interrupt.", stats: [`${fmt(p.damage)} dmg`, `${fmt(p.cooldown)}s recharge`] },
  ],
};
