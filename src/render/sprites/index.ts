import type { BaseParams, BoidType } from "../../enemies/types";
import { BOMBER_SPRITE } from "./bomber";
import { MELEE_SPRITE } from "./melee";
import { QUEEN_SPRITE } from "./queen";
import { RANGED_SPRITE } from "./ranged";

// Boid sprites, one per type, drawn at the origin of `ctx` with `k` screen px per world unit. Each
// type draws its own body at size 1; `drawBoidBody` scales it by the boid's size and adds the hit
// flash. Shared by the game view and the briefing's portraits.

/** What a sprite needs to know about its boid (the briefing's portraits make these up). */
export interface BoidLook<P extends BaseParams = BaseParams> {
  id: number;
  heading: number;
  phase: number;
  lunge: number;
  cooldown: number;
  windup: number;
  recover: number;
  flash: number;
  params: P;
  flock: { engaged: boolean };
}

export interface BoidSprite<P extends BaseParams = BaseParams> {
  /** Hit sparks, briefing card tint. */
  color: string;
  /** The body at the origin, facing +x after `heading`, at `k` px per world unit and size 1. */
  draw(ctx: CanvasRenderingContext2D, b: BoidLook<P>, k: number): void;
}

/** The sprite for each boid type, by id. */
export const SPRITES = {
  melee: MELEE_SPRITE,
  ranged: RANGED_SPRITE,
  bomber: BOMBER_SPRITE,
  queen: QUEEN_SPRITE,
} as unknown as Record<string, BoidSprite>;

/** A boid type's colour. */
export const boidColor = (id: string) => SPRITES[id]?.color ?? "#ffffff";

export function drawBoidBody(ctx: CanvasRenderingContext2D, type: BoidType<BaseParams>, b: BoidLook, k: number) {
  const ks = k * b.params.size;
  ctx.save();
  SPRITES[type.id]?.draw(ctx, b, ks);
  ctx.restore();
  if (b.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(b.flash / 0.15) * 0.85})`;
    ctx.beginPath();
    ctx.arc(0, 0, type.radius * 1.2 * ks, 0, Math.PI * 2);
    ctx.fill();
  }
}
