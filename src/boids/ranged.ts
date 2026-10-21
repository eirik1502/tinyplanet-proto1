import { wings } from "./melee";
import { fmt, type BaseParams, type BoidType } from "./types";

// Ranged boid: keeps its distance on its side of the player, circling a little, and shoots orbs.

export interface RangedParams extends BaseParams {
  damage: number;
  keepAway: number;
  range: number;
  orbSpeed: number;
  orbLife: number;
  orbRadius: number;
  cooldown: number;
}

export const RANGED: BoidType<RangedParams> = {
  id: "ranged",
  name: "Ranged boid",
  color: "#6ff5dd",
  radius: 9,
  params: { hp: 2, speed: 160, size: 1, cost: 1.5, damage: 2, keepAway: 230, range: 420, orbSpeed: 280, orbLife: 2.2, orbRadius: 6, cooldown: 1.7 },
  inputs: {
    hp: ["Health", 1, 50, 1],
    speed: ["Speed", 20, 600, 5],
    size: ["Size", 0.5, 3, 0.1],
    cost: ["Budget cost", 0.1, 10, 0.1],
    damage: ["Damage (%)", 0, 50, 0.5],
    keepAway: ["Keep-away distance", 0, 800, 10],
    range: ["Shooting range", 50, 1500, 10],
    orbSpeed: ["Orb speed", 20, 1500, 10],
    orbLife: ["Orb life (s)", 0.2, 6, 0.1],
    orbRadius: ["Orb radius", 1, 40, 1],
    cooldown: ["Cooldown (s)", 0.1, 6, 0.05],
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
    c.combat.shoot(b, p.orbSpeed, p.orbLife, p.orbRadius, p.damage);
    b.cooldown = p.cooldown + c.rand() * 0.8;
    return false;
  },

  draw(ctx, b, k) {
    ctx.rotate(b.heading);
    wings(ctx, b, k, "rgba(170,255,240,0.45)");
    // Round body whose core brightens as the next shot charges.
    const ready = 1 - Math.max(0, Math.min(1, b.cooldown / b.params.cooldown));
    ctx.fillStyle = "#1f8f86";
    ctx.strokeStyle = "#0b3b38";
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.arc(0, 0, 7 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(210,255,130,${0.3 + 0.7 * ready})`;
    ctx.beginPath();
    ctx.arc(1.5 * k, 0, (2.5 + 1.5 * ready) * k, 0, Math.PI * 2);
    ctx.fill();
  },

  card: (p) => [
    { icon: "orb", name: "Orb shot", text: "Shoots from a distance.", stats: [`${fmt(p.damage)} dmg`, `${fmt(p.cooldown)}s recharge`] },
  ],
};
