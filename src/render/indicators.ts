import type { Projected } from "./projection";
import { predictFlight } from "../player/flight";
import { ISLAND_TOP } from "../world/island";
import type { Overlay } from "./scene";

// Indicators that help aim: the reach of the attack being charged, and the rest of a flight.

/** Indicator colour per weapon, as "r,g,b". */
const WEAPON_RGB: Record<string, string> = { sword: "255,226,150", spear: "150,230,255" };

/**
 * Aim indicator: the coming attack's reach (its indicator shapes: a fan, a rectangle, a dashed
 * circle for a blast) and an arrow along the aim, all growing with power, and a power ring that
 * fills up while charging.
 */
export const aimIndicator: Overlay = (p, s) => {
  const { ctx, proj } = p;
  const w = s.world;
  const aim = w.attacks.aim;
  const v = s.view;
  if (!aim || w.player.mode === "lost") return;
  const power = w.attacks.power();
  const full = power >= 1;
  const pulse = full ? 0.75 + 0.25 * Math.sin(performance.now() / 60) : 1;
  const alt = w.player.mode === "hang" ? ISLAND_TOP + 2 : v.alt;
  const a = aim.angle;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const at = (ang: number, r: number) => proj.project(v.x + Math.cos(ang) * r, v.y + Math.sin(ang) * r, alt);
  const col = WEAPON_RGB[aim.weapon.id] ?? "255,255,255";

  ctx.lineJoin = "round";
  const fillStroke = () => {
    ctx.fillStyle = `rgba(${col},${(0.1 + 0.18 * power) * pulse})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${col},${(0.45 + 0.4 * power) * pulse})`;
    ctx.lineWidth = 1.5 + 1.5 * power;
    ctx.stroke();
  };
  for (const shape of aim.attack.indicator((g) => w.attacks.stats(g), power)) {
    if (shape.kind === "fan") {
      const n = 16;
      ctx.beginPath();
      const c = at(0, 0);
      ctx.moveTo(c.x, c.y);
      for (let i = 0; i <= n; i++) {
        const q = at(a - shape.arc + (2 * shape.arc * i) / n, shape.radius);
        ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
      fillStroke();
    } else if (shape.kind === "rect") {
      p.rectPath(v.x, v.y, alt, ux, uy, shape.length, shape.halfWidth);
      fillStroke();
    } else {
      p.circlePath(v.x + ux * shape.x, v.y + uy * shape.x, alt, shape.radius);
      if (shape.dashed) {
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = `rgba(${col},${0.35 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      } else fillStroke();
    }
  }

  // Arrow along the aim; longer and broader with power.
  const len = aim.weapon.id === "sword" ? 30 + 40 * power : 40 + 80 * power;
  const head = 8 + 10 * power;
  const half = 4 + 6 * power;
  const tip = at(a, len);
  const base = at(a, len - head);
  const tail = at(a, 14);
  ctx.strokeStyle = `rgba(${col},${0.9 * pulse})`;
  ctx.lineCap = "round";
  ctx.lineWidth = (2 + 2.5 * power) * tip.kt;
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(base.x, base.y);
  ctx.stroke();
  const l = at(a + Math.atan2(half, len - head), Math.hypot(half, len - head));
  const r = at(a - Math.atan2(half, len - head), Math.hypot(half, len - head));
  ctx.fillStyle = `rgba(${col},${0.95 * pulse})`;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(l.x, l.y);
  ctx.lineTo(r.x, r.y);
  ctx.closePath();
  ctx.fill();

  // Power ring around the player fills up while charging.
  const ringR = 18;
  const ring: Projected[] = [];
  const segs = 32;
  for (let i = 0; i <= Math.round(segs * power); i++) ring.push(at(a + (i / segs) * Math.PI * 2, ringR));
  if (ring.length > 1) {
    ctx.strokeStyle = `rgba(${col},${full ? 0.95 : 0.7})`;
    ctx.lineWidth = full ? 3 : 2;
    ctx.beginPath();
    ring.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
  }
};

/**
 * In the air, a dashed line traces the rest of the flight. It turns green if it ends on an island,
 * and stays pale if it ends in the haze.
 */
export const jumpPreview: Overlay = (p, s) => {
  const { ctx, proj } = p;
  const w = s.world;
  if (s.session.state !== "play" || w.player.mode !== "air") return;
  const { points, landing } = predictFlight(w, w.player);
  const pts = points.map((q) => proj.project(q.x, q.y, q.alt));
  const hit = !!landing;
  const a = 0.8;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.setLineDash([7, 7]);
  ctx.lineDashOffset = -performance.now() / 40;
  ctx.strokeStyle = hit ? `rgba(140,255,170,${a})` : `rgba(255,235,210,${a * 0.8})`;
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.stroke();
  ctx.setLineDash([]);
  const end = pts[pts.length - 1]!;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.arc(end.x, end.y, hit ? 5 : 3.5, 0, Math.PI * 2);
  ctx.fill();
  if (hit) {
    // Landing ring, so the target reads at a glance.
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 10 + Math.sin(performance.now() / 120) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
};
