import type { World } from "../game/world";
import { rumble } from "../input/gamepad";
import type { Hearing } from "./hearing";

// Rumble: an actuator on the pad, driven by the world's events like sound is. Another device's
// outputs (lights, haptics) would be a presenter like this one.

export class RumblePresenter {
  /** `enabled`: whether to rumble now (playing with a pad). */
  constructor(
    private heard: Hearing,
    private enabled: () => boolean,
  ) {}

  attach(w: World) {
    const owner = { owner: w.lifetime };
    const r = (strong: number, weak: number, ms: number) => {
      if (this.enabled()) rumble(strong, weak, ms);
    };
    const on = w.events.after.bind(w.events);
    on("hurt", () => r(0.7, 0.5, 220), owner);
    on("pushed", (e) => r(1, e.hard ? 1 : 0.6, e.hard ? 450 : 320), owner);
    on("doubleJump", () => r(0.15, 0.2, 60), owner);
    on("land", (e) => r(0, Math.min(0.5, e.speed / 1500), 60), owner);
    on("netBounce", () => r(0.3, 0.3, 120), owner);
    on("lost", () => r(0.4, 0, 250), owner);
    on("charged", () => r(0, 0.25, 50), owner);
    on("hit", (e) => {
      if (e.kind === "queen" && e.killed) r(1, 1, 700);
      else r(e.killed ? 0.45 : 0.2, e.killed ? 0.6 : 0.45, e.killed ? 140 : 80);
    }, owner);
    on("explode", (e) => {
      const g = this.heard(e.x, e.y, e.alt).gain;
      if (g > 0.01) r(0.6 * g, 0.3 * g, 200);
    }, owner);
    on("queenBlast", (e) => {
      const g = this.heard(e.x, e.y, e.alt).gain;
      if (g > 0.01) r(0.8 * g, 0.5 * g, 260);
    }, owner);
  }
}
