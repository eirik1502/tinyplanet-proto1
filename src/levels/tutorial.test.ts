import { expect, test } from "bun:test";
import type { Vec } from "../core/math";
import { wrapAngle } from "../core/math";
import { Session } from "../game/session";
import type { World } from "../game/world";
import { NO_INPUT, type Action, type InputFrame } from "../input/types";
import { liveParams } from "../params/store";
import { predictFlight } from "../player/flight";

// The tutorial can be finished: a scripted player hops the islands in order (using a double
// jump where the flight would fall short), beats the training dummies and takes the portal.

/** Plays the tutorial the way it's meant to be played. */
class TutorialPlayer {
  private jumpHeld = false;
  private swordHeld = 0;

  frame(w: World): InputFrame {
    const p = w.player;
    const pressed = new Set<Action>();
    const held = new Set<Action>();
    const dummies = w.swarm.boids.filter((b) => b.hp > 0);
    const last = w.islands.length - 1;
    const fighting = dummies.length > 0 && p.island >= last - 1;
    const portal = w.portal!;

    // Where to go: the next island, the nearest dummy, or the portal.
    let to: Vec;
    let toIsland: number | null = null;
    if (fighting) {
      const d = dummies.reduce((a, b) => (Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? a : b));
      to = { x: d.x, y: d.y };
    } else if (p.island >= last && portal.open) to = { x: portal.x, y: portal.y };
    else {
      toIsland = Math.min(last, p.island + 1);
      const isl = w.islands[toIsland]!;
      to = { x: isl.cx, y: isl.cy };
    }
    const dx = to.x - p.x;
    const dy = to.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    const move = { x: dx / l, y: dy / l };

    if (p.mode === "hang") {
      this.jumpHeld = false;
      // Climb round until the rim faces the target, then jump.
      const e = w.islands[p.island]!.pointAt(p.s);
      const facing = Math.abs(wrapAngle(Math.atan2(e.ny, e.nx) - Math.atan2(dy, dx))) < 0.15;
      if (facing && !p.slide && (!fighting || l < 260)) {
        pressed.add("jump");
        this.jumpHeld = true;
      }
    } else if (p.mode === "air") {
      // Hold the jump for full height, double jump when the flight won't reach the target island.
      if (this.jumpHeld && p.vz > 0) held.add("jump");
      else this.jumpHeld = false;
      if (p.airJumps > 0 && p.vz < 0 && toIsland !== null) {
        const { landing } = predictFlight(w, p);
        const lands = landing && w.islands[toIsland]!.closest(landing.x, landing.y).d < 20;
        if (!lands) {
          pressed.add("jump");
          held.add("jump");
          this.jumpHeld = true;
        }
      }
      // Quick sword taps at dummies in reach.
      if (fighting && l < 110 && this.swordHeld <= 0 && !w.attacks.aim && w.attacks.ready("sword")) {
        pressed.add("sword");
        this.swordHeld = 2;
      }
    }
    if (this.swordHeld > 0) {
      this.swordHeld--;
      held.add("sword");
    }
    if (this.jumpHeld) held.add("jump");
    return { ...NO_INPUT, move, pressed, held };
  }
}

test("the tutorial can be finished", () => {
  const session = new Session(liveParams, { skipBriefings: true });
  session.start({ kind: "normal", level: 0, template: null });
  const w = session.world;
  const visited = new Set<number>();
  let entered = false;
  w.events.on("land", () => visited.add(w.player.island));
  w.events.on("portalEnter", () => (entered = true));
  const player = new TutorialPlayer();
  const dt = 1 / 60;
  for (let i = 0; i < 180 / dt && !w.outcome; i++) {
    session.step(dt, player.frame(w));
    w.events.flush();
  }
  expect([...visited].sort()).toEqual([1, 2, 3, 4, 5]);
  expect(w.swarm.boids.length).toBe(0);
  expect(entered).toBe(true);
  expect(w.outcome).toBe("victory");
});
