import type { Vec } from "../core/math";
import { mulberry32, type Rng } from "../core/rng";
import type { World } from "../game/world";
import { ISLAND_TOP } from "../world/island";
import { NO_INPUT, type Action, type InputFrame, type InputSource } from "./types";

// Input sources without a device, for headless runs and tests.

/** Never does anything (but moves on from end-of-round screens). */
export class IdleInput implements InputSource {
  private n = 0;
  poll(): InputFrame {
    return { ...NO_INPUT, pressed: ++this.n % 30 === 0 ? new Set<Action>(["confirm"]) : new Set() };
  }
}

/** Plays back a list of frames, then idles. */
export class ScriptInput implements InputSource {
  private i = 0;
  constructor(private frames: InputFrame[]) {}
  poll(): InputFrame {
    return this.frames[this.i++] ?? NO_INPUT;
  }
}

/**
 * A crude bot: heads for the nearest enemy, hops from island to island toward it, swings the
 * sword when close and throws the spear now and then. Enough to exercise the game, not to win it.
 */
export class BotInput implements InputSource {
  private holds = new Map<Action, number>();
  /** Buttons just let go of stay up a moment, so a release always registers. */
  private rests = new Map<Action, number>();
  private jumpWait = 0;
  private n = 0;
  private rand: Rng;

  constructor(
    private world: () => World,
    seed = 1,
    private dt = 1 / 60,
  ) {
    this.rand = mulberry32(seed);
  }

  poll(): InputFrame {
    const w = this.world();
    const p = w.player;
    const pressed = new Set<Action>();
    const press = (a: Action, hold: number) => {
      if (this.holds.has(a) || this.rests.has(a)) return;
      pressed.add(a);
      this.holds.set(a, hold);
    };
    for (const [a, left] of this.rests) {
      if (left - this.dt <= 0) this.rests.delete(a);
      else this.rests.set(a, left - this.dt);
    }
    for (const [a, left] of this.holds) {
      if (left - this.dt > 0) this.holds.set(a, left - this.dt);
      else {
        this.holds.delete(a);
        this.rests.set(a, 0.1);
      }
    }
    this.jumpWait -= this.dt;
    if (++this.n % 30 === 0) pressed.add("confirm");

    const target = w.swarm.boids
      .filter((b) => b.hp > 0)
      .reduce<{ x: number; y: number; d: number } | null>((best, b) => {
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        return !best || d < best.d ? { x: b.x, y: b.y, d } : best;
      }, null);
    let move: Vec = { x: 0, y: 0 };
    if (target) move = { x: (target.x - p.x) / (target.d || 1), y: (target.y - p.y) / (target.d || 1) };

    if (target && !this.holds.has("sword") && !this.holds.has("spear")) {
      if (target.d < 150 && w.attacks.ready("sword")) press("sword", 0.1 + this.rand() * 0.4);
      else if (target.d < 450 && w.attacks.ready("spear") && this.rand() < 0.03) press("spear", 0.2 + this.rand() * 0.3);
    }
    if (p.mode === "hang" && this.jumpWait <= 0 && (!target || target.d > 110)) {
      press("jump", 0.2 + this.rand() * 0.3);
      this.jumpWait = 0.5 + this.rand();
    } else if (p.mode === "air" && p.airJumps > 0 && p.vz < 0 && p.alt < ISLAND_TOP + 15 && this.rand() < 0.2) {
      press("jump", 0.2);
    }

    return { move, aimMode: "assist", aim: null, pressed, held: new Set(this.holds.keys()) };
  }
}
