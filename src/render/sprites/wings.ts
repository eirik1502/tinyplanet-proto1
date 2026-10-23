// The small boids' flapping wings, shared by their sprites.

/** The flapping wings, in the boid's rotated frame. */
export function wings(ctx: CanvasRenderingContext2D, b: { phase: number; id: number }, k: number, color: string) {
  const flap = Math.abs(Math.sin(b.phase * 26 + b.id));
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(-2 * k, side * 7 * k, 7 * k, (1 + 4 * flap) * k, side * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}
