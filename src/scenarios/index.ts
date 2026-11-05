import { SKILL_IDS, SKILLS, type SkillLevels } from "../attacks/skills";
import { resolveFlock, MELEE_PACK, SKIRMISHERS, BOMBER_RUN, ROYAL_GUARD } from "../enemies/flocks";
import type { Scenario } from "../game/scenario";
import { TUTORIAL, TUTORIAL_BLURB, TUTORIAL_NAME, TUTORIAL_SEED } from "../levels/tutorial";

// Scenarios for testing: a fixed planet with fixed enemies. Add one by adding an entry here.

/** Every attack, not upgraded. */
const ALL_ATTACKS: SkillLevels = { swipe: 1, thrust: 1, smash: 1, spear: 1 };

/** No enemies to speak of: one far-off melee boid, so the round doesn't end. Jump around and tune the movement. */
const movement: Scenario = {
  id: "movement",
  name: "Movement sandbox",
  blurb: "A roomy planet with a single idle boid far away: tune climbing, jumps and air control.",
  seed: 1234,
  spec: {
    layout: "scatter",
    radius: 900,
    islands: 12,
    placement: "edges",
    queenSpot: "far",
    queen: null,
    flocks: [resolveFlock({ name: "Lone boid", members: [{ type: "melee", count: 1 }], style: { aggroRange: 0, giveUpRange: 0 } })],
    modifiers: [],
    skills: ALL_ATTACKS,
  },
};

/** One melee pack near the start: tune the sword against a predictable flock. */
const meleeDrill: Scenario = {
  id: "melee-drill",
  name: "Melee drill",
  blurb: "One melee pack waiting a hop from the start.",
  seed: 4321,
  spec: {
    layout: "scatter",
    radius: 700,
    islands: 7,
    placement: "nearStart",
    queenSpot: "far",
    queen: null,
    flocks: [resolveFlock(MELEE_PACK)],
    modifiers: [],
    skills: ALL_ATTACKS,
  },
};

/** Every enemy type at once, around a queen. */
const mixed: Scenario = {
  id: "mixed",
  name: "Mixed swarm",
  blurb: "A queen with her guard, a melee pack, skirmishers and bombers.",
  seed: 777,
  spec: {
    layout: "scatter",
    radius: 800,
    islands: 9,
    placement: "anywhere",
    queenSpot: "far",
    queen: { params: { hp: 12 }, escort: resolveFlock(ROYAL_GUARD, () => 0.5) },
    flocks: [resolveFlock(MELEE_PACK), resolveFlock(SKIRMISHERS), resolveFlock(BOMBER_RUN)],
    modifiers: [],
    skills: ALL_ATTACKS,
  },
};

/** Every skill maxed: try the upgrades. */
const skills: Scenario = {
  id: "skills",
  name: "Skill test",
  blurb: "Every skill maxed, against a couple of melee packs.",
  seed: 99,
  spec: {
    ...meleeDrill.spec,
    flocks: [resolveFlock(MELEE_PACK), resolveFlock(MELEE_PACK)],
    skills: Object.fromEntries(SKILL_IDS.map((id) => [id, SKILLS[id].steps.length])),
  },
};

/** The tutorial on its own (it's also level 0 of a normal run). */
const tutorial: Scenario = { id: "tutorial", name: TUTORIAL_NAME, blurb: TUTORIAL_BLURB, seed: TUTORIAL_SEED, spec: TUTORIAL };

export const SCENARIOS: Scenario[] = [movement, meleeDrill, mixed, skills, tutorial];

export const scenario = (id: string) => SCENARIOS.find((s) => s.id === id) ?? null;
