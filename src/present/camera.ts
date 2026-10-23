import type { World } from "../game/world";
import { ISLAND_TOP } from "../world/island";
import type { PlayerPresenter } from "./player";

// The camera: it trails behind and slides in toward the player, leading their flight, and rises a
// bit with high jumps. Hits and blasts shake it.

export class Camera {
  x = 0;
  y = 0;
  h = 0;
  /** Shake left (s); the renderer jitters the view by it. */
  shake = 0;
  private w: World | null = null;

  attach(w: World, view: PlayerPresenter) {
    this.w = w;
    this.x = view.x;
    this.y = view.y;
    this.h = w.params.camera.view.height;
    this.shake = 0;
    w.events.after("hurt", () => (this.shake = 0.35), { owner: w.lifetime });
    w.events.after("pushed", (e) => (this.shake = Math.max(this.shake, e.hard ? 0.9 : 0.5)), { owner: w.lifetime });
  }

  /** Follow by world time `dt`. */
  update(view: PlayerPresenter, dt: number) {
    const w = this.w!;
    const p = w.player;
    const v = w.params.camera.view;
    this.shake = Math.max(0, this.shake - dt);
    const tx = view.x + p.vx * v.lookAhead;
    const ty = view.y + p.vy * v.lookAhead;
    const ck = 1 - Math.exp(-v.followSpeed * dt);
    this.x += (tx - this.x) * ck;
    this.y += (ty - this.y) * ck;
    const th = v.height + Math.max(0, p.alt - ISLAND_TOP) * 0.8;
    this.h += (th - this.h) * (1 - Math.exp(-1.5 * dt));
  }
}
