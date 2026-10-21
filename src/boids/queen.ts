import { ISLAND_TOP } from "../island";
import { fmt, type BaseParams, type BoidType } from "./types";

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
  color: "#ff8cf0",
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
    blastRadius: 150,
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

  update(b, c) {
    const p = b.params;
    const { player, dt, combat } = c;
    // When the player comes close she gets angry, and after the wind-up lets off a blast.
    if (b.windup > 0) {
      b.windup -= dt;
      if (b.windup <= 0) {
        b.windup = 0;
        b.cooldown = p.cooldown;
        combat.queenBlast(b);
      }
    } else if (player.targetable && b.cooldown <= 0 && combat.touchesPlayer(b, p.triggerRange)) {
      b.windup = p.windup;
      combat.event("anger", b.x, b.y, b.alt);
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
      const bounds = combat.bounds;
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
    combat.fly(b, ax, ay, p.speed, 3, dt);
    b.alt = ISLAND_TOP + 50 + Math.sin(b.phase * 1.1) * 8;
  },

  draw(ctx, b, k) {
    // Anger (0..1) builds over her blast's wind-up: she shakes, flaps harder and glows red.
    const windup = b.windup;
    const anger = windup > 0 ? Math.max(0, Math.min(1, 1 - windup / b.params.windup)) : 0;
    const angry = windup > 0 ? 0.4 + 0.6 * anger : 0;
    if (angry) ctx.translate(Math.sin(b.phase * 90) * 2.5 * angry * k, Math.cos(b.phase * 77) * 2.5 * angry * k);
    const pulse = 0.5 + 0.5 * Math.sin(b.phase * (3 + 20 * angry));
    const rgb = `${230 + 25 * angry},${120 - 70 * angry},${255 - 165 * angry}`;
    const ar = (55 + 25 * angry) * k;
    const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, ar);
    aura.addColorStop(0, `rgba(${rgb},${0.35 + 0.15 * pulse + 0.3 * angry})`);
    aura.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, ar, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(b.heading);
    const flap = Math.abs(Math.sin(b.phase * (7 + 14 * angry)));
    ctx.fillStyle = "rgba(240,200,255,0.4)";
    for (const side of [-1, 1]) {
      for (const [ox, w] of [[-2, 1], [-14, 0.75]] as const) {
        ctx.beginPath();
        ctx.ellipse(ox * k, side * 20 * k, 20 * w * k, (4 + 10 * flap) * w * k, side * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Abdomen with stripes, thorax, head
    ctx.fillStyle = "#6d1f9e";
    ctx.beginPath();
    ctx.ellipse(-16 * k, 0, 16 * k, 11 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e3a6ff";
    ctx.lineWidth = 1.6 * k;
    for (const sx of [-22, -15, -8]) {
      ctx.beginPath();
      ctx.moveTo(sx * k, -9 * k);
      ctx.quadraticCurveTo((sx + 3) * k, 0, sx * k, 9 * k);
      ctx.stroke();
    }
    ctx.fillStyle = "#9b2fd6";
    ctx.beginPath();
    ctx.ellipse(2 * k, 0, 11 * k, 10 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d58cff";
    ctx.beginPath();
    ctx.arc(14 * k, 0, 7 * k, 0, Math.PI * 2);
    ctx.fill();
    // Crown: gold spikes around the head
    ctx.fillStyle = "#ffd34d";
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.6 + (i / 4) * Math.PI * 1.2;
      ctx.beginPath();
      ctx.moveTo((14 + Math.cos(a - 0.25) * 6) * k, Math.sin(a - 0.25) * 6 * k);
      ctx.lineTo((14 + Math.cos(a) * 12) * k, Math.sin(a) * 12 * k);
      ctx.lineTo((14 + Math.cos(a + 0.25) * 6) * k, Math.sin(a + 0.25) * 6 * k);
      ctx.fill();
    }
    ctx.fillStyle = angry ? "#ff2a3a" : "#1a0526";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(17 * k, side * 3 * k, (1.6 + 0.8 * angry) * k, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  card: (p) => [
    { icon: "crown", name: "Escorted", text: "Flees. Guarded by her flock.", stats: [] },
    { icon: "blast", name: "Blast", text: "Lets off a blast when you get close.", stats: [`${fmt(p.damage)} dmg`, "knockback"] },
  ],
};

/** Somewhere in the inner part of the planet, not over an island, and preferably away from the player. */
function roamGoal(c: Parameters<NonNullable<typeof QUEEN.update>>[1]) {
  const { bounds, islands } = c.combat;
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
