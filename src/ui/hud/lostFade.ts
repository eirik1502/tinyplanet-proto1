import type { HudWidget } from "./types";

/** Fades the view out while the player sinks into the haze. */
export const lostFade: HudWidget = {
  id: "lostFade",
  draw({ ctx, W, H, session }) {
    const p = session.world.player;
    if (p.mode !== "lost") return;
    const t = p.lostTimer;
    const a = t < 1.1 ? 0 : Math.min(1, (t - 1.1) / 0.4);
    ctx.fillStyle = `rgba(200,190,255,${a * 0.6})`;
    ctx.fillRect(0, 0, W, H);
  },
};
