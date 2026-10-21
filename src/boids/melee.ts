import { fmt, type BaseParams, type BoidType } from "./types";

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
const LOCK = 0.35;

export const MELEE: BoidType<MeleeParams> = {
  id: "melee",
  name: "Melee boid",
  color: "#ff6b7d",
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
      c.combat.brake(b, 7, c.dt);
      if (b.windup <= 0) {
        b.lunge = p.lungeTime;
        b.vx = Math.cos(b.aim) * p.lungeSpeed;
        b.vy = Math.sin(b.aim) * p.lungeSpeed;
        c.combat.event("lunge", b.x, b.y, b.alt);
      }
      return true;
    }
    if (b.lunge > 0) {
      // Fly the lunge out; it ends early on a hit, bouncing off.
      b.lunge -= c.dt;
      b.alt += (c.player.alt + 4 - b.alt) * Math.min(1, c.dt * 10);
      c.combat.coast(b, c.dt);
      if (c.combat.touchesPlayer(b) && c.combat.hitPlayer(b, p.damage)) {
        b.lunge = 0;
        b.vx = (-c.px / c.dP) * 160;
        b.vy = (-c.py / c.dP) * 160;
      }
      if (b.lunge <= 0) b.recover = p.recover;
      return true;
    }
    if (b.recover > 0) {
      b.recover -= c.dt;
      c.combat.brake(b, 3, c.dt);
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
    c.combat.event("windup", b.x, b.y, b.alt, { kind: "melee", dur: p.windup });
    return true;
  },

  draw(ctx, b, k) {
    const p = b.params;
    if (b.windup > 0) {
      const t = 1 - b.windup / Math.max(p.windup, 0.001);
      const locked = t >= 1 - LOCK;
      // The lunge's path, solid once the aim has locked.
      ctx.save();
      ctx.rotate(b.heading);
      const len = ((p.lungeSpeed * p.lungeTime) / p.size) * k;
      const grad = ctx.createLinearGradient(10 * k, 0, len, 0);
      grad.addColorStop(0, `rgba(255,80,100,${locked ? 0.55 : 0.12 + 0.25 * t})`);
      grad.addColorStop(1, "rgba(255,80,100,0)");
      ctx.fillStyle = grad;
      const w = (locked ? 5 : 3) * k;
      ctx.fillRect(10 * k, -w, len - 10 * k, w * 2);
      ctx.restore();
      // A ring closing in on the body, gone into it as the lunge goes off.
      ctx.strokeStyle = `rgba(255,80,100,${0.5 + 0.5 * t})`;
      ctx.lineWidth = (1.5 + 1.5 * t) * k;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0.5, 24 * (1 - t)) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (b.lunge > 0) {
      ctx.fillStyle = "rgba(255,70,90,0.35)";
      ctx.beginPath();
      ctx.arc(0, 0, 15 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(b.heading);
    // Rears back while winding up.
    if (b.windup > 0) ctx.translate(-4 * (1 - b.windup / Math.max(p.windup, 0.001)) * k, 0);
    wings(ctx, b, k, "rgba(255,190,210,0.45)");
    ctx.fillStyle = b.windup > 0 ? "#ff5a76" : "#e23a5a";
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
    // The eye dims while it recovers.
    ctx.fillStyle = b.recover > 0 ? "#8a7a80" : "#ffe066";
    ctx.beginPath();
    ctx.arc(4 * k, 0, 1.6 * k, 0, Math.PI * 2);
    ctx.fill();
  },

  card: (p) => [
    { icon: "lunge", name: "Lunge", text: "Rears back, then dashes. Hit it first to interrupt.", stats: [`${fmt(p.damage)} dmg`, `${fmt(p.cooldown)}s recharge`] },
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
