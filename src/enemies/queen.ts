import { ISLAND_TOP } from "../world/island";
import type { BaseParams, BoidType } from "./types";

// The queen: roams the inner planet, flees when the player comes near, and when they get close
// anyway, gets angry and lets off a blast that throws them out. Her escort flock guards her, and
// flocks nearby are called in when her guard thins out. Her body is tall: attacks reach her (and
// she reaches the player) from any altitude.

export interface QueenParams extends BaseParams {
  fleeRange: number;
  threatRadius: number;
  recruitRange: number;
  triggerRange: number;
  windup: number;
  blastRadius: number;
  damage: number;
  playerPush: number;
  playerLift: number;
  cooldown: number;
}

export const QUEEN: BoidType<QueenParams> = {
  id: "queen",
  name: "Queen",
  radius: 26,
  params: {
    hp: 24,
    speed: 85,
    size: 1,
    cost: 0,
    fleeRange: 320,
    threatRadius: 410,
    recruitRange: 900,
    triggerRange: 110,
    windup: 0.8,
    blastRadius: 105,
    damage: 12,
    playerPush: 950,
    playerLift: 520,
    cooldown: 2.5,
  },
  inputs: {
    hp: ["Health", 1, 200, 1],
    speed: ["Speed", 0, 400, 5],
    size: ["Size", 0.5, 3, 0.1],
    cost: ["Budget cost", 0, 10, 0.1],
    fleeRange: ["Flee range", 0, 1000, 10],
    threatRadius: ["Guard screens her within", 0, 1500, 10],
    recruitRange: ["Calls flocks to guard from within", 0, 3000, 50],
    triggerRange: ["Blast trigger range", 10, 400, 5],
    windup: ["Anger before the blast (s)", 0.1, 3, 0.05],
    blastRadius: ["Blast radius", 20, 500, 5],
    damage: ["Blast damage (%)", 0, 50, 0.5],
    playerPush: ["Push on the player", 0, 1500, 10],
    playerLift: ["Lift on the player", 0, 1200, 10],
    cooldown: ["Blast cooldown (s)", 0, 10, 0.1],
  },

  reach: () => Infinity,
  knockback: 0.25,

  update(b, c) {
    const p = b.params;
    const { player, dt, swarm } = c;
    // When the player comes close she gets angry, and after the wind-up lets off a blast.
    if (b.windup > 0) {
      b.windup -= dt;
      if (b.windup <= 0) {
        b.windup = 0;
        b.cooldown = p.cooldown;
        swarm.queenBlast(b);
      }
    } else if (player.targetable && b.cooldown <= 0 && swarm.touchesPlayer(b, p.triggerRange)) {
      b.windup = p.windup;
      swarm.events.emit("anger", { source: b.id, x: b.x, y: b.y, alt: b.alt, dur: p.windup });
    }

    let ax = 0;
    let ay = 0;
    if (b.windup > 0) {
      // Holding still while she seethes.
      ax -= b.vx * 4;
      ay -= b.vy * 4;
    } else {
      let dx: number;
      let dy: number;
      let speed = p.speed;
      const bounds = swarm.bounds;
      if (player.targetable && c.dP < p.fleeRange) {
        // Flee from the player, but the nearer the boundary the more she turns back inward, so she
        // slips past them toward open space rather than being run into the edge.
        const ix = bounds.x - b.x;
        const iy = bounds.y - b.y;
        const id = Math.hypot(ix, iy) || 1;
        const edge = Math.max(0, Math.min(1, (id / bounds.r - 0.35) / 0.45));
        dx = -c.px / c.dP + (ix / id) * edge * 1.6;
        dy = -c.py / c.dP + (iy / id) * edge * 1.6;
        b.goal = null;
      } else {
        // Otherwise roam between spots in the inner part of the planet, slowly.
        if (!b.goal || Math.hypot(b.goal.x - b.x, b.goal.y - b.y) < 40) b.goal = roamGoal(c);
        dx = b.goal.x - b.x;
        dy = b.goal.y - b.y;
        speed = Math.min(p.speed * 0.55, Math.hypot(dx, dy));
      }
      const l = Math.hypot(dx, dy) || 1;
      ax += ((dx / l) * speed - b.vx) * 2;
      ay += ((dy / l) * speed - b.vy) * 2;
    }
    swarm.fly(b, ax, ay, p.speed, 3, dt);
    b.alt = ISLAND_TOP + 50 + Math.sin(b.phase * 1.1) * 8;
  },
};

/** Somewhere in the inner part of the planet, not over an island, and preferably away from the player. */
function roamGoal(c: Parameters<NonNullable<typeof QUEEN.update>>[1]) {
  const { bounds, islands } = c.swarm;
  let best = { x: bounds.x, y: bounds.y };
  let bestScore = -Infinity;
  for (let i = 0; i < 12; i++) {
    const a = c.rand() * Math.PI * 2;
    const d = Math.sqrt(c.rand()) * bounds.r * 0.55;
    const x = bounds.x + Math.cos(a) * d;
    const y = bounds.y + Math.sin(a) * d;
    if (islands.some((isl) => isl.contains(x, y))) continue;
    const score = c.player.targetable ? Math.hypot(x - c.player.x, y - c.player.y) : c.rand();
    if (score > bestScore) {
      best = { x, y };
      bestScore = score;
    }
  }
  return best;
}
