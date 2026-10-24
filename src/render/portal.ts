import { ARRIVAL_TIME, FLEE_TIME } from "../present/vfx";
import { ISLAND_TOP } from "../world/island";
import { BLOBS, type Painter } from "./painter";
import type { Drawable, WorldLayer } from "./scene";
import { drawBoidBody, type BoidLook } from "./sprites";

// The portal: while sealed, a faint dashed ring; once open, a spinning column of light rings
// rising out of the haze past the rims, brightest where a flight goes in. Also the beaten queen
// spiralling up into it, and at the start of the next level, the portal closing over the player.

const RINGS = [-30, 0, 30, 60, 95, 135];
const PORTAL_ALT = ISLAND_TOP + 35;

/** The column of rings at (x, y), `size` 0..1 of its full width, at time `t`. */
function pushColumn(p: Painter, out: Drawable[], x: number, y: number, radius: number, size: number, t: number) {
  const { ctx } = p;
  for (let i = 0; i < RINGS.length; i++) {
    const alt = ISLAND_TOP + RINGS[i]!;
    const near = 1 - Math.abs(alt - PORTAL_ALT) / 140;
    out.push({
      alt,
      draw: () => {
        const r = radius * size * (0.7 + 0.3 * near + 0.06 * Math.sin(t * 3 + i));
        ctx.save();
        ctx.setLineDash([14, 9]);
        ctx.lineDashOffset = (i % 2 ? 1 : -1) * t * 40;
        ctx.strokeStyle = `rgba(170,240,255,${0.25 + 0.6 * near})`;
        ctx.lineWidth = 1.5 + 2.5 * near;
        p.circlePath(x, y, alt, r);
        ctx.stroke();
        ctx.restore();
      },
    });
  }
  out.push({
    alt: PORTAL_ALT + 1,
    draw: () => {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      p.drawFlat(BLOBS.glow, p.proj.project(x, y, PORTAL_ALT), radius * 1.6 * size, 0.8);
      ctx.restore();
    },
  });
}

export const portalLayer: WorldLayer = (p, s, out) => {
  const { ctx } = p;
  const t = s.time;
  const portal = s.world.portal;

  if (portal && !portal.open) {
    out.push({
      alt: portal.alt,
      draw: () => {
        ctx.save();
        ctx.setLineDash([5, 7]);
        ctx.lineDashOffset = -t * 10;
        ctx.strokeStyle = "rgba(190,244,255,0.35)";
        ctx.lineWidth = 2;
        p.circlePath(portal.x, portal.y, portal.alt, portal.radius * 0.8);
        ctx.stroke();
        ctx.restore();
      },
    });
  } else if (portal) {
    // Opening: the rings grow in over a moment.
    pushColumn(p, out, portal.x, portal.y, portal.radius, Math.min(1, portal.openFor / 0.6), t);
  }

  // The queen escaping: she spirals up into her portal, shrinking away.
  const flee = s.vfx.flee;
  const q = s.world.swarm.queen;
  if (flee && q && portal) {
    const u = flee.age / FLEE_TIME;
    const e = u * u;
    const x = flee.x + (portal.x - flee.x) * Math.min(1, u * 2);
    const y = flee.y + (portal.y - flee.y) * Math.min(1, u * 2);
    const alt = flee.alt + 160 * e;
    out.push({
      alt,
      draw: () => {
        const pr = p.proj.project(x, y, alt);
        if (!pr.visible) return;
        const look = { ...q, heading: q.heading + u * 14, flash: 0, windup: 0 } as BoidLook;
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.globalAlpha = 1 - e;
        drawBoidBody(ctx, q.type, look, pr.kt * (1 - 0.7 * e));
        ctx.restore();
      },
    });
  }

  // Arriving: the portal the player came through closes over the start.
  const arr = s.vfx.arrival;
  if (arr) pushColumn(p, out, arr.x, arr.y, 45, 1 - arr.age / ARRIVAL_TIME, t);
};
