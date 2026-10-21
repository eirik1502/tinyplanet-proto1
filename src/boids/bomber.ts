import { wings } from "./melee";
import { fmt, type BaseParams, type BoidType } from "./types";

// Bomber boid: dives at the player and blows up on contact (or when killed), throwing the player
// and other boids away.

export interface BomberParams extends BaseParams {
  triggerRange: number;
  blastRadius: number;
  damage: number;
  playerPush: number;
  playerLift: number;
  boidPush: number;
}

export const BOMBER: BoidType<BomberParams> = {
  id: "bomber",
  name: "Bomber boid",
  color: "#ffa040",
  radius: 9,
  params: { hp: 1, speed: 215, size: 1, cost: 1.5, triggerRange: 22, blastRadius: 150, damage: 6, playerPush: 560, playerLift: 420, boidPush: 520 },
  inputs: {
    hp: ["Health", 1, 50, 1],
    speed: ["Speed", 20, 600, 5],
    size: ["Size", 0.5, 3, 0.1],
    cost: ["Budget cost", 0.1, 10, 0.1],
    triggerRange: ["Trigger range", 5, 100, 1],
    blastRadius: ["Blast radius", 20, 500, 5],
    damage: ["Damage (%)", 0, 50, 0.5],
    playerPush: ["Push on the player", 0, 1500, 10],
    playerLift: ["Lift on the player", 0, 1200, 10],
    boidPush: ["Push on other boids", 0, 1500, 10],
  },

  preempt(b, c) {
    if (!c.combat.touchesPlayer(b, b.params.triggerRange)) return false;
    c.combat.explode(b);
    return true;
  },

  fight(b, c) {
    // Dive straight at the player.
    c.seek(c.player.x, c.player.y, b.params.speed, 2.5, false);
    c.steer.alt = c.player.alt + 4;
  },

  draw(ctx, b, k) {
    ctx.rotate(b.heading);
    wings(ctx, b, k, "rgba(255,215,160,0.45)");
    // A dark bulb with a fuse that sparks faster once its flock has found the player.
    const rate = b.flock.engaged ? 18 : 5;
    const blink = 0.5 + 0.5 * Math.sin(b.phase * rate);
    ctx.fillStyle = "#3a2a24";
    ctx.strokeStyle = "#ff9a3c";
    ctx.lineWidth = 1.4 * k;
    ctx.beginPath();
    ctx.arc(0, 0, 8 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(255,${150 + 90 * blink},60,${0.5 + 0.5 * blink})`;
    for (const [ox, r] of [[-3, 2.5 + 1.5 * blink], [3, 1.5 + blink]] as const) {
      ctx.beginPath();
      ctx.arc(ox * k, 0, r * k, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  card: (p) => [
    { icon: "blast", name: "Blast", text: "Explodes on contact, or when killed.", stats: [`${fmt(p.damage)} dmg`, "knockback"] },
  ],
};
