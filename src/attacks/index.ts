import { LUNGE } from "./lunge";
import { level, type SkillLevels } from "./skills";
import { SPEAR } from "./spear";
import { POKE, SMASH, SWIPE, SWORD } from "./sword";
import type { Loadout, Weapon, WeaponId } from "./types";

// Every weapon, by id, in the order presses are checked and the briefing lists them.

export const WEAPONS: Record<WeaponId, Weapon> = { sword: SWORD, lunge: LUNGE, spear: SPEAR };
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/**
 * The loadout for a set of skills: the sword with the strikes owned (the swipe, then the poke,
 * then the smash: the combo runs through them in order), and the lunge and the spear if owned.
 */
export function loadoutFor(skills: SkillLevels = {}): Loadout {
  const weapons: Weapon[] = [];
  if (level(skills, "swipe") > 0) {
    const attacks = [SWIPE];
    if (level(skills, "poke") > 0) attacks.push(POKE);
    if (level(skills, "smash") > 0) attacks.push(SMASH);
    weapons.push({ ...SWORD, attacks });
  }
  if (level(skills, "lunge") > 0) weapons.push(LUNGE);
  if (level(skills, "spear") > 0) weapons.push(SPEAR);
  return { weapons, skills: { ...skills } };
}

export { SKILLS, SKILL_IDS } from "./skills";
export type { Skill, SkillId, SkillLevels } from "./skills";
export type { Loadout, Weapon, WeaponId } from "./types";
