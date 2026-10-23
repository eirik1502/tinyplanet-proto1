import type { BoidSprite } from "./index";
import type { BomberParams } from "../../enemies/bomber";
import { wings } from "./wings";

export const BOMBER_SPRITE: BoidSprite<BomberParams> = {
  color: "#ffa040",

  draw(ctx, b, k) {
    ctx.rotate(b.heading);
    wings(ctx, b, k, "rgba(255,215,160,0.45)");
    // A dark bulb with a fuse that sparks faster once its flock has found the player.
    const rate = b.flock.engaged ? 18 : 5;
    const blink = 0.5 + 0.5 * Math.sin(b.phase * rate);
    ctx.fillStyle = "#3a2a24";
    ctx.strokeStyle = "#ff9a3c";
    ctx.lineWidth = 1.4 * k;
    ctx.beginPath();
    ctx.arc(0, 0, 8 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(255,${150 + 90 * blink},60,${0.5 + 0.5 * blink})`;
    for (const [ox, r] of [[-3, 2.5 + 1.5 * blink], [3, 1.5 + blink]] as const) {
      ctx.beginPath();
      ctx.arc(ox * k, 0, r * k, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
