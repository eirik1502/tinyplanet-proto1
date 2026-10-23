import { HitVolume, Hurtable } from "../combat/components";
import type { Hitbox, Hurtbox } from "../combat/hitbox";
import type { Painter } from "./painter";
import type { Overlay } from "./scene";

// Debug layers: overlays a developer can switch on from the dev panel (Debug). Add one by
// registering it; it draws on top of the world every frame while it's on.

export interface DebugLayer {
  id: string;
  name: string;
  draw: Overlay;
}

export const DEBUG_LAYERS: DebugLayer[] = [];

export function registerDebugLayer(layer: DebugLayer) {
  DEBUG_LAYERS.push(layer);
}

function outline(p: Painter, b: Hitbox | Hurtbox) {
  const hit = b as Hitbox;
  if (hit.rect) p.rectPath(b.x, b.y, b.alt, hit.rect.dx, hit.rect.dy, hit.rect.length, hit.rect.halfWidth);
  else if (hit.sector) {
    const { ctx, proj } = p;
    const a = Math.atan2(hit.sector.dy, hit.sector.dx);
    const n = 16;
    ctx.beginPath();
    const c = proj.project(b.x, b.y, b.alt);
    ctx.moveTo(c.x, c.y);
    for (let i = 0; i <= n; i++) {
      const t = a - hit.sector.arc + (2 * hit.sector.arc * i) / n;
      const q = proj.project(b.x + Math.cos(t) * b.radius, b.y + Math.sin(t) * b.radius, b.alt);
      ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
  } else p.circlePath(b.x, b.y, b.alt, b.radius, 24);
}

registerDebugLayer({
  id: "hitboxes",
  name: "Hitboxes and hurtboxes",
  draw(p, s) {
    const { ctx } = p;
    const w = s.world;
    ctx.lineWidth = 1.5;
    for (const [, h] of w.objects.query(Hurtable)) {
      outline(p, h.hurtbox());
      ctx.strokeStyle = h.team === "player" ? "rgba(120,255,160,0.9)" : h.targetable() ? "rgba(255,120,120,0.9)" : "rgba(160,160,160,0.6)";
      ctx.stroke();
    }
    for (const [o, v] of w.objects.query(HitVolume)) {
      outline(p, w.combat.volumeBox(o, v));
      ctx.strokeStyle = v.team === "player" ? "rgba(255,230,120,0.95)" : "rgba(255,120,220,0.95)";
      ctx.stroke();
    }
  },
});

registerDebugLayer({
  id: "flocks",
  name: "Flocks: centres, goals, engagement",
  draw(p, s) {
    const { ctx, proj } = p;
    for (const f of s.world.swarm.flocks) {
      const c = proj.project(f.cx, f.cy, 150);
      const g = proj.project(f.goalX, f.goalY, 150);
      ctx.strokeStyle = f.engaged ? "rgba(255,110,110,0.8)" : f.escort ? "rgba(255,140,240,0.8)" : "rgba(160,200,255,0.6)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(g.x, g.y);
      ctx.stroke();
      ctx.setLineDash([]);
      p.circlePath(f.cx, f.cy, 150, f.style.spread, 24);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${f.members.length}${f.escort ? " escort" : ""}${f.engaged ? " engaged" : ""}${f.hunting ? " hunting" : ""}`, c.x, c.y - 8);
    }
  },
});
