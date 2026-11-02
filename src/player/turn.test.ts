import { expect, test } from "bun:test";
import { Session } from "../game/session";
import { NO_INPUT, type InputFrame } from "../input/types";
import { liveParams } from "../params/store";

// After a sword hit in the air, a clearly tilted stick (during the hit-stop or just after) turns
// the flight: a short hold while the backflip starts, then off the new way at the same speed.

/** The player flying straight out from their rim at 400, along `n`, high above the rims. */
function airborne() {
  const session = new Session(liveParams, { skipBriefings: true });
  session.start({ kind: "normal", level: 1, template: null });
  const w = session.world;
  const p = w.player;
  const e = w.islands[p.island]!.pointAt(p.s);
  const n = { x: e.nx, y: e.ny };
  Object.assign(p, { mode: "air", x: e.x + n.x * 40, y: e.y + n.y * 40, alt: 300, vx: n.x * 400, vy: n.y * 400, vz: 0, airTime: 1 });
  const swordHit = () =>
    w.events.emit("hit", { source: p.id, target: -1, kind: "melee", damage: 2, killed: false, weapon: "sword", x: p.x, y: p.y, alt: p.alt });
  const step = (move = { x: 0, y: 0 }) => {
    const frame: InputFrame = { ...NO_INPUT, move };
    session.step(1 / 60, frame);
    w.events.flush();
  };
  const along = () => p.vx * n.x + p.vy * n.y;
  return { w, p, n, swordHit, step, along };
}

test("tilting back on a sword hit turns the flight after a short hold", () => {
  const { w, p, n, swordHit, step, along } = airborne();
  const turns: number[] = [];
  w.events.on("turn", (e) => turns.push(e.angle));
  swordHit();
  const back = { x: -n.x, y: -n.y };
  while (p.freeze > 0) step(back);
  step(back);
  expect(turns.length).toBe(1);
  expect(p.turn).not.toBeNull();
  const x = p.x;
  step(back);
  expect(p.x).toBe(x);
  for (let i = 0; i < 20 && p.turn; i++) step(back);
  expect(p.turn).toBeNull();
  expect(along()).toBeCloseTo(-400);
});

test("no turn without a tilt, along the flight, barely tilted, or after the window", () => {
  for (const [k, side, wait] of [
    [0, 0, 0],
    [1, 0.3, 0],
    [-0.3, 0, 0],
    [-1, 0, 12],
  ] as const) {
    const { w, p, n, swordHit, step } = airborne();
    let turned = false;
    w.events.on("turn", () => (turned = true));
    const move = { x: n.x * k - n.y * side, y: n.y * k + n.x * side };
    swordHit();
    while (p.freeze > 0) step();
    for (let i = 0; i < wait; i++) step();
    for (let i = 0; i < 5; i++) step(move);
    expect(turned).toBe(false);
  }
});
