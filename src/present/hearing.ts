import type { World } from "../game/world";
import type { Projector } from "../render/projection";

/** Loudness and stereo position of something at a world position. */
export interface Heard {
  gain: number;
  pan: number;
}

/** How loud something at (x, y, alt) is, heard from the player, and where on screen it is. */
export type Hearing = (x: number, y: number, alt: number) => Heard;

export function hearing(w: () => World, proj: Projector, width: () => number): Hearing {
  return (x, y, alt) => {
    const world = w();
    const p = world.player;
    const d = Math.hypot(x - p.x, y - p.y);
    const gain = Math.max(0, 1 - d / world.params.audio.volume.hearing) ** 1.5;
    const pr = proj.project(x, y, alt);
    const W = width();
    const pan = pr.visible ? Math.max(-1, Math.min(1, (pr.x - W / 2) / (W / 2))) * 0.8 : 0;
    return { gain, pan };
  };
}
