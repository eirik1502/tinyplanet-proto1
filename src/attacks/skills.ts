import { component, GameObject } from "../core/object";
import type { Rng } from "../core/rng";
import type { World } from "../game/world";
import type { Params } from "../params/store";
import type { StatGroup } from "./types";

// Skills: what the player builds up over a run. After each level they pick one of three offered
// skills, and it goes up a step. Attack skills start at the attack itself (step 1 unlocks it),
// then three upgrades; passive skills add to the movement abilities in three steps. A skill
// changes stats (`modify`, for the attacks' stat groups), adds behaviour by listening to the
// world's events (`install`), keeps a system of its own going (`update`), or is read where it
// matters (the thrust's lunge, the double jump's speed). Its numbers are the `skills.*` params.

export type SkillId = "swipe" | "thrust" | "smash" | "spear" | "landing" | "safetyDoom" | "jumpForce";
/** Each skill's step: 0 (or missing) is not owned. */
export type SkillLevels = Partial<Record<SkillId, number>>;
export type SkillIcon = "sword" | "lunge" | "smash" | "spear" | "landing" | "net" | "jump";

export interface Skill {
  id: SkillId;
  name: string;
  /** Attacks: step 1 unlocks it. Passives: upgrade the movement abilities. */
  kind: "attack" | "passive";
  /** Offered only once this one is owned. */
  requires?: SkillId;
  icon: SkillIcon;
  /** What each step adds, in a few words. */
  steps: string[];
  /** Change a stat group's values (a copy) before an attack or indicator reads them. */
  modify?(group: StatGroup, s: Record<string, number>, level: number, params: Params): void;
  /** Add behaviour to a world: listen to its events (with `owner: world.lifetime`). */
  install?(w: World, level: number): void;
  /** Every world step, after the swarm moved. */
  update?(w: World, dt: number, level: number): void;
}

/** The skill levels a normal run starts with. */
export const START_SKILLS: SkillLevels = { swipe: 1 };

export const level = (skills: SkillLevels, id: SkillId) => skills[id] ?? 0;

const scale = (s: Record<string, number>, keys: string[], k: number) => {
  for (const key of keys) s[key] = s[key]! * k;
};

/**
 * A blast of the player's around (x, y): hurts and throws back every enemy within `radius`, more
 * the closer. `stun` staggers the boids it reaches.
 */
function playerBlast(w: World, x: number, y: number, alt: number, o: { radius: number; damage: number; push: number; kind: string; stun?: number }) {
  const p = w.player;
  w.events.emit("blast", { source: p.id, x, y, alt, radius: o.radius, kind: o.kind });
  w.combat.blast({ x, y, alt, radius: o.radius }, "player", (t, h) => {
    const dx = t.x - x;
    const dy = t.y - y;
    const d = Math.hypot(dx, dy) || 1;
    const near = 1 - Math.min(1, d / o.radius);
    h.hit({ damage: o.damage * near, fromX: x, fromY: y, source: p.id, weapon: "blast", attack: o.kind, stun: o.stun });
    h.push((dx / d) * o.push * (0.5 + 0.5 * near), (dy / d) * o.push * (0.5 + 0.5 * near), 0);
  });
}

// ---------------------------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------------------------

const SWIPE: Skill = {
  id: "swipe",
  name: "Swipe",
  kind: "attack",
  icon: "sword",
  steps: ["A wide sword swipe.", "The sword recovers faster.", "The swipe throws enemies further.", "The swipe reaches further."],
  modify(group, s, lv, params) {
    const k = params.skills.swipe;
    if (group !== "sword") return;
    if (lv >= 2) scale(s, ["cooldown"], k.cooldown);
    if (lv >= 3) scale(s, ["knockback"], k.knockback);
    if (lv >= 4) scale(s, ["range", "maxRange"], k.range);
  },
};

const THRUST: Skill = {
  id: "thrust",
  name: "Lunging thrust",
  kind: "attack",
  icon: "lunge",
  steps: [
    "Hit with the swipe to chain a thrust that lunges at the closest enemy in reach.",
    "The lunge goes through to the furthest enemy, striking all on the way.",
    "The lunge is instant.",
    "The thrust reaches twice as far.",
  ],
  modify(group, s, lv, params) {
    if (group === "thrust" && lv >= 4) scale(s, ["length", "maxLength"], params.skills.thrust.range);
  },
};

const SMASH: Skill = {
  id: "smash",
  name: "Smash",
  kind: "attack",
  requires: "thrust",
  icon: "smash",
  steps: [
    "Hit with the thrust to chain a smash, whose blast throws back everything around it.",
    "The smash's blast is bigger.",
    "The smash itself is bigger.",
    "The smash's blast throws three times as hard.",
  ],
  modify(group, s, lv, params) {
    const k = params.skills.smash;
    if (group !== "smash") return;
    if (lv >= 2) scale(s, ["blastRadius"], k.blastRadius);
    if (lv >= 3) scale(s, ["size", "maxSize"], k.size);
    if (lv >= 4) scale(s, ["blastPush"], k.blastPush);
  },
};

const SPEAR: Skill = {
  id: "spear",
  name: "Spear",
  kind: "attack",
  icon: "spear",
  steps: ["A thrown spear, any way from a rim.", "The spear flies further.", "The spear flies faster.", "The spear is twice the size."],
  modify(group, s, lv, params) {
    const k = params.skills.spear;
    if (group !== "spear") return;
    if (lv >= 2) scale(s, ["life"], k.range / (lv >= 3 ? k.speed : 1));
    if (lv >= 3) scale(s, ["speed", "maxSpeed"], k.speed);
    if (lv >= 4) scale(s, ["size"], k.size);
  },
};

// ---------------------------------------------------------------------------------------------
// Passives
// ---------------------------------------------------------------------------------------------

const LANDING: Skill = {
  id: "landing",
  name: "Landing hard",
  kind: "passive",
  icon: "landing",
  steps: ["Hard landings throw back enemies around you.", "Every landing does, wider.", "Landings stun the enemies they throw, and throw harder."],
  install(w, lv) {
    const k = w.params.skills.landing;
    w.events.on(
      "land",
      (e) => {
        if (lv < 2 && e.speed <= k.minSpeed) return;
        playerBlast(w, e.x, e.y, e.alt, {
          radius: k.radius * (lv >= 2 ? k.growth : 1),
          damage: k.damage,
          push: k.push * (lv >= 3 ? k.pushUp : 1),
          stun: lv >= 3 ? k.stun : undefined,
          kind: "landing",
        });
      },
      { source: w.player.id, owner: w.lifetime },
    );
  },
};

/** A black hole left by the safety bounce: it pulls enemies in, then blows up. */
interface BlackHole {
  t: number;
  delay: number;
  pullRadius: number;
  radius: number;
  push: number;
}
const BlackHole = component<BlackHole>("blackHole");

const SAFETY_DOOM: Skill = {
  id: "safetyDoom",
  name: "Safety doom",
  kind: "passive",
  icon: "net",
  steps: [
    "The safety bounce explodes, hurting what's around you.",
    "It leaves a black hole that pulls enemies in, then explodes.",
    "The black hole pulls from further, and explodes harder.",
  ],
  install(w, lv) {
    const k = w.params.skills.safetyDoom;
    const grow = lv >= 3 ? k.growth : 1;
    w.events.on(
      "netBounce",
      (e) => {
        if (lv < 2) {
          playerBlast(w, e.x, e.y, e.alt, { radius: k.radius, damage: k.damage, push: k.push, kind: "safetyDoom" });
          return;
        }
        const o = w.objects.add(new GameObject("blackHole"));
        Object.assign(o, { x: e.x, y: e.y, alt: e.alt });
        const hole = o.add(BlackHole, { t: 0, delay: k.delay, pullRadius: k.pullRadius * grow, radius: k.radius * grow, push: k.push * grow });
        w.events.emit("blackHole", { source: w.player.id, x: o.x, y: o.y, alt: o.alt, radius: hole.pullRadius, dur: hole.delay });
      },
      { source: w.player.id, owner: w.lifetime },
    );
  },
  update(w, dt) {
    const k = w.params.skills.safetyDoom;
    for (const [o, hole] of w.objects.query(BlackHole)) {
      hole.t += dt;
      if (hole.t >= hole.delay) {
        playerBlast(w, o.x, o.y, o.alt, { radius: hole.radius, damage: k.damage, push: hole.push, kind: "safetyDoom" });
        w.objects.destroy(o);
        continue;
      }
      // Pull harder the closer they are.
      w.combat.blast({ x: o.x, y: o.y, alt: o.alt, radius: hole.pullRadius }, "player", (t, h) => {
        const dx = o.x - t.x;
        const dy = o.y - t.y;
        const d = Math.hypot(dx, dy) || 1;
        const pull = k.pull * dt * (0.4 + 0.6 * (1 - Math.min(1, d / hole.pullRadius)));
        h.push((dx / d) * Math.min(pull, d / Math.max(dt, 1e-3)), (dy / d) * Math.min(pull, d / Math.max(dt, 1e-3)), 0);
      });
    }
  },
};

const JUMP_FORCE: Skill = {
  id: "jumpForce",
  name: "Jump force",
  kind: "passive",
  icon: "jump",
  steps: ["The double jump strikes enemies ahead, throwing them aside.", "The double jump is faster.", "It strikes wider, and throws harder."],
  install(w, lv) {
    const k = w.params.skills.jumpForce;
    const grow = lv >= 3 ? k.growth : 1;
    const p = w.player;
    w.events.on(
      "doubleJump",
      (e) => {
        const sp = Math.hypot(p.vx, p.vy);
        const dx = sp > 1 ? p.vx / sp : Math.cos(p.facing);
        const dy = sp > 1 ? p.vy / sp : Math.sin(p.facing);
        const length = k.length * grow;
        const halfWidth = (k.width * grow) / 2;
        // From a little behind, so what's right beside the player counts too.
        const x = e.x - dx * halfWidth;
        const y = e.y - dy * halfWidth;
        const box = { x, y, alt: e.alt, radius: length + halfWidth, rect: { dx, dy, length: length + halfWidth, halfWidth } };
        w.events.emit("blast", { source: p.id, x: e.x + dx * length * 0.5, y: e.y + dy * length * 0.5, alt: e.alt, radius: length * 0.6, kind: "jumpForce" });
        w.combat.blast(box, "player", (t, h) => {
          // Aside: away from the line of the jump, on whichever side it is.
          const side = dx * (t.y - e.y) - dy * (t.x - e.x) >= 0 ? 1 : -1;
          const push = k.push * (lv >= 3 ? k.pushUp : 1);
          h.hit({ damage: k.damage, fromX: e.x, fromY: e.y, source: p.id, weapon: "blast", attack: "jumpForce", knockback: 0 });
          h.push(-dy * side * push + dx * push * 0.25, dx * side * push + dy * push * 0.25, 0);
        });
      },
      { source: p.id, owner: w.lifetime },
    );
  },
};

/** Every skill, in the order the briefing and the dev panel list them. */
export const SKILLS: Record<SkillId, Skill> = Object.fromEntries(
  [SWIPE, THRUST, SMASH, SPEAR, LANDING, SAFETY_DOOM, JUMP_FORCE].map((s) => [s.id, s]),
) as Record<SkillId, Skill>;
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

/** The double jump's sideways speed with the skills. */
export function airJumpSpeed(w: World) {
  const base = w.params.move.airJump.speed;
  return w.skill("jumpForce") >= 2 ? base * w.params.skills.jumpForce.speed : base;
}

// ---------------------------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------------------------

/** Whether `id` can go up a step: not maxed, and what it needs is owned. */
export function canUpgrade(skills: SkillLevels, id: SkillId) {
  const s = SKILLS[id];
  return level(skills, id) < s.steps.length && (!s.requires || level(skills, s.requires) > 0);
}

/**
 * Up to `n` different skills to choose from, each at its next step. While an attack can still be
 * unlocked, at least one of them is an unlock.
 */
export function offer(skills: SkillLevels, rand: Rng, n = 3): SkillId[] {
  const open = SKILL_IDS.filter((id) => canUpgrade(skills, id));
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [open[i], open[j]] = [open[j]!, open[i]!];
  }
  const out = open.slice(0, n);
  const isUnlock = (id: SkillId) => SKILLS[id].kind === "attack" && level(skills, id) === 0;
  const unlock = open.find(isUnlock);
  if (unlock && !out.some(isUnlock)) out[out.length - 1] = unlock;
  return out;
}

/** Skill levels from text like "swipe=2,spear=1" (unknown skills and bad steps throw). */
export function parseSkills(text: string): SkillLevels {
  const out: SkillLevels = {};
  for (const part of text.split(",").filter(Boolean)) {
    const [id, v] = part.split("=");
    const n = Number(v ?? 1);
    if (!(id! in SKILLS) || !Number.isInteger(n) || n < 0 || n > SKILLS[id as SkillId].steps.length) throw new Error(`bad skill "${part}"`);
    out[id as SkillId] = n;
  }
  return out;
}

/** Skill levels as text, "swipe 2 · spear 1". */
export const describeSkills = (skills: SkillLevels) =>
  SKILL_IDS.filter((id) => level(skills, id) > 0)
    .map((id) => `${id} ${level(skills, id)}`)
    .join(" · ");
