import type { BoidSprite } from "./index";
import { LOCK, type MeleeParams } from "../../enemies/melee";
import { wings } from "./wings";

export const MELEE_SPRITE: BoidSprite<MeleeParams> = {
  color: "#ff6b7d",

  draw(ctx, b, k) {
    const p = b.params;
    if (b.windup > 0) {
      const t = 1 - b.windup / Math.max(p.windup, 0.001);
      const locked = t >= 1 - LOCK;
      // The lunge's path, solid once the aim has locked.
      ctx.save();
      ctx.rotate(b.heading);
      const len = ((p.lungeSpeed * p.lungeTime) / p.size) * k;
      const grad = ctx.createLinearGradient(10 * k, 0, len, 0);
      grad.addColorStop(0, `rgba(255,80,100,${locked ? 0.55 : 0.12 + 0.25 * t})`);
      grad.addColorStop(1, "rgba(255,80,100,0)");
      ctx.fillStyle = grad;
      const w = (locked ? 5 : 3) * k;
      ctx.fillRect(10 * k, -w, len - 10 * k, w * 2);
      ctx.restore();
      // A ring closing in on the body, gone into it as the lunge goes off.
      ctx.strokeStyle = `rgba(255,80,100,${0.5 + 0.5 * t})`;
      ctx.lineWidth = (1.5 + 1.5 * t) * k;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0.5, 24 * (1 - t)) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (b.lunge > 0) {
      ctx.fillStyle = "rgba(255,70,90,0.35)";
      ctx.beginPath();
      ctx.arc(0, 0, 15 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(b.heading);
    // Rears back while winding up.
    if (b.windup > 0) ctx.translate(-4 * (1 - b.windup / Math.max(p.windup, 0.001)) * k, 0);
    wings(ctx, b, k, "rgba(255,190,210,0.45)");
    ctx.fillStyle = b.windup > 0 ? "#ff5a76" : "#e23a5a";
    ctx.strokeStyle = "#5a0f22";
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.moveTo(11 * k, 0);
    ctx.lineTo(-7 * k, -6 * k);
    ctx.lineTo(-3 * k, 0);
    ctx.lineTo(-7 * k, 6 * k);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // The eye dims while it recovers.
    ctx.fillStyle = b.recover > 0 ? "#8a7a80" : "#ffe066";
    ctx.beginPath();
    ctx.arc(4 * k, 0, 1.6 * k, 0, Math.PI * 2);
    ctx.fill();
  },
};
