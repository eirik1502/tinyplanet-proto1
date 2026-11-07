import { expect, test } from "bun:test";
import { Hurtable } from "../combat/components";
import { GameObject } from "../core/object";
import { mulberry32 } from "../core/rng";
import { Session } from "../game/session";
import { NO_INPUT, type Action } from "../input/types";
import { makeParams } from "../params/store";
import { scenario } from "../scenarios";
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

test("the instant thrust puts the player at the furthest enemy at once, striking the one on the way", () => {
  const params = makeParams();
  const session = new Session(params, { skipBriefings: true, seed: 4 });
  const drill = scenario("melee-drill")!;
  session.start({ kind: "scenario", scenario: { ...drill, spec: { ...drill.spec, skills: { swipe: 1, thrust: 3 } } } });
  const w = session.world;
  const p = w.player;
  // In the air, still, with two boids straight ahead: one in the swipe's reach, one past it.
  w.playerCtl.leaveRim(0, 0, 0);
  p.alt += 60;
  const [near, far] = w.swarm.boids.filter((b) => b !== w.swarm.queen && b.hp > 0);
  for (const b of w.swarm.boids) if (b !== near && b !== far) b.x += 5000;
  Object.assign(near!, { x: p.x + 30, y: p.y, alt: p.alt, vx: 0, vy: 0 });
  Object.assign(far!, { x: p.x + 75, y: p.y, alt: p.alt, vx: 0, vy: 0 });
  near!.hp = far!.hp = 100;
  const frame = (pressed: Action[], held: Action[]) => ({ ...NO_INPUT, aimMode: "pointer" as const, aim: { x: 1, y: 0 }, pressed: new Set(pressed), held: new Set(held) });
  const hits: string[] = [];
  w.events.on("hit", (e) => hits.push(`${e.target === near!.id ? "near" : "far"}:${e.attack}`));
  const blinks: number[] = [];
  w.events.on("blink", (e) => blinks.push(e.toX - e.x));
  const keepStill = () => Object.assign(p, { vx: 0, vy: 0, vz: 0 });
  // Swipe (hits the near one), then thrust once the combo window is open.
  session.step(1 / 60, frame(["sword"], ["sword"]));
  session.step(1 / 60, frame([], []));
  for (let i = 0; i < 60 && !hits.length; i++) session.step(1 / 60, frame([], []));
  expect(hits).toEqual(["near:sword.swipe"]);
  for (let i = 0; i < 30; i++) session.step(1 / 60, frame([], [])), keepStill();
  Object.assign(near!, { x: p.x + 30, y: p.y, alt: p.alt });
  Object.assign(far!, { x: p.x + 75, y: p.y, alt: p.alt });
  session.step(1 / 60, frame(["sword"], ["sword"]));
  const x0 = p.x;
  session.step(1 / 60, frame([], []));
  expect(blinks.length).toBe(1);
  expect(p.x - x0).toBeGreaterThan(20);
  expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(0.35 * params.player.thrust.lungeSpeed, 0);
  for (let i = 0; i < 3; i++) session.step(1 / 60, frame([], []));
  expect(hits).toContain("near:sword.thrust");
  expect(hits).toContain("far:sword.thrust");
});

test("the spear pierces two enemies at step 2, all on its way at step 4, and burns from step 3", () => {
  const params = makeParams();
  const throwThrough = (spear: number) => {
    const session = new Session(params, { skipBriefings: true, seed: 3 });
    session.start({ kind: "normal", level: 1, template: null, skills: { swipe: 1, spear } });
    const w = session.world;
    for (const [o, h] of w.objects.query(Hurtable)) if (h.team === "swarm") w.objects.destroy(o);
    // A row of dummies ahead, then a spear thrown down it.
    const hit: number[] = [];
    for (let i = 0; i < 4; i++) {
      const o = w.objects.add(new GameObject("dummy"));
      Object.assign(o, { x: 1000 + 40 * i, y: 0, alt: 50 });
      o.add(Hurtable, {
        team: "swarm",
        hurtbox: () => ({ x: o.x, y: o.y, alt: o.alt, radius: 8 }),
        targetable: () => true,
        hit: () => (hit.push(i), true),
        push: () => {},
      });
    }
    const sp = w.attacks.stats("spear");
    w.combat.spawnVolume(
      { team: "player", owner: 0, attack: "spear", shape: { radius: sp.hitRadius }, damage: 1, power: 0, active: Infinity, age: 0, hits: new Set(), projectile: { life: 5, scale: 1, pierce: sp.pierce, flame: sp.flame } },
      { x: 940, y: 0, alt: 50, vx: 300, vy: 0 },
    );
    for (let i = 0; i < 120; i++) w.combat.update(1 / 60);
    return { hit, sp };
  };
  expect(throwThrough(1).hit).toEqual([0]);
  expect(throwThrough(1).sp.flame).toBe(0);
  expect(throwThrough(2).hit).toEqual([0, 1]);
  const s3 = throwThrough(3);
  expect(s3.hit).toEqual([0, 1]);
  expect(s3.sp.flame).toBeGreaterThan(0);
  expect(s3.sp.speed * s3.sp.life).toBeCloseTo(params.player.spear.speed * params.player.spear.life * params.skills.spear.range);
  const s4 = throwThrough(4);
  expect(s4.hit).toEqual([0, 1, 2, 3]);
  expect(s4.sp.hitRadius).toBeCloseTo(params.player.spear.hitRadius * params.skills.spear.size);
  expect(s4.sp.size).toBe(params.player.spear.size);
});
