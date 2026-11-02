import { expect, test } from "bun:test";
import { Session } from "../game/session";
import { NO_INPUT, type Action } from "../input/types";
import { liveParams } from "../params/store";
import { HitVolume } from "../combat/components";

// From a rim, the spear throws any way, over the island it hangs on.

test("a spear thrown from a rim into the island flies over it", () => {
  const session = new Session(liveParams, { skipBriefings: true });
  session.start({ kind: "normal", level: 3, template: null });
  const w = session.world;
  const p = w.player;
  const e = w.islands[p.island]!.pointAt(p.s);
  const inward = { x: -e.nx, y: -e.ny };
  const frame = (pressed: Action[], held: Action[]) => ({ ...NO_INPUT, aimMode: "pointer" as const, aim: inward, pressed: new Set(pressed), held: new Set(held) });
  session.step(1 / 60, frame(["spear"], ["spear"]));
  session.step(1 / 60, frame([], ["spear"]));
  expect(w.attacks.aim!.angle).toBeCloseTo(Math.atan2(inward.y, inward.x));
  session.step(1 / 60, frame([], []));
  const spear = w.objects.query(HitVolume).find(([, v]) => v.weapon === "spear")?.[0];
  expect(spear).toBeDefined();
  const thuds: unknown[] = [];
  w.events.on("thud", (t) => thuds.push(t));
  const isl = w.islands[p.island]!;
  let crossed = false;
  for (let i = 0; i < 120 && spear!.alive; i++) {
    session.step(1 / 60, frame([], []));
    w.events.flush();
    if (isl.contains(spear!.x, spear!.y)) crossed = true;
  }
  expect(crossed).toBe(true);
  expect(thuds.length).toBe(0);
});
