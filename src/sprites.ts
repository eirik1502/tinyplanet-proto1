import type { BaseParams, BoidLook, BoidType } from "./boids/types";

// Boid sprites, drawn at the origin of `ctx` with `k` screen px per world unit. Each type draws
// its own body at size 1; this scales it by the boid's size and adds the hit flash. Shared by the
// game view and the briefing's portraits.

export function drawBoidBody(ctx: CanvasRenderingContext2D, type: BoidType<BaseParams>, b: BoidLook, k: number) {
  const ks = k * b.params.size;
  ctx.save();
  type.draw(ctx, b, ks);
  ctx.restore();
  if (b.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(b.flash / 0.15) * 0.85})`;
    ctx.beginPath();
    ctx.arc(0, 0, type.radius * 1.2 * ks, 0, Math.PI * 2);
    ctx.fill();
  }
}
