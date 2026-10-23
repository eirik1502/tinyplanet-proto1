import { PERKS } from "./perks";
import { SPEAR } from "./spear";
import { SWORD } from "./sword";
import type { Loadout, Weapon, WeaponId } from "./types";

// Every weapon, by id, in the order presses are checked and the briefing lists them.

export const WEAPONS: Record<WeaponId, Weapon> = { sword: SWORD, spear: SPEAR };
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/** The loadout for a level's weapons and perks (unknown perk ids are skipped). */
export function loadoutFor(weapons: WeaponId[], perks: string[] = []): Loadout {
  return {
    weapons: WEAPON_IDS.filter((id) => weapons.includes(id)).map((id) => WEAPONS[id]),
    perks: perks.flatMap((id) => (PERKS[id] ? [PERKS[id]] : [])),
  };
}

export { PERKS } from "./perks";
export type { Loadout, Perk, Weapon, WeaponId } from "./types";
