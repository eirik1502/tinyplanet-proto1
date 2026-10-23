import { ISLAND_TOP } from "../world/island";
import type { Overlay } from "./scene";

// Full-view treatments: the wind's streaks, the fog, and slow motion.

/** Streaks blowing past around the camera, on windy levels. */
export const wind: Overlay = (p, s) => {
  const { ctx, proj } = p;
  const w = s.world.rules.wind;
  const strength = Math.hypot(w.x, w.y);
  if (!strength) return;
  const cam = s.camera;
  const time = s.time;
  const dx = w.x / strength;
  const dy = w.y / strength;
  const speed = 160 + strength;
  const span = 1400;
  ctx.lineCap = "round";
  for (let i = 0; i < 46; i++) {
    // Each streak loops along the wind through a fixed lane near the camera.
    const h1 = Math.sin(i * 127.1) * 43758.5453;
    const h2 = Math.sin(i * 311.7) * 43758.5453;
    const lane = (h1 - Math.floor(h1) - 0.5) * span;
    const run = ((((time * speed) / span + (h2 - Math.floor(h2))) % 1) - 0.5) * span;
    const x = cam.x + dx * run - dy * lane;
    const y = cam.y + dy * run + dx * lane;
    const alt = ISLAND_TOP + 25 + (i % 5) * 18;
    const a = proj.project(x, y, alt);
    const b = proj.project(x + dx * 34, y + dy * 34, alt);
    if (!a.visible || !b.visible) continue;
    ctx.strokeStyle = `rgba(225,235,255,${0.12 + 0.1 * (i % 3)})`;
    ctx.lineWidth = 1.4 * a.kt;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
};

/** On foggy levels, everything beyond the view radius around the player fades into the mist. */
export const fog: Overlay = (p, s) => {
  const r0 = s.world.rules.fog;
  if (!r0) return;
  const { ctx, proj } = p;
  const pr = proj.project(s.view.x, s.view.y, s.view.alt);
  const r = r0 * pr.kt;
  const g = ctx.createRadialGradient(pr.x, pr.y, r * 0.5, pr.x, pr.y, r);
  g.addColorStop(0, "rgba(46,36,78,0)");
  g.addColorStop(1, "rgba(46,36,78,0.94)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, p.W, p.H);
};

/** When slow motion last kicked in (ms, performance.now), for its shockwave. */
let slowSince = 0;
let wasSlow = false;

/** Screen treatment while time is slowed: cool desaturation, zoom echo, vignette, shockwave, streaks. */
export const slowMo: Overlay = (p, s) => {
  const slow = s.world.slow;
  if (slow.active && !wasSlow) slowSince = performance.now();
  wasSlow = slow.active;
  const I = slow.intensity;
  if (I < 0.01) return;
  const { ctx, canvas, proj, W, H } = p;
  const t = performance.now() / 1000;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const cw = canvas.width;
  const ch = canvas.height;

  // Drain colour toward a cold blue-violet.
  if ("filter" in ctx) {
    ctx.filter = `saturate(${1 - 0.8 * I}) hue-rotate(${-30 * I}deg) brightness(${1 - 0.15 * I}) contrast(${1 + 0.15 * I})`;
    ctx.globalAlpha = I;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = "none";
  }
  // Zoom echo: a faint, slightly enlarged copy gives a stretched-time smear.
  const z = 1 + 0.035 * I;
  ctx.globalAlpha = 0.22 * I;
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(canvas, (cw - cw * z) / 2, (ch - ch * z) / 2, cw * z, ch * z);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.restore();

  // Vignette with a cyan rim.
  const r = Math.hypot(W, H) / 2;
  const vg = ctx.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
  vg.addColorStop(0, "rgba(40,20,90,0)");
  vg.addColorStop(0.7, `rgba(30,15,80,${0.45 * I})`);
  vg.addColorStop(1, `rgba(120,230,255,${0.55 * I})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // Radial streaks drifting slowly around the player.
  const pp = proj.project(s.view.x, s.view.y, s.view.alt);
  ctx.strokeStyle = `rgba(190,240,255,${0.32 * I})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = i * 2.39996 + t * 0.15;
    const r0 = r * (0.55 + 0.25 * ((i * 0.618) % 1));
    const r1 = r0 + r * 0.35 * I;
    ctx.moveTo(pp.x + Math.cos(a) * r0, pp.y + Math.sin(a) * r0);
    ctx.lineTo(pp.x + Math.cos(a) * r1, pp.y + Math.sin(a) * r1);
  }
  ctx.stroke();

  // Shockwave ring from the player when the slowdown kicks in.
  const age = (performance.now() - slowSince) / 1000;
  if (slow.active && age < 0.45) {
    const k = age / 0.45;
    ctx.strokeStyle = `rgba(170,240,255,${0.7 * (1 - k)})`;
    ctx.lineWidth = 3 + 6 * (1 - k);
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, 20 + k * r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Cinematic bars slide in from top and bottom.
  const bar = H * 0.07 * I;
  ctx.fillStyle = "rgba(4,2,12,0.92)";
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
  ctx.fillStyle = `rgba(150,235,255,${0.6 * I})`;
  ctx.fillRect(0, bar, W, 1);
  ctx.fillRect(0, H - bar - 1, W, 1);
};
