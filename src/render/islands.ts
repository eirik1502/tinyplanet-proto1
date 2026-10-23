import { smoothstep } from "../core/math";
import { ISLAND_TOP } from "../world/island";
import { BLOBS, mix, rgba } from "./painter";
import type { WorldLayer } from "./scene";

// Islands as stacked slices (cliff strata, then a root fading into the haze), the grass top with
// its meadow, and trees as flat discs stacked at increasing altitude, so parallax gives them
// height. Far islands tint toward the atmosphere as they curve over the horizon. Also the
// planet's boundary: a shimmering curtain of light rings.

const HAZE_COL = [150, 140, 220];
const FOG_COL = [140, 125, 235];

export const islandsLayer: WorldLayer = (p, s, out) => {
  const { ctx, proj } = p;
  const cam = s.camera;
  const horizon = proj.horizonDistance;
  const theme = s.world.planet.theme;
  for (const isl of s.world.islands) {
    const distRatio = Math.hypot(isl.cx - cam.x, isl.cy - cam.y) / horizon;
    if (distRatio > 1.35) continue;
    const fog = smoothstep(0.35, 1.1, distRatio) * 0.85;
    const fogged = (c: number[]) => mix(c, FOG_COL, fog);
    for (const sl of isl.slices) {
      out.push({
        alt: sl.alt,
        draw: () => {
          if (!p.polyPath(sl.pts, sl.alt)) return;
          const t = sl.depth;
          // Cliff band alternates earthy strata; the root fades from rock into the haze colour.
          const base = sl.cliff
            ? mix(theme.earth, theme.rockTop, t * 3 + (isl.slices.indexOf(sl) % 2) * 0.15)
            : mix(theme.rockTop, theme.rockDeep, Math.min(1, t * 1.3));
          const col = fogged(mix(base, HAZE_COL, Math.pow(t, 2) * 0.6));
          // Thin bright rim per slice reads as strata on the rock face.
          ctx.fillStyle = rgba(col);
          ctx.fill();
          ctx.strokeStyle = rgba(mix(col, [255, 255, 255], 0.12), 0.5);
          ctx.lineWidth = 1;
          ctx.stroke();
        },
      });
    }
    // Earth lip just below the grass
    out.push({
      alt: ISLAND_TOP - 2,
      draw: () => {
        if (!p.polyPath(isl.pts, ISLAND_TOP - 3)) return;
        ctx.fillStyle = rgba(fogged(theme.lip));
        ctx.fill();
      },
    });
    out.push({
      alt: ISLAND_TOP,
      draw: () => {
        if (!p.polyPath(isl.pts, ISLAND_TOP)) return;
        ctx.fillStyle = rgba(fogged(theme.grass));
        ctx.fill();
        ctx.strokeStyle = rgba(fogged(theme.grassEdge));
        ctx.lineWidth = 2;
        ctx.stroke();
        p.polyPath(isl.inner, ISLAND_TOP);
        ctx.fillStyle = rgba(fogged(theme.grassInner));
        ctx.fill();
      },
    });
    for (const tr of isl.trees) {
      const layers = 4;
      out.push({
        alt: ISLAND_TOP + 0.5,
        draw: () => p.drawFlat(BLOBS.shadow, proj.project(tr.x + 6, tr.y + 6, ISLAND_TOP + 0.5), tr.r * 1.3, 0.9),
      });
      out.push({
        alt: ISLAND_TOP + 1,
        draw: () => {
          for (let k = 0; k < 3; k++) {
            const a = ISLAND_TOP + 1 + k * 4;
            p.flatEllipsePath(proj.project(tr.x, tr.y, a), 3.2);
            ctx.fillStyle = rgba(fogged(theme.trunk));
            ctx.fill();
          }
        },
      });
      for (let k = 0; k < layers; k++) {
        const a = ISLAND_TOP + 14 + k * 9;
        const r = tr.r * (1 - k * 0.2);
        const g = fogged(mix(theme.canopyDark, theme.canopyLight, (k / (layers - 1)) * 0.8 + tr.tint * 0.2));
        out.push({
          alt: a,
          draw: () => {
            p.flatEllipsePath(proj.project(tr.x, tr.y, a), r);
            ctx.fillStyle = rgba(g);
            ctx.fill();
          },
        });
      }
    }
  }
};

/**
 * The planet boundary: a shimmering curtain of light rings rising out of the haze. The brightest,
 * solid ring sits at island height (the play level), fading above and below. Each ring is drawn at
 * its own altitude so it sorts and curves with the world.
 */
export const boundsLayer: WorldLayer = (p, s, out) => {
  const { ctx, proj } = p;
  const b = s.world.planet.bounds;
  const time = s.time;
  const alts = [4, 30, 60, 90, ISLAND_TOP, ISLAND_TOP + 30, ISLAND_TOP + 65];
  for (let l = 0; l < alts.length; l++) {
    const alt = alts[l]!;
    const main = alt === ISLAND_TOP;
    const fade = main ? 1 : 0.55 * (1 - Math.abs(alt - ISLAND_TOP) / (ISLAND_TOP + 20));
    out.push({
      alt,
      draw: () => {
        const n = 160;
        ctx.strokeStyle = `rgba(150,235,255,${0.6 * fade})`;
        ctx.lineWidth = main ? 3 : 1.5;
        ctx.setLineDash(main ? [] : [14, 10]);
        ctx.lineDashOffset = -time * 30 * (l % 2 ? 1 : -1);
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          const wob = Math.sin(a * 9 + time * 1.5 + l) * 4;
          const pr = proj.project(b.x + Math.cos(a) * (b.r + wob), b.y + Math.sin(a) * (b.r + wob), alt);
          if (!pr.visible) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(pr.x, pr.y);
          else ctx.moveTo(pr.x, pr.y);
          pen = true;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      },
    });
  }
};
