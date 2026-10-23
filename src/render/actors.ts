import { HitVolume } from "../combat/components";
import { outOfHitHeight } from "../combat/hitbox";
import type { Boid } from "../enemies/boid";
import type { QueenParams } from "../enemies/queen";
import { ISLAND_TOP } from "../world/island";
import { BLOBS, type Painter } from "./painter";
import { OUT_OF_HEIGHT_ALPHA, type Scene, type WorldLayer } from "./scene";
import { drawBoidBody } from "./sprites";

// What moves in the world: the player (with their shadow), the boids (with theirs, the queen's
// shield and the warning before her blast), and projectiles in flight.

export const playerLayer: WorldLayer = (p, s, out) => {
  const v = s.view;
  const pl = s.world.player;
  // Shadow: on grass if above an island, otherwise faint on the haze.
  const overIsland = s.world.islands.some((i) => i.contains(v.x, v.y));
  const shadowAlt = overIsland ? ISLAND_TOP + 0.6 : 4;
  if (pl.mode !== "hang") {
    const hAbove = Math.max(0, v.alt - shadowAlt);
    out.push({
      alt: shadowAlt + 0.1,
      draw: () => p.drawFlat(BLOBS.shadow, p.proj.project(v.x, v.y, shadowAlt), 12 + hAbove * 0.04, overIsland ? 0.9 : 0.5),
    });
  }
  // While hanging, sort above the lip so the hands overlap the grass edge.
  out.push({ alt: pl.mode === "hang" ? ISLAND_TOP + 0.8 : v.alt, draw: () => drawPlayer(p, s) });
};

function drawPlayer(p: Painter, s: Scene) {
  const { ctx, proj } = p;
  const v = s.view;
  const pl = s.world.player;
  const pr = proj.project(v.x, v.y, v.alt);
  if (!pr.visible) return;
  const k = pr.kt;
  const fade = pl.mode === "lost" ? Math.max(0, 1 - pl.lostTimer / 0.9) : 1;
  if (fade <= 0) return;

  // Blink while invulnerable.
  if (pl.invuln > 0 && Math.floor(pl.invuln * 14) % 2 === 0) return;

  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.globalAlpha = fade;
  // Aura
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(BLOBS.glow, -26 * k, -26 * k, 52 * k, 52 * k);
  ctx.globalCompositeOperation = "source-over";

  // An unused double jump shows as a faint ring with sparks circling the player.
  if (pl.airJumps > 0) {
    ctx.strokeStyle = `rgba(190,244,255,${0.3 + 0.15 * Math.sin(v.anim * 8)})`;
    ctx.lineWidth = 1.5 * k;
    ctx.beginPath();
    ctx.arc(0, 0, 17 * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 3; i++) {
      const a = v.anim * 5 + (i * Math.PI * 2) / 3;
      ctx.drawImage(BLOBS.glow, Math.cos(a) * 17 * k - 5 * k, Math.sin(a) * 17 * k - 5 * k, 10 * k, 10 * k);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = fade;
  v.avatar.draw(ctx, v.view(), (x, y, alt) => proj.project(x, y, alt));
  ctx.restore();
}

export const boidsLayer: WorldLayer = (p, s, out) => {
  const reach = p.proj.horizonDistance * 1.2;
  const cam = s.camera;
  for (const b of s.world.swarm.boids) {
    if (b.hp <= 0 || Math.hypot(b.x - cam.x, b.y - cam.y) > reach) continue;
    const over = s.world.islands.some((i) => Math.hypot(i.cx - b.x, i.cy - b.y) < i.radius * 1.4 && i.contains(b.x, b.y));
    const sAlt = over ? ISLAND_TOP + 0.6 : 4;
    out.push({
      alt: sAlt + 0.2,
      draw: () => p.drawFlat(BLOBS.shadow, p.proj.project(b.x, b.y, sAlt), b.r * 1.5, over ? 0.6 : 0.3),
    });
    out.push({ alt: b.alt, draw: () => drawBoid(p, s, b) });
  }
};

/** Animation runs on `b.phase`, which stops while the boid is frozen by a hit. */
function drawBoid(p: Painter, s: Scene, b: Boid) {
  const { ctx, proj } = p;
  const swarm = s.world.swarm;
  const pr = proj.project(b.x, b.y, b.alt);
  if (!pr.visible) return;
  const k = pr.kt;
  if (b === swarm.queen && b.windup > 0) drawQueenWarning(p, b);
  ctx.save();
  ctx.translate(pr.x, pr.y);
  if (swarm.outOfReach(b, s.world.player.alt)) ctx.globalAlpha = OUT_OF_HEIGHT_ALPHA;
  drawBoidBody(ctx, b.type, b, k);
  if (b === swarm.queen && swarm.queenShielded && b.hp > 0) drawShield(ctx, b, k);
  ctx.restore();
}

/** The queen's shield: a shimmering bubble around her. */
function drawShield(ctx: CanvasRenderingContext2D, q: Boid, k: number) {
  const t = performance.now() / 1000;
  const r = (q.r + 22 + Math.sin(t * 3) * 2) * k;
  const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r);
  g.addColorStop(0, "rgba(140,230,255,0)");
  g.addColorStop(0.85, "rgba(140,230,255,0.22)");
  g.addColorStop(1, "rgba(200,245,255,0.55)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(200,245,255,${0.5 + 0.3 * Math.sin(t * 5)})`;
  ctx.lineWidth = 1.5 * k;
  ctx.stroke();
}

/** While the queen winds up, the reach of her coming blast closes in around her. */
function drawQueenWarning(p: Painter, q: Boid) {
  const ctx = p.ctx;
  const qa = q.params as unknown as QueenParams;
  const t = Math.max(0, Math.min(1, 1 - q.windup / qa.windup));
  for (const [r, a] of [[qa.blastRadius, 0.25 + 0.35 * t], [qa.blastRadius * (1.6 - 0.6 * t), 0.5 * t]] as const) {
    p.circlePath(q.x, q.y, q.alt, r);
    ctx.strokeStyle = `rgba(255,90,140,${a})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** Projectiles in flight: the spear, and the boids' orbs. */
export const projectilesLayer: WorldLayer = (p, s, out) => {
  const { ctx, proj } = p;
  const w = s.world;
  for (const [o, v] of w.objects.query(HitVolume)) {
    if (!v.projectile) continue;
    const scale = v.projectile.scale;
    if (v.attack === "spear") {
      out.push({
        alt: o.alt,
        draw: () => {
          // Shaft trailing behind a bright tip.
          const l = Math.hypot(o.vx, o.vy) || 1;
          const ux = o.vx / l;
          const uy = o.vy / l;
          const L = w.params.player.spear.length * scale;
          const tail = proj.project(o.x - ux * L, o.y - uy * L, o.alt);
          const neck = proj.project(o.x - ux * 12 * scale, o.y - uy * 12 * scale, o.alt);
          const tip = proj.project(o.x + ux * 4 * scale, o.y + uy * 4 * scale, o.alt);
          if (!tip.visible) return;
          const k = tip.kt * scale;
          // Glow so it reads at speed
          ctx.globalCompositeOperation = "screen";
          ctx.drawImage(BLOBS.glow, tip.x - 16 * k, tip.y - 16 * k, 32 * k, 32 * k);
          ctx.globalCompositeOperation = "source-over";
          ctx.lineCap = "round";
          ctx.strokeStyle = "#c9a96e";
          ctx.lineWidth = 4 * k;
          ctx.beginPath();
          ctx.moveTo(tail.x, tail.y);
          ctx.lineTo(neck.x, neck.y);
          ctx.stroke();
          // Broad leaf-shaped head
          const hx = (tip.x - neck.x) / 16;
          const hy = (tip.y - neck.y) / 16;
          ctx.fillStyle = "#f2efff";
          ctx.strokeStyle = "#7d7aa8";
          ctx.lineWidth = 1.2 * k;
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(neck.x + hx * 6 - hy * 7, neck.y + hy * 6 + hx * 7);
          ctx.lineTo(neck.x, neck.y);
          ctx.lineTo(neck.x + hx * 6 + hy * 7, neck.y + hy * 6 - hx * 7);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        },
      });
    } else {
      out.push({
        alt: o.alt,
        draw: () => {
          const pr = proj.project(o.x, o.y, o.alt);
          if (!pr.visible) return;
          const r = 9 * pr.kt;
          if (outOfHitHeight(o.alt, w.player.alt, w.combat.hitHeight)) ctx.globalAlpha = OUT_OF_HEIGHT_ALPHA;
          ctx.globalCompositeOperation = "screen";
          ctx.drawImage(BLOBS.orb, pr.x - r, pr.y - r, r * 2, r * 2);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        },
      });
    }
  }
};
