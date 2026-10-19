import type { Boid } from "./combat";
import { params } from "./tuning";

// Boid sprites, drawn at the origin of `ctx` with `k` screen px per world unit. Shared by the
// game view and the briefing's portraits.

/** What a sprite needs to know about its boid. */
export type BoidLook = Pick<Boid, "kind" | "id" | "heading" | "phase" | "lunge" | "cooldown" | "flash" | "r"> & {
  flock: { engaged: boolean };
  windup?: number;
};

export function drawBoidBody(ctx: CanvasRenderingContext2D, b: BoidLook, k: number) {
  const heading = b.heading;
  if (b.kind === "queen") {
    // Anger (0..1) builds over her blast's wind-up: she shakes, flaps harder and glows red.
    const windup = b.windup ?? 0;
    const anger = windup > 0 ? Math.max(0, Math.min(1, 1 - windup / params.enemyAttacks.queen.windup)) : 0;
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
    ctx.rotate(heading);
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
  } else {
    if (b.lunge > 0) {
      ctx.fillStyle = "rgba(255,70,90,0.35)";
      ctx.beginPath();
      ctx.arc(0, 0, 15 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(heading);
    const flap = Math.abs(Math.sin(b.phase * 26 + b.id));
    ctx.fillStyle =
      b.kind === "melee" ? "rgba(255,190,210,0.45)" : b.kind === "bomber" ? "rgba(255,215,160,0.45)" : "rgba(170,255,240,0.45)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(-2 * k, side * 7 * k, 7 * k, (1 + 4 * flap) * k, side * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (b.kind === "melee") {
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
    } else if (b.kind === "bomber") {
      // Bomber: a dark bulb with a fuse that sparks faster once its flock has found the player.
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
    } else {
      // Ranged: round body whose core brightens as the next shot charges.
      const ready = 1 - Math.max(0, Math.min(1, b.cooldown / params.enemyAttacks.ranged.cooldown));
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
    }
  }

  if (b.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(b.flash / 0.15) * 0.85})`;
    ctx.beginPath();
    ctx.arc(0, 0, b.r * 1.2 * k, 0, Math.PI * 2);
    ctx.fill();
  }
}
