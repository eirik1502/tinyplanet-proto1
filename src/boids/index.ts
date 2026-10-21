import { BOMBER } from "./bomber";
import { MELEE } from "./melee";
import { QUEEN } from "./queen";
import { RANGED } from "./ranged";
import type { BaseParams, BoidType } from "./types";

// Every boid type, by id. Swarm members are the flocking types; the queen is the level's boss.

export const BOID_TYPES = { melee: MELEE, ranged: RANGED, bomber: BOMBER, queen: QUEEN } as const;
export type BoidTypeId = keyof typeof BOID_TYPES;
/** Types that fly in flocks (everything but the queen). */
export type MemberTypeId = Exclude<BoidTypeId, "queen">;
export const MEMBER_TYPES: MemberTypeId[] = ["melee", "ranged", "bomber"];

export const boidType = (id: BoidTypeId) => BOID_TYPES[id] as unknown as BoidType<BaseParams>;
