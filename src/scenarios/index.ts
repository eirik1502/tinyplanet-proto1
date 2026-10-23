import { resolveFlock, MELEE_PACK, SKIRMISHERS, BOMBER_RUN, ROYAL_GUARD } from "../enemies/flocks";
import type { Scenario } from "../game/scenario";

// Scenarios for testing: a fixed planet with fixed enemies. Add one by adding an entry here.

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
    weapons: ["sword", "spear"],
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
    weapons: ["sword", "spear"],
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
    weapons: ["sword", "spear"],
  },
};

/** The perks on: try the upgrades. */
const perks: Scenario = {
  id: "perks",
  name: "Perk test",
  blurb: "Every perk, against a couple of melee packs.",
  seed: 99,
  spec: {
    ...meleeDrill.spec,
    flocks: [resolveFlock(MELEE_PACK), resolveFlock(MELEE_PACK)],
    perks: ["longBlade", "heavySmash", "quickSpear", "landingShockwave", "bounceBlast"],
  },
};

export const SCENARIOS: Scenario[] = [movement, meleeDrill, mixed, perks];

export const scenario = (id: string) => SCENARIOS.find((s) => s.id === id) ?? null;
