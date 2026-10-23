import type { HudWidget } from "./types";

/** Health trailing behind the bar: recent damage shows as a light segment draining away. */
let trail = 1;

/** The player's health bar, and under it focus (the slow-motion budget) and the banked double jump. */
export const health: HudWidget = {
  id: "health",
  draw({ ctx, W, session }) {
    const w = session.world;
    const p = w.player;
    const hp = w.playerCtl.health;
    const frac = Math.max(0, hp.hp / hp.max);
    trail = Math.max(frac, trail - 0.004);
    const hw = Math.min(240, W * 0.3);
    ctx.fillStyle = "rgba(20,8,35,0.7)";
    ctx.fillRect(14, 14, hw + 4, 14);
    ctx.fillStyle = "rgba(255,220,200,0.8)";
    ctx.fillRect(16, 16, hw * trail, 10);
    ctx.fillStyle = frac > 0.3 ? "#ff5a6e" : `rgba(255,${60 + 60 * Math.sin(performance.now() / 90)},80,1)`;
    ctx.fillRect(16, 16, hw * frac, 10);
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffe0e6";
    ctx.fillText(`♥ ${Math.ceil(hp.hp)}%`, 16, 32);

    const fw = hw * 0.6;
    ctx.fillStyle = "rgba(20,8,35,0.7)";
    ctx.fillRect(14, 50, fw + 4, 8);
    ctx.fillStyle = p.focus > 0 ? "#8fe3ff" : "rgba(143,227,255,0.3)";
    ctx.fillRect(16, 52, fw * p.focus, 4);
    ctx.fillStyle = "#d8f6ff";
    ctx.fillText(`◷ focus${p.airJumps > 0 ? "  ·  ⤒ double jump" : ""}`, 16, 62);
  },
};
