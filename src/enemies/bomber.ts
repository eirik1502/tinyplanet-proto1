import type { BaseParams, BoidType } from "./types";

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
  radius: 9,
  params: { hp: 1, speed: 215, size: 1, cost: 1.5, triggerRange: 22, blastRadius: 80, damage: 6, playerPush: 560, playerLift: 420, boidPush: 520 },
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
    if (!c.swarm.touchesPlayer(b, b.params.triggerRange)) return false;
    c.swarm.explode(b);
    return true;
  },

  fight(b, c) {
    // Dive straight at the player.
    c.seek(c.player.x, c.player.y, b.params.speed, 2.5, false);
    c.steer.alt = c.player.alt + 4;
  },
};
