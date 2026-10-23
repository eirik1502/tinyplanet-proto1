import { GameObject } from "../core/object";
import { ISLAND_TOP } from "../world/island";

// The player as a game object: where they are (hanging on a rim, in the air, or lost in the
// haze) and what their movement keeps track of. Health and the hurtbox are components; the
// movement controller and the attack controller drive it.

export type PlayerMode = "hang" | "air" | "lost";

/** Altitude while hanging on a rim. */
export const HANG_ALT = ISLAND_TOP - 9;
/** Flight below this altitude is lost in the haze. */
export const LOST_ALT = ISLAND_TOP - 80;

export class Player extends GameObject {
  mode: PlayerMode = "hang";
  /** The island hung on, and the rim parameter there. */
  island = 0;
  s = 0;
  /** Jump still held since the last jump: releasing early cuts it short. */
  jumpHeld = false;
  /** Double jumps left (0 or 1): one per flight, refilled by hits in the air. */
  airJumps = 0;
  /** The safety bounce below the rim is spent until the next grab. */
  netUsed = false;
  /** 0..1 slow-motion budget. */
  focus = 1;
  /** Hit-stop left (s, real time): a frozen player doesn't move. */
  freeze = 0;
  /** After this hit-stop, turn the flight toward the input (sword hits). */
  redirect = false;
  /** Speed along the rim (per s) after a fast grab. */
  slide = 0;
  launchIsland = -1;
  airTime = 0;
  lostTimer = 0;
  /** Last safe grip, for respawning after falling into the haze. */
  safeIsland = 0;
  safeS = 0;
  /** World angle pointing from the player to the rim (or the flight direction). */
  facing = 0;
  /** Invulnerable for this long after a hit (s). */
  invuln = 0;

  constructor() {
    super("player");
    this.alt = HANG_ALT;
  }
}
