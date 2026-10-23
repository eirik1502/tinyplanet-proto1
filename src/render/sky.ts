import { mulberry32 } from "../core/rng";
import { BLOBS, hash2, type Painter } from "./painter";
import type { Overlay, WorldLayer } from "./scene";

// Space, the planet's body of haze and its atmosphere, the drifting haze layers, the motes rising
// out of it, and the veil over the planet's far side.

const stars = (() => {
  const r = mulberry32(99);
  return Array.from({ length: 220 }, () => ({ x: r(), y: r(), s: r() * 1.4 + 0.3, a: r() * 0.7 + 0.2, tw: r() * 6 }));
})();

// Haze layers at increasing altitudes; higher layers are sparser and veil the island roots.
const hazeLayers = [
  { alt: 2, cell: 170, size: 210, alpha: 0.32, drift: 6, seed: 1 },
  { alt: 28, cell: 190, size: 190, alpha: 0.24, drift: -9, seed: 2 },
  { alt: 55, cell: 210, size: 170, alpha: 0.18, drift: 12, seed: 3 },
  { alt: 82, cell: 260, size: 150, alpha: 0.1, drift: -14, seed: 4 },
];

/** Space, then the planet body (the haze sea) with its atmosphere rim. */
export function drawSpace(p: Painter, time: number) {
  const { ctx, proj, W, H } = p;
  ctx.fillStyle = "#05030c";
  ctx.fillRect(0, 0, W, H);
  for (const st of stars) {
    ctx.globalAlpha = st.a * (0.7 + 0.3 * Math.sin(time * 1.3 + st.tw));
    ctx.fillStyle = "#e8e4ff";
    ctx.fillRect(st.x * W, st.y * H, st.s, st.s);
  }
  ctx.globalAlpha = 1;

  const limb = proj.limbRadius;
  const atm = ctx.createRadialGradient(proj.cx, proj.cy, limb * 0.92, proj.cx, proj.cy, limb * 1.12);
  atm.addColorStop(0, "rgba(160,140,255,0.0)");
  atm.addColorStop(0.42, "rgba(170,150,255,0.55)");
  atm.addColorStop(1, "rgba(120,90,255,0)");
  ctx.fillStyle = atm;
  ctx.beginPath();
  ctx.arc(proj.cx, proj.cy, limb * 1.12, 0, Math.PI * 2);
  ctx.fill();
  const body = ctx.createRadialGradient(proj.cx, proj.cy, 0, proj.cx, proj.cy, limb);
  body.addColorStop(0, "#2a2160");
  body.addColorStop(0.7, "#2c2468");
  body.addColorStop(0.93, "#463a90");
  body.addColorStop(1, "#7a6ad0");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(proj.cx, proj.cy, limb, 0, Math.PI * 2);
  ctx.fill();
}

export const hazeLayer: WorldLayer = (p, s, out) => {
  const { ctx, proj } = p;
  const cam = s.camera;
  const time = s.time;
  const horizon = proj.horizonDistance;
  for (const L of hazeLayers) {
    const ox = time * L.drift;
    const oy = time * L.drift * 0.4;
    const reach = horizon + L.size;
    const x0 = Math.floor((cam.x - ox - reach) / L.cell);
    const x1 = Math.floor((cam.x - ox + reach) / L.cell);
    const y0 = Math.floor((cam.y - oy - reach) / L.cell);
    const y1 = Math.floor((cam.y - oy + reach) / L.cell);
    const blobs: { x: number; y: number; r: number; spr: number; a: number }[] = [];
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const h = hash2(gx, gy, L.seed);
        if (L.alt > 40 && h > 0.6) continue;
        const x = (gx + hash2(gx, gy, L.seed + 10)) * L.cell + ox;
        const y = (gy + hash2(gx, gy, L.seed + 20)) * L.cell + oy;
        if (Math.hypot(x - cam.x, y - cam.y) > reach) continue;
        const pulse = 0.75 + 0.25 * Math.sin(time * 0.5 + h * 20);
        blobs.push({ x, y, r: L.size * (0.6 + h * 0.8), spr: Math.floor(h * 97) % 3, a: L.alpha * pulse });
      }
    }
    out.push({
      alt: L.alt,
      draw: () => {
        ctx.globalCompositeOperation = "screen";
        for (const b of blobs) p.drawFlat(BLOBS.haze[b.spr]!, proj.project(b.x, b.y, L.alt), b.r, b.a);
        ctx.globalCompositeOperation = "source-over";
      },
    });
  }
};

/** Motes rising out of the haze. */
export const motesLayer: WorldLayer = (p, s, out) => {
  const cam = s.camera;
  const time = s.time;
  const moteRand = mulberry32(7);
  for (let i = 0; i < 90; i++) {
    const bx = cam.x + (moteRand() - 0.5) * 1600;
    const by = cam.y + (moteRand() - 0.5) * 1600;
    const speed = 12 + moteRand() * 18;
    const phase = moteRand() * 400;
    const alt = (time * speed + phase) % 200;
    const x = bx + Math.sin(time * 0.3 + i) * 30;
    const y = by + Math.cos(time * 0.27 + i * 1.7) * 30;
    const fade = Math.sin((alt / 200) * Math.PI);
    out.push({ alt, draw: () => p.drawFlat(BLOBS.glow, p.proj.project(x, y, alt), 5, 0.8 * fade) });
  }
};

/** Haze veil over the far side of the planet: everything near the limb fades into the atmosphere. */
export const veil: Overlay = (p) => {
  const { ctx, proj } = p;
  const limb = proj.limbRadius;
  const v = ctx.createRadialGradient(proj.cx, proj.cy, limb * 0.55, proj.cx, proj.cy, limb * 1.02);
  v.addColorStop(0, "rgba(120,100,230,0)");
  v.addColorStop(0.8, "rgba(120,100,230,0.18)");
  v.addColorStop(1, "rgba(150,130,255,0.45)");
  ctx.fillStyle = v;
  ctx.beginPath();
  ctx.arc(proj.cx, proj.cy, limb * 1.02, 0, Math.PI * 2);
  ctx.fill();
};
