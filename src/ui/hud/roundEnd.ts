import type { HudWidget } from "./types";

/** After a round: cleared or defeated, and what comes next. */
export const roundEnd: HudWidget = {
  id: "roundEnd",
  draw({ ctx, W, H, session, promptText }) {
    if (session.state !== "victory" && session.state !== "defeat") return;
    const custom = session.custom;
    const level = session.level;
    const a = Math.min(1, session.timer / 0.6);
    const win = session.state === "victory";
    ctx.fillStyle = win ? `rgba(40,20,60,${0.55 * a})` : `rgba(40,5,15,${0.6 * a})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 64px system-ui, sans-serif";
    ctx.fillStyle = win ? "#ffd34d" : "#ff5a6e";
    ctx.fillText(win ? (custom ? "CLEARED" : `LEVEL ${level} CLEARED`) : "DEFEATED", W / 2, H / 2 - 20);
    ctx.font = "500 18px system-ui, sans-serif";
    ctx.fillStyle = "#f0e8ff";
    ctx.fillText(
      win ? (session.world.swarm.queen ? "The queen has fallen." : "Every boid is down.") : `The swarm overwhelmed you${custom ? "" : ` on level ${level}`}.`,
      W / 2,
      H / 2 + 30,
    );
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(240,232,255,0.7)";
    const left = Math.ceil(session.endTimeLeft);
    const next = custom ? (session.run.kind === "scenario" ? "Restarting the scenario" : "Restarting the custom level") : win ? `Level ${level + 1}` : `Retrying level ${level}`;
    ctx.fillText(`${next} in ${left}…  (${promptText("confirm")} to continue now)`, W / 2, H / 2 + 60);
    ctx.globalAlpha = 1;
  },
};
