import { BLAST_TIME, type BlastRing, type StrikeLook } from "../present/vfx";
import { BLOBS, type Painter } from "./painter";
import type { Scene, WorldLayer } from "./scene";

// Effects from present/vfx: sword strikes playing out, shock rings, sparks and dust.

export const effectsLayer: WorldLayer = (p, s, out) => {
  const { ctx, proj } = p;
  const fx = s.vfx;
  for (const st of fx.strikes) out.push({ alt: st.alt + 0.5, draw: () => drawStrike(p, s, st) });
  for (const bl of fx.blasts) out.push({ alt: bl.alt, draw: () => drawBlast(p, bl) });
  for (const sp of fx.sparks) {
    out.push({
      alt: sp.alt,
      draw: () => {
        const pr = proj.project(sp.x, sp.y, sp.alt);
        if (!pr.visible) return;
        ctx.globalAlpha = Math.min(1, sp.life * 2);
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, Math.max(1, 2 * pr.kt), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      },
    });
  }
  for (const d of fx.dust) {
    out.push({ alt: d.alt, draw: () => p.drawFlat(BLOBS.dust, proj.project(d.x, d.y, d.alt), 5 * (1.6 - d.life), d.life * 0.8) });
  }
};

/** How each sword attack looks while it plays out: the swipe's crescent, the thrust's spike, the smash's square. */
const STRIKE_LOOKS: Record<string, (p: Painter, st: StrikeLook, t: number, fade: number, s: Scene) => void> = {
  "sword.swipe": (p, st, t, fade, s) => {
    const { ctx, proj } = p;
    const base = Math.atan2(st.dy, st.dx);
    const half = s.world.attacks.stats("sword").arc;
    const a0 = base - half;
    const a1 = a0 + 2 * half * Math.min(1, t * 1.8);
    const outer = [];
    const inner = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      // Crescent: thick in the middle of the sweep, thin at the ends.
      const w = Math.sin((i / n) * Math.PI);
      outer.push(proj.project(st.x + Math.cos(a) * st.reach, st.y + Math.sin(a) * st.reach, st.alt));
      const ri = st.reach * (1 - (0.45 + 0.15 * st.power) * w);
      inner.push(proj.project(st.x + Math.cos(a) * ri, st.y + Math.sin(a) * ri, st.alt));
    }
    ctx.beginPath();
    outer.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i]!.x, inner[i]!.y);
    ctx.closePath();
    ctx.fillStyle = st.power >= 1 ? `rgba(255,236,170,${0.95 * fade})` : `rgba(255,250,235,${0.9 * fade})`;
    ctx.fill();
  },
  "sword.thrust": (p, st, t, fade) => {
    const grow = 1 - (1 - Math.min(1, t * 1.8)) ** 2;
    const rgb = st.power >= 1 ? "255,236,170" : "255,250,235";
    const len = st.reach * grow;
    p.rectPath(st.x, st.y, st.alt, st.dx, st.dy, len, st.halfWidth * 0.7, Math.min(len, 24));
    p.ctx.fillStyle = `rgba(${rgb},${0.9 * fade})`;
    p.ctx.fill();
  },
  "sword.smash": (p, st, t, fade) => {
    const ctx = p.ctx;
    const grow = 1 - (1 - Math.min(1, t * 1.8)) ** 2;
    const rgb = st.power >= 1 ? "255,236,170" : "255,250,235";
    const k = 0.6 + 0.4 * grow;
    const len = st.reach * k;
    const hw = st.halfWidth * k;
    // Centred on the square however far it has grown.
    const off = (st.reach - len) / 2;
    p.rectPath(st.x + st.dx * off, st.y + st.dy * off, st.alt, st.dx, st.dy, len, hw);
    ctx.fillStyle = `rgba(${rgb},${0.55 * fade})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${rgb},${0.95 * fade})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  },
};

function drawStrike(p: Painter, s: Scene, st: StrikeLook) {
  const sw = s.world.params.player.sword;
  const t = st.age / sw.activeTime;
  const fade = 1 - Math.min(1, st.age / (sw.activeTime + sw.fadeTime));
  STRIKE_LOOKS[st.attack]?.(p, st, t, fade, s);
}

/**
 * A blast's look: a flash, then a shock ring racing out to the blast radius. A heavy blast also
 * fills its reach for a moment, with a second ring trailing the first.
 */
function drawBlast(p: Painter, bl: BlastRing) {
  const { ctx, proj } = p;
  const c = proj.project(bl.x, bl.y, bl.alt);
  if (!c.visible) return;
  const t = bl.age / BLAST_TIME;
  const fade = 1 - t;
  const ring = (r: number) => p.circlePath(bl.x, bl.y, bl.alt, r);
  const out = (u: number) => 1 - (1 - Math.min(1, u)) ** 3;
  if (bl.heavy) {
    ring(bl.radius * out(t * 1.4));
    ctx.fillStyle = `rgba(${bl.rgb},${0.3 * fade * fade})`;
    ctx.fill();
    ring(bl.radius * out(t * 0.8));
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * fade})`;
    ctx.lineWidth = Math.max(1, 4 * fade * c.kt);
    ctx.stroke();
  }
  ring(bl.radius * out(t));
  ctx.strokeStyle = `rgba(${bl.rgb},${0.9 * fade})`;
  ctx.lineWidth = Math.max(1, (bl.heavy ? 12 : 6) * fade * c.kt);
  ctx.stroke();
  if (t < 0.35) {
    const fr = (bl.heavy ? 40 + 110 * t : 20 + 50 * t) * c.kt;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 1 - t / 0.35;
    ctx.drawImage(BLOBS.glow, c.x - fr * 2, c.y - fr * 2, fr * 4, fr * 4);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}
