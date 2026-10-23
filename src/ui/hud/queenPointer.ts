import type { HudWidget } from "./types";

/** An arrow at the screen edge pointing toward the queen while she's off screen. */
export const queenPointer: HudWidget = {
  id: "queenPointer",
  draw({ ctx, W, H, session, proj, camera }) {
    const q = session.world.swarm.queen;
    if (!q || q.hp <= 0 || session.state !== "play") return;
    const pr = proj.project(q.x, q.y, q.alt);
    const m = 40;
    if (pr.visible && pr.x > m && pr.x < W - m && pr.y > m && pr.y < H - m) return;
    // The projection is radial around the screen centre, so the world direction is the screen direction.
    const a = Math.atan2(q.y - camera.y, q.x - camera.x);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const t = Math.min((W / 2 - m) / Math.abs(c || 1e-6), (H / 2 - m) / Math.abs(sn || 1e-6));
    const x = W / 2 + c * t;
    const y = H / 2 + sn * t;
    const pulse = 1 + 0.12 * Math.sin(performance.now() / 150);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(60,10,80,0.6)";
    ctx.beginPath();
    ctx.arc(0, 0, 17 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd34d";
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♛", 0, 1);
    ctx.rotate(a);
    ctx.fillStyle = "#e48cff";
    ctx.beginPath();
    ctx.moveTo(27 * pulse, 0);
    ctx.lineTo(19 * pulse, -7);
    ctx.lineTo(19 * pulse, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
};
