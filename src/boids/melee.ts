import { fmt, type BaseParams, type BoidType } from "./types";

// Melee boid: chases the player and lunges in when close.

export interface MeleeParams extends BaseParams {
  damage: number;
  lungeRange: number;
  lungeSpeed: number;
  lungeTime: number;
  cooldown: number;
}

export const MELEE: BoidType<MeleeParams> = {
  id: "melee",
  name: "Melee boid",
  color: "#ff6b7d",
  radius: 8,
  params: { hp: 2, speed: 190, size: 1, cost: 1, damage: 2, lungeRange: 95, lungeSpeed: 470, lungeTime: 0.32, cooldown: 1.3 },
  inputs: {
    hp: ["Health", 1, 50, 1],
    speed: ["Speed", 20, 600, 5],
    size: ["Size", 0.5, 3, 0.1],
    cost: ["Budget cost", 0.1, 10, 0.1],
    damage: ["Damage (%)", 0, 50, 0.5],
    lungeRange: ["Lunge range", 10, 400, 5],
    lungeSpeed: ["Lunge speed", 50, 1500, 10],
    lungeTime: ["Lunge time (s)", 0.05, 1.5, 0.01],
    cooldown: ["Cooldown (s)", 0, 5, 0.05],
  },

  preempt(b, c) {
    // Lunging boids just fly the lunge out.
    if (b.lunge <= 0) return false;
    b.lunge -= c.dt;
    b.alt += (c.player.alt + 4 - b.alt) * Math.min(1, c.dt * 10);
    c.combat.coast(b, c.dt);
    if (c.combat.touchesPlayer(b) && c.combat.hitPlayer(b, b.params.damage)) {
      b.lunge = 0;
      b.vx = (-c.px / c.dP) * 160;
      b.vy = (-c.py / c.dP) * 160;
    }
    return true;
  },

  fight(b, c) {
    c.seek(c.player.x, c.player.y, b.params.speed, 1.6);
    c.steer.alt = c.player.alt + 6;
  },

  attack(b, c) {
    const p = b.params;
    if (c.dP >= p.lungeRange) return false;
    b.lunge = p.lungeTime;
    b.vx = (c.px / c.dP) * p.lungeSpeed;
    b.vy = (c.py / c.dP) * p.lungeSpeed;
    b.cooldown = p.cooldown + c.rand() * 0.5;
    c.combat.event("lunge", b.x, b.y, b.alt);
    return true;
  },

  draw(ctx, b, k) {
    if (b.lunge > 0) {
      ctx.fillStyle = "rgba(255,70,90,0.35)";
      ctx.beginPath();
      ctx.arc(0, 0, 15 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(b.heading);
    wings(ctx, b, k, "rgba(255,190,210,0.45)");
    ctx.fillStyle = "#e23a5a";
    ctx.strokeStyle = "#5a0f22";
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.moveTo(11 * k, 0);
    ctx.lineTo(-7 * k, -6 * k);
    ctx.lineTo(-3 * k, 0);
    ctx.lineTo(-7 * k, 6 * k);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffe066";
    ctx.beginPath();
    ctx.arc(4 * k, 0, 1.6 * k, 0, Math.PI * 2);
    ctx.fill();
  },

  card: (p) => [
    { icon: "lunge", name: "Lunge", text: "Dashes in up close.", stats: [`${fmt(p.damage)} dmg`, `${fmt(p.cooldown)}s recharge`] },
  ],
};

/** The small boids' flapping wings (in the rotated frame). */
export function wings(ctx: CanvasRenderingContext2D, b: { phase: number; id: number }, k: number, color: string) {
  const flap = Math.abs(Math.sin(b.phase * 26 + b.id));
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-2 * k, side * 7 * k, 7 * k, (1 + 4 * flap) * k, side * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}
