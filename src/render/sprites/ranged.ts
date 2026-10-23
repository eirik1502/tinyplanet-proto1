import type { BoidSprite } from "./index";
import { KICK, type RangedParams } from "../../enemies/ranged";
import { wings } from "./wings";

export const RANGED_SPRITE: BoidSprite<RangedParams> = {
  color: "#6ff5dd",

  draw(ctx, b, k) {
    const p = b.params;
    const charge = b.windup > 0 ? 1 - b.windup / Math.max(p.windup, 0.001) : 0;
    const kick = b.recover > 0 ? Math.max(0, 1 - (Math.max(p.recover, KICK) - b.recover) / KICK) : 0;
    if (charge > 0) {
      // Light gathering in: a ring closing onto the body.
      ctx.strokeStyle = `rgba(210,255,130,${0.35 + 0.6 * charge})`;
      ctx.lineWidth = (1 + 2 * charge) * k;
      ctx.beginPath();
      ctx.arc(0, 0, (26 - 16 * charge) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.rotate(b.heading);
    if (charge > 0) {
      // A faint sight line toward the player.
      const grad = ctx.createLinearGradient(10 * k, 0, 120 * k, 0);
      grad.addColorStop(0, `rgba(210,255,130,${0.1 + 0.35 * charge})`);
      grad.addColorStop(1, "rgba(210,255,130,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(10 * k, -1.2 * k, 110 * k, 2.4 * k);
    }
    if (kick > 0) {
      // Muzzle flash.
      ctx.fillStyle = `rgba(240,255,190,${kick})`;
      ctx.beginPath();
      ctx.arc(10 * k, 0, (4 + 7 * kick) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    wings(ctx, b, k, "rgba(170,255,240,0.45)");
    // Squashed by the kick, swelling while charging.
    ctx.scale(1 - 0.25 * kick + 0.1 * charge, 1 + 0.15 * kick + 0.1 * charge);
    // Round body whose core brightens as the next shot charges, white-hot just before it fires.
    const ready = charge > 0 ? 1 : 1 - Math.max(0, Math.min(1, b.cooldown / p.cooldown));
    ctx.fillStyle = "#1f8f86";
    ctx.strokeStyle = "#0b3b38";
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.arc(0, 0, 7 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const hot = Math.round(130 + 125 * charge);
    ctx.fillStyle = `rgba(${210 + Math.round(45 * charge)},255,${hot},${0.3 + 0.7 * ready})`;
    ctx.beginPath();
    ctx.arc(1.5 * k, 0, (2.5 + 1.5 * ready + 1.5 * charge) * k, 0, Math.PI * 2);
    ctx.fill();
  },
};
