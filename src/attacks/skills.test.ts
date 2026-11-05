import { expect, test } from "bun:test";
import { mulberry32 } from "../core/rng";
import { Session } from "../game/session";
import { NO_INPUT, type Action } from "../input/types";
import { makeParams } from "../params/store";
import { loadoutFor } from ".";
import { offer, SKILL_IDS, SKILLS, type SkillLevels } from "./skills";

// Skills: what's offered after a win, what the loadout gets from them, and the pick between levels.

const maxed = (): SkillLevels => Object.fromEntries(SKILL_IDS.map((id) => [id, SKILLS[id].steps.length]));

test("offers are distinct, never the smash before the thrust, and include an unlock while one is left", () => {
  for (let seed = 0; seed < 200; seed++) {
    const o = offer({ swipe: 1 }, mulberry32(seed));
    expect(o.length).toBe(3);
    expect(new Set(o).size).toBe(3);
    expect(o).not.toContain("smash");
    expect(o.some((id) => id === "thrust" || id === "spear")).toBe(true);
  }
  const all = maxed();
  expect(offer(all, Math.random)).toEqual([]);
  // Only what isn't maxed is left: fewer than three.
  expect(offer({ ...all, spear: 2, landing: 0 }, mulberry32(1)).sort()).toEqual(["landing", "spear"]);
  // Once the thrust is owned, the smash can come up.
  expect(Array.from({ length: 50 }, (_, seed) => offer({ swipe: 1, thrust: 1 }, mulberry32(seed))).some((o) => o.includes("smash"))).toBe(true);
});

test("the sword has only the strikes owned, in combo order", () => {
  const strikes = (s: SkillLevels) => loadoutFor(s).weapons.find((w) => w.id === "sword")?.attacks.map((a) => a.id);
  expect(strikes({ swipe: 1 })).toEqual(["sword.swipe"]);
  expect(strikes({ swipe: 1, thrust: 1 })).toEqual(["sword.swipe", "sword.thrust"]);
  expect(strikes({ swipe: 1, thrust: 1, smash: 1 })).toEqual(["sword.swipe", "sword.thrust", "sword.smash"]);
  expect(loadoutFor({ swipe: 1 }).weapons.map((w) => w.id)).toEqual(["sword"]);
  expect(loadoutFor({ swipe: 1, spear: 1 }).weapons.map((w) => w.id)).toEqual(["sword", "spear"]);
});

test("upgrades change the stats the attacks read", () => {
  const params = makeParams();
  const session = new Session(params, { skipBriefings: true, seed: 3 });
  session.start({ kind: "normal", level: 1, template: null, skills: { swipe: 4 } });
  const sw = session.world.attacks.stats("sword");
  expect(sw.cooldown).toBeCloseTo(params.player.sword.cooldown * params.skills.swipe.cooldown);
  expect(sw.knockback).toBeCloseTo(params.player.sword.knockback * params.skills.swipe.knockback);
  expect(sw.range).toBeCloseTo(params.player.sword.range * params.skills.swipe.range);
});

test("a win offers skills; the one picked is there on the next level, and stays through a defeat", () => {
  const session = new Session(makeParams(), { seed: 5 });
  session.start({ kind: "normal", level: 1, template: null });
  const confirm = { ...NO_INPUT, pressed: new Set<Action>(["confirm"]) };
  session.closeBriefing();
  session.world.end("victory");
  for (let i = 0; i < 400 && session.state !== "pick"; i++) session.step(1 / 60, NO_INPUT);
  expect(session.state).toBe("pick");
  expect(session.offer.length).toBe(3);
  session.step(1 / 60, { ...NO_INPUT, move: { x: 1, y: 0 } });
  expect(session.choice).toBe(1);
  const picked = session.offer[1]!;
  for (let i = 0; i < 30; i++) session.step(1 / 60, NO_INPUT);
  session.step(1 / 60, confirm);
  expect(session.level).toBe(2);
  expect(session.state).toBe("briefing");
  expect(session.world.skill(picked)).toBe(1);
  expect(session.briefingData().fresh).toContain(picked);

  session.closeBriefing();
  session.world.end("defeat");
  for (let i = 0; i < 400 && session.level === 2 && session.state !== "briefing"; i++) session.step(1 / 60, NO_INPUT);
  expect(session.level).toBe(2);
  expect(session.world.skill(picked)).toBe(1);
});

test("headless, a win picks a skill at random and moves on", () => {
  const session = new Session(makeParams(), { skipBriefings: true, seed: 8 });
  session.start({ kind: "normal", level: 1, template: null });
  session.world.end("victory");
  for (let i = 0; i < 400 && session.level === 1; i++) session.step(1 / 60, NO_INPUT);
  expect(session.level).toBe(2);
  const owned = SKILL_IDS.filter((id) => session.world.skill(id) > 0);
  expect(owned.length).toBe(2);
});

test("the tutorial has the swipe only, and winning it leads straight to level 1", () => {
  const session = new Session(makeParams(), { skipBriefings: true, seed: 2 });
  session.start({ kind: "normal", level: 0, template: null });
  expect(session.world.attacks.weapons.map((w) => w.attacks.length)).toEqual([1]);
  session.world.end("victory");
  for (let i = 0; i < 400 && session.level === 0; i++) session.step(1 / 60, NO_INPUT);
  expect(session.level).toBe(1);
  expect(SKILL_IDS.filter((id) => session.world.skill(id) > 0)).toEqual(["swipe"]);
});
