import { ISLAND_TOP } from "../world/island";
import { BLOBS } from "./painter";
import type { WorldLayer } from "./scene";

// The portal: while sealed, a faint dashed ring; once open, a spinning column of light rings
// rising out of the haze past the rims, brightest where a flight goes in.

const RINGS = [-30, 0, 30, 60, 95, 135];

export const portalLayer: WorldLayer = (p, s, out) => {
  const portal = s.world.portal;
  if (!portal) return;
  const { ctx } = p;
  const t = s.time;
  if (!portal.open) {
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
    return;
  }
  // Opening: the rings grow in over a moment.
  const grow = Math.min(1, portal.openFor / 0.6);
  for (let i = 0; i < RINGS.length; i++) {
    const alt = ISLAND_TOP + RINGS[i]!;
    const near = 1 - Math.abs(alt - portal.alt) / 140;
    out.push({
      alt,
      draw: () => {
        const r = portal.radius * grow * (0.7 + 0.3 * near + 0.06 * Math.sin(t * 3 + i));
        ctx.save();
        ctx.setLineDash([14, 9]);
        ctx.lineDashOffset = (i % 2 ? 1 : -1) * t * 40;
        ctx.strokeStyle = `rgba(170,240,255,${0.25 + 0.6 * near})`;
        ctx.lineWidth = 1.5 + 2.5 * near;
        p.circlePath(portal.x, portal.y, alt, r);
        ctx.stroke();
        ctx.restore();
      },
    });
  }
  out.push({
    alt: portal.alt + 1,
    draw: () => {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      p.drawFlat(BLOBS.glow, p.proj.project(portal.x, portal.y, portal.alt), portal.radius * 1.6 * grow, 0.8);
      ctx.restore();
    },
  });
};
