import { MODIFIERS } from "../../levels/levels";
import type { HudWidget } from "./types";

/** The queen's health bar (blue while shielded), the swarm's size, what's being played, and the level's modifiers. */
export const swarmStatus: HudWidget = {
  id: "swarmStatus",
  draw({ ctx, W, session }) {
    const w = session.world;
    const swarm = w.swarm;
    const q = swarm.queen;
    if (q) {
      const bw = Math.min(320, W * 0.4);
      const bx = (W - bw) / 2;
      ctx.fillStyle = "rgba(20,8,35,0.7)";
      ctx.fillRect(bx - 2, 14, bw + 4, 14);
      ctx.fillStyle = swarm.queenShielded ? "#8fe3ff" : "#c84cff";
      ctx.fillRect(bx, 16, bw * Math.max(0, q.hp / q.maxHp), 10);
    }
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#f0dcff";
    const shield = swarm.queenShielded ? ` · shielded: ${swarm.shieldLeft} more kills` : "";
    const at = session.run.kind === "scenario" ? "scenario" : session.custom ? "custom level" : `level ${session.level}`;
    ctx.fillText(
      `${q ? `♛ QUEEN${shield} · ` : ""}swarm ${swarm.boids.length - (q ? 1 : 0)} in ${swarm.flocks.length} flocks · ${at} · planet ${w.planet.seed.toString(36)}`,
      W / 2,
      32,
    );
    const mods = session.plan?.modifiers.map((m) => MODIFIERS[m].name).join(" · ");
    if (mods) {
      ctx.fillStyle = "#8fe3ff";
      ctx.fillText(mods, W / 2, 48);
    }
  },
};
