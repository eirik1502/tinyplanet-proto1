import type { BoidSprite } from "./index";
import type { QueenParams } from "../../enemies/queen";

export const QUEEN_SPRITE: BoidSprite<QueenParams> = {
  color: "#ff8cf0",

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
};
