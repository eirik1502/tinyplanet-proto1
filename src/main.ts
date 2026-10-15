import { Island, ISLAND_TOP, mulberry32, type Vec } from "./island";
import { Projector, type Projected } from "./projection";

// ---------------------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------------------

const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
let W = 0;
let H = 0;
let dpr = 1;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}
window.addEventListener("resize", resize);
resize();

const proj = new Projector();

const islands = generateIslands(2024, 16);

/**
 * Scatters islands outward from a starting one. Each new island is placed a jumpable gap away
 * from a random existing island and must keep its distance from all the others.
 */
function generateIslands(seed: number, count: number): Island[] {
  const rand = mulberry32(seed);
  const out = [new Island(0, 0, 165, seed)];
  for (let tries = 0; out.length < count && tries < 4000; tries++) {
    const from = out[Math.floor(rand() * out.length)]!;
    const r = 90 + rand() * 80;
    const a = rand() * Math.PI * 2;
    // Outlines wobble by up to ~30%, so pad nominal radii accordingly.
    const gap = 50 + rand() * 170;
    const d = 1.3 * (from.radius + r) + gap;
    const x = from.cx + Math.cos(a) * d;
    const y = from.cy + Math.sin(a) * d;
    const clear = out.every((o) => Math.hypot(o.cx - x, o.cy - y) >= 1.3 * (o.radius + r) + 50);
    if (clear) out.push(new Island(x, y, r, seed + out.length * 7919));
  }
  return out;
}

// Tuning
const CAM_HEIGHT = 420; // camera height above the island tops
const CLIMB_SPEED = 300;
const GRAVITY = 720;
const AIR_TURN = 2.2; // rad/s the flight direction can be turned
const JUMP_RANGE = 300; // horizontal distance of a jump landing back at island-top height
const BODY_RADIUS = 9;
const HANG_ALT = ISLAND_TOP - 9;

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

const keys = new Set<string>();
const pressed = new Set<string>();
window.addEventListener("keydown", (e) => {
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});
window.addEventListener("blur", () => keys.clear());

/** -1 for left, +1 for right, 0 for neither or both. */
function steer(): number {
  return +(keys.has("KeyD") || keys.has("ArrowRight")) - +(keys.has("KeyA") || keys.has("ArrowLeft"));
}

// ---------------------------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------------------------

type Mode = "hang" | "air" | "lost";

const player = {
  mode: "hang" as Mode,
  island: 0,
  s: 0,
  x: 0,
  y: 0,
  alt: HANG_ALT,
  vx: 0,
  vy: 0,
  vz: 0,
  launchIsland: -1,
  airTime: 0,
  lostTimer: 0,
  // last safe grip, for respawning after falling into the haze
  safeIsland: 0,
  safeS: 0,
  // rendered position, smoothed so grabbing / climbing doesn't snap
  rx: 0,
  ry: 0,
  ralt: HANG_ALT,
  facing: 0, // world angle pointing from the player to the rim (or flight direction)
  spin: 0,
};

{
  // Start on the rim of the first island, facing its nearest neighbour.
  const start = islands[0]!;
  const near = islands.slice(1).reduce((a, b) =>
    Math.hypot(a.cx - start.cx, a.cy - start.cy) < Math.hypot(b.cx - start.cx, b.cy - start.cy) ? a : b,
  );
  player.s = start.closest(near.cx, near.cy).s;
  const e = start.pointAt(player.s);
  player.x = player.rx = e.x + e.nx * 7;
  player.y = player.ry = e.y + e.ny * 7;
}

const cam = { x: player.x, y: player.y, h: CAM_HEIGHT };

function grab(islandIdx: number, s: number) {
  player.mode = "hang";
  player.island = islandIdx;
  player.s = s;
  player.vx = player.vy = player.vz = 0;
  player.safeIsland = islandIdx;
  player.safeS = s;
}

function update(dt: number) {
  const turn = steer();
  const p = player;

  if (p.mode === "hang") {
    const isl = islands[p.island]!;
    // Facing the island, "right" runs counter-clockwise on screen, which is decreasing s.
    p.s -= turn * CLIMB_SPEED * dt;
    const e = isl.pointAt(p.s);
    p.x = e.x + e.nx * 7;
    p.y = e.y + e.ny * 7;
    p.alt = HANG_ALT;
    p.facing = Math.atan2(-e.ny, -e.nx);

    if (pressed.has("Space")) {
      // Push straight out from the rim; ~45° arc that lands JUMP_RANGE away at island height.
      const v = Math.sqrt((GRAVITY * JUMP_RANGE) / 2);
      p.x = e.x + e.nx * 12;
      p.y = e.y + e.ny * 12;
      p.alt = ISLAND_TOP;
      p.vx = e.nx * v;
      p.vy = e.ny * v;
      p.vz = v;
      p.mode = "air";
      p.airTime = 0;
      p.launchIsland = p.island;
    }
  } else if (p.mode === "air") {
    p.airTime += dt;
    // Steer by turning the flight direction; right turns clockwise on screen (the flyer's right).
    if (turn) {
      const a = turn * AIR_TURN * dt;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const vx = p.vx;
      p.vx = vx * c - p.vy * sn;
      p.vy = vx * sn + p.vy * c;
    }
    p.vz -= GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.alt += p.vz * dt;
    p.spin += dt * 3;
    if (Math.hypot(p.vx, p.vy) > 1) p.facing = Math.atan2(p.vy, p.vx);

    // Touching any island's body stops the flight and grabs the nearest point of its rim.
    for (let i = 0; i < islands.length; i++) {
      if (i === p.launchIsland && p.airTime < 0.25) continue;
      const isl = islands[i]!;
      if (isl.intersects(p.x, p.y, p.alt, BODY_RADIUS)) {
        grab(i, isl.closest(p.x, p.y).s);
        break;
      }
    }
    if (p.mode === "air" && p.alt < ISLAND_TOP - 80) {
      p.mode = "lost";
      p.lostTimer = 0;
    }
  } else {
    // Sinking into the haze, then reappear on the last rim we held.
    p.lostTimer += dt;
    p.vx *= Math.exp(-2 * dt);
    p.vy *= Math.exp(-2 * dt);
    p.vz = Math.max(p.vz - GRAVITY * 0.3 * dt, -260);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.alt = Math.max(5, p.alt + p.vz * dt);
    if (p.lostTimer > 1.6) {
      grab(p.safeIsland, p.safeS);
      const e = islands[p.island]!.pointAt(p.s);
      p.x = p.rx = e.x + e.nx * 7;
      p.y = p.ry = e.y + e.ny * 7;
      p.alt = p.ralt = HANG_ALT + 60;
    }
  }

  // Smoothed render position.
  const k = p.mode === "hang" ? 1 - Math.exp(-18 * dt) : 1;
  p.rx += (p.x - p.rx) * k;
  p.ry += (p.y - p.ry) * k;
  p.ralt += (p.alt - p.ralt) * (p.mode === "hang" ? 1 - Math.exp(-10 * dt) : 1);

  // Camera trails behind and slides in toward the player; it rises a bit with high jumps.
  const lead = 0.25;
  const tx = p.rx + p.vx * lead;
  const ty = p.ry + p.vy * lead;
  const ck = 1 - Math.exp(-2.4 * dt);
  cam.x += (tx - cam.x) * ck;
  cam.y += (ty - cam.y) * ck;
  const th = CAM_HEIGHT + Math.max(0, p.alt - ISLAND_TOP) * 0.8;
  cam.h += (th - cam.h) * (1 - Math.exp(-1.5 * dt));

  pressed.clear();
}

// ---------------------------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------------------------

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

const hazeSprites = [
  makeBlob(128, [[0, "rgba(190,220,255,0.9)"], [0.45, "rgba(170,160,255,0.35)"], [1, "rgba(150,120,255,0)"]]),
  makeBlob(128, [[0, "rgba(220,190,255,0.9)"], [0.5, "rgba(200,150,240,0.3)"], [1, "rgba(180,120,230,0)"]]),
  makeBlob(128, [[0, "rgba(170,255,240,0.8)"], [0.5, "rgba(140,220,230,0.25)"], [1, "rgba(120,200,230,0)"]]),
];
const glowSprite = makeBlob(64, [[0, "rgba(255,255,230,1)"], [0.25, "rgba(220,240,255,0.6)"], [1, "rgba(180,200,255,0)"]]);
const shadowSprite = makeBlob(64, [[0, "rgba(10,0,30,0.55)"], [0.6, "rgba(10,0,30,0.25)"], [1, "rgba(10,0,30,0)"]]);

/** Draws a sprite lying flat on the planet surface: squashed radially as the surface tilts away. */
function drawFlat(img: CanvasImageSource, pr: Projected, worldRadius: number, alpha: number, spin = 0) {
  if (!pr.visible || alpha <= 0.002) return;
  const sx = worldRadius * pr.kr;
  const sy = worldRadius * pr.kt;
  if (sx < 0.05 && sy < 0.05) return;
  const c = Math.cos(pr.angle);
  const s = Math.sin(pr.angle);
  ctx.globalAlpha = alpha;
  ctx.setTransform(dpr * c * sx, dpr * s * sx, -dpr * s * sy, dpr * c * sy, dpr * pr.x, dpr * pr.y);
  if (spin) ctx.rotate(spin);
  ctx.drawImage(img, -1, -1, 2, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
}

/** Ellipse lying flat on the surface (for tree canopies etc). */
function flatEllipsePath(pr: Projected, worldRadius: number) {
  ctx.beginPath();
  ctx.ellipse(pr.x, pr.y, Math.max(0.1, worldRadius * pr.kr), Math.max(0.1, worldRadius * pr.kt), pr.angle, 0, Math.PI * 2);
}

function polyPath(pts: Vec[], alt: number): boolean {
  ctx.beginPath();
  let any = false;
  for (let i = 0; i < pts.length; i++) {
    const pr = proj.project(pts[i]!.x, pts[i]!.y, alt);
    any ||= pr.visible;
    if (i === 0) ctx.moveTo(pr.x, pr.y);
    else ctx.lineTo(pr.x, pr.y);
  }
  ctx.closePath();
  return any;
}

function mix(a: number[], b: number[], t: number) {
  return a.map((v, i) => v + (b[i]! - v) * t);
}
function rgba(c: number[], a = 1) {
  return `rgba(${c[0]! | 0},${c[1]! | 0},${c[2]! | 0},${a})`;
}

// Static starfield
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

function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------------------------

interface Drawable { alt: number; draw: () => void }

const EARTH = [118, 82, 62];
const ROCK_TOP = [122, 92, 104];
const ROCK_DEEP = [56, 48, 104];
const HAZE_COL = [150, 140, 220];
const FOG_COL = [140, 125, 235];

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function render(time: number) {
  const zoom = Math.min(W, H) / 640;
  proj.setCamera(cam.x, cam.y, ISLAND_TOP, cam.h, zoom, W, H);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Space
  ctx.fillStyle = "#05030c";
  ctx.fillRect(0, 0, W, H);
  for (const st of stars) {
    ctx.globalAlpha = st.a * (0.7 + 0.3 * Math.sin(time * 1.3 + st.tw));
    ctx.fillStyle = "#e8e4ff";
    ctx.fillRect(st.x * W, st.y * H, st.s, st.s);
  }
  ctx.globalAlpha = 1;

  // Planet body (the haze sea) + atmosphere rim
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

  const list: Drawable[] = [];
  const horizon = proj.horizonDistance;

  // Haze
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
    list.push({
      alt: L.alt,
      draw: () => {
        ctx.globalCompositeOperation = "screen";
        for (const b of blobs) drawFlat(hazeSprites[b.spr]!, proj.project(b.x, b.y, L.alt), b.r, b.a);
        ctx.globalCompositeOperation = "source-over";
      },
    });
  }

  // Motes rising out of the haze
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
    list.push({ alt, draw: () => drawFlat(glowSprite, proj.project(x, y, alt), 5, 0.8 * fade) });
  }

  // Islands, tinted toward the atmosphere as they curve away over the horizon.
  for (const isl of islands) {
    const distRatio = Math.hypot(isl.cx - cam.x, isl.cy - cam.y) / horizon;
    if (distRatio > 1.35) continue;
    const fog = smoothstep(0.35, 1.1, distRatio) * 0.85;
    const fogged = (c: number[]) => mix(c, FOG_COL, fog);
    for (const sl of isl.slices) {
      list.push({
        alt: sl.alt,
        draw: () => {
          if (!polyPath(sl.pts, sl.alt)) return;
          const t = sl.depth;
          // Cliff band alternates earthy strata; the root fades from rock into the haze colour.
          const base = sl.cliff
            ? mix(EARTH, ROCK_TOP, t * 3 + (isl.slices.indexOf(sl) % 2) * 0.15)
            : mix(ROCK_TOP, ROCK_DEEP, Math.min(1, t * 1.3));
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
    list.push({
      alt: ISLAND_TOP - 2,
      draw: () => {
        if (!polyPath(isl.pts, ISLAND_TOP - 3)) return;
        ctx.fillStyle = rgba(fogged([107, 74, 60]));
        ctx.fill();
      },
    });
    list.push({
      alt: ISLAND_TOP,
      draw: () => {
        if (!polyPath(isl.pts, ISLAND_TOP)) return;
        ctx.fillStyle = rgba(fogged([79, 154, 94]));
        ctx.fill();
        ctx.strokeStyle = rgba(fogged([53, 110, 69]));
        ctx.lineWidth = 2;
        ctx.stroke();
        polyPath(isl.inner, ISLAND_TOP);
        ctx.fillStyle = rgba(fogged([100, 182, 111]));
        ctx.fill();
      },
    });
    for (const tr of isl.trees) {
      // Trees are flat discs stacked at increasing altitude: parallax gives them height.
      const layers = 4;
      list.push({
        alt: ISLAND_TOP + 0.5,
        draw: () => drawFlat(shadowSprite, proj.project(tr.x + 6, tr.y + 6, ISLAND_TOP + 0.5), tr.r * 1.3, 0.9),
      });
      list.push({
        alt: ISLAND_TOP + 1,
        draw: () => {
          for (let k = 0; k < 3; k++) {
            const a = ISLAND_TOP + 1 + k * 4;
            flatEllipsePath(proj.project(tr.x, tr.y, a), 3.2);
            ctx.fillStyle = rgba(fogged([90, 59, 44]));
            ctx.fill();
          }
        },
      });
      for (let k = 0; k < layers; k++) {
        const a = ISLAND_TOP + 14 + k * 9;
        const r = tr.r * (1 - k * 0.2);
        const g = fogged(mix([40, 100, 70], [130, 210, 120], (k / (layers - 1)) * 0.8 + tr.tint * 0.2));
        list.push({
          alt: a,
          draw: () => {
            flatEllipsePath(proj.project(tr.x, tr.y, a), r);
            ctx.fillStyle = rgba(g);
            ctx.fill();
          },
        });
      }
    }
  }

  // Player shadow: on grass if above an island, otherwise faint on the haze.
  const p = player;
  const overIsland = islands.some((i) => i.contains(p.rx, p.ry));
  const shadowAlt = overIsland ? ISLAND_TOP + 0.6 : 4;
  if (p.mode !== "hang") {
    const hAbove = Math.max(0, p.ralt - shadowAlt);
    list.push({
      alt: shadowAlt + 0.1,
      draw: () => drawFlat(shadowSprite, proj.project(p.rx, p.ry, shadowAlt), 12 + hAbove * 0.04, overIsland ? 0.9 : 0.5),
    });
  }

  // Player; while hanging, sort above the lip so the hands overlap the grass edge.
  list.push({ alt: p.mode === "hang" ? ISLAND_TOP + 0.8 : p.ralt, draw: () => drawPlayer(time) });

  list.sort((a, b) => a.alt - b.alt);
  for (const d of list) d.draw();

  // Haze veil over the far side of the planet: everything near the limb fades into the atmosphere.
  const veil = ctx.createRadialGradient(proj.cx, proj.cy, limb * 0.55, proj.cx, proj.cy, limb * 1.02);
  veil.addColorStop(0, "rgba(120,100,230,0)");
  veil.addColorStop(0.8, "rgba(120,100,230,0.18)");
  veil.addColorStop(1, "rgba(150,130,255,0.45)");
  ctx.fillStyle = veil;
  ctx.beginPath();
  ctx.arc(proj.cx, proj.cy, limb * 1.02, 0, Math.PI * 2);
  ctx.fill();

  drawHud();
}

function drawPlayer(time: number) {
  const p = player;
  const pr = proj.project(p.rx, p.ry, p.ralt);
  if (!pr.visible) return;
  const k = pr.kt;
  const fade = p.mode === "lost" ? Math.max(0, 1 - p.lostTimer / 0.9) : 1;
  if (fade <= 0) return;

  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.globalAlpha = fade;

  // Aura
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(glowSprite, -26 * k, -26 * k, 52 * k, 52 * k);
  ctx.globalCompositeOperation = "source-over";

  ctx.rotate(p.facing);
  // In this local frame +x points toward the rim (hanging) or along the flight path.
  if (p.mode === "hang") {
    // Arms reaching onto the rim.
    ctx.strokeStyle = "#f2d7b5";
    ctx.lineCap = "round";
    ctx.lineWidth = 2.6 * k;
    const reach = 9;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(1 * k, side * 4 * k);
      ctx.lineTo(reach * k, side * 5.5 * k);
      ctx.stroke();
    }
  } else {
    ctx.rotate(Math.sin(p.spin) * 0.25);
  }

  // Cloak
  const sway = Math.sin(time * 4) * 1.2;
  ctx.fillStyle = "#d9584a";
  ctx.beginPath();
  ctx.moveTo(2 * k, -6 * k);
  ctx.quadraticCurveTo(-12 * k, -9 * k + sway * k, -15 * k, sway * k);
  ctx.quadraticCurveTo(-12 * k, 9 * k + sway * k, 2 * k, 6 * k);
  ctx.closePath();
  ctx.fill();
  // Shoulders
  ctx.fillStyle = "#3b3170";
  ctx.beginPath();
  ctx.ellipse(0, 0, 4.5 * k, 6.5 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.fillStyle = "#f2d7b5";
  ctx.beginPath();
  ctx.arc(0.5 * k, 0, 3.6 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a1a14";
  ctx.beginPath();
  ctx.arc(-0.6 * k, 0, 3.4 * k, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();

  ctx.restore();

}

function drawHud() {
  if (player.mode === "lost") {
    const t = player.lostTimer;
    const a = t < 1.1 ? 0 : Math.min(1, (t - 1.1) / 0.4);
    ctx.fillStyle = `rgba(200,190,255,${a * 0.6})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------------------------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------------------------

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render(now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
