import type { Vec } from "../core/math";
import type { Projected, Projector } from "./projection";

// Drawing helpers shared by the render layers: the canvas, the projection, and shapes and
// sprites that lie flat on the planet's surface or follow its curve.

export class Painter {
  W = 0;
  H = 0;
  dpr = 1;
  readonly ctx: CanvasRenderingContext2D;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly proj: Projector,
  ) {
    this.ctx = canvas.getContext("2d")!;
  }

  /** Match the canvas to the window. */
  resize(w: number, h: number, dpr: number) {
    this.dpr = Math.min(dpr || 1, 2);
    this.W = w;
    this.H = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  /** Draws a sprite lying flat on the planet surface: squashed radially as the surface tilts away. */
  drawFlat(img: CanvasImageSource, pr: Projected, worldRadius: number, alpha: number) {
    if (!pr.visible || alpha <= 0.002) return;
    const sx = worldRadius * pr.kr;
    const sy = worldRadius * pr.kt;
    if (sx < 0.05 && sy < 0.05) return;
    const { ctx, dpr } = this;
    const c = Math.cos(pr.angle);
    const s = Math.sin(pr.angle);
    ctx.globalAlpha = alpha;
    ctx.setTransform(dpr * c * sx, dpr * s * sx, -dpr * s * sy, dpr * c * sy, dpr * pr.x, dpr * pr.y);
    ctx.drawImage(img, -1, -1, 2, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  /** Ellipse lying flat on the surface (for tree canopies etc). */
  flatEllipsePath(pr: Projected, worldRadius: number) {
    this.ctx.beginPath();
    this.ctx.ellipse(pr.x, pr.y, Math.max(0.1, worldRadius * pr.kr), Math.max(0.1, worldRadius * pr.kt), pr.angle, 0, Math.PI * 2);
  }

  /** A closed path through world points at one altitude; whether any of it is visible. */
  polyPath(pts: Vec[], alt: number): boolean {
    const ctx = this.ctx;
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < pts.length; i++) {
      const pr = this.proj.project(pts[i]!.x, pts[i]!.y, alt);
      any ||= pr.visible;
      if (i === 0) ctx.moveTo(pr.x, pr.y);
      else ctx.lineTo(pr.x, pr.y);
    }
    ctx.closePath();
    return any;
  }

  /** Path of a rectangle reaching `len` out from (x, y) along (dx, dy), `hw` either side; with `tip`, a pointed end. */
  rectPath(x: number, y: number, alt: number, dx: number, dy: number, len: number, hw: number, tip = 0) {
    const at = (u: number, v: number) => this.proj.project(x + dx * u - dy * v, y + dy * u + dx * v, alt);
    const pts = tip ? [at(0, -hw * 0.3), at(len - tip, -hw), at(len, 0), at(len - tip, hw), at(0, hw * 0.3)] : [at(0, -hw), at(len, -hw), at(len, hw), at(0, hw)];
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
  }

  /** Path of a circle of radius `r` around (x, y) on the surface at `alt`. */
  circlePath(x: number, y: number, alt: number, r: number, n = 32) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const q = this.proj.project(x + Math.cos(a) * r, y + Math.sin(a) * r, alt);
      if (i) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    }
  }
}

/** A soft radial blob, for glows, haze and shadows. */
function makeBlob(size: number, stops: [number, string][]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export const BLOBS = {
  haze: [
    makeBlob(128, [[0, "rgba(190,220,255,0.9)"], [0.45, "rgba(170,160,255,0.35)"], [1, "rgba(150,120,255,0)"]]),
    makeBlob(128, [[0, "rgba(220,190,255,0.9)"], [0.5, "rgba(200,150,240,0.3)"], [1, "rgba(180,120,230,0)"]]),
    makeBlob(128, [[0, "rgba(170,255,240,0.8)"], [0.5, "rgba(140,220,230,0.25)"], [1, "rgba(120,200,230,0)"]]),
  ],
  glow: makeBlob(64, [[0, "rgba(255,255,230,1)"], [0.25, "rgba(220,240,255,0.6)"], [1, "rgba(180,200,255,0)"]]),
  dust: makeBlob(32, [[0, "rgba(230,205,170,0.9)"], [1, "rgba(200,170,140,0)"]]),
  orb: makeBlob(32, [[0, "rgba(250,255,220,1)"], [0.35, "rgba(200,255,120,0.85)"], [1, "rgba(120,255,80,0)"]]),
  shadow: makeBlob(64, [[0, "rgba(10,0,30,0.55)"], [0.6, "rgba(10,0,30,0.25)"], [1, "rgba(10,0,30,0)"]]),
};

export function mix(a: number[], b: number[], t: number) {
  return a.map((v, i) => v + (b[i]! - v) * t);
}

export function rgba(c: number[], a = 1) {
  return `rgba(${c[0]! | 0},${c[1]! | 0},${c[2]! | 0},${a})`;
}

export function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
