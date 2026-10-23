import type { Session } from "../game/session";
import type { World } from "../game/world";
import type { Camera } from "../present/camera";
import type { PlayerPresenter } from "../present/player";
import type { Vfx } from "../present/vfx";
import type { Painter } from "./painter";

// What a frame is drawn from: the world (read only) and the presentation state built around it.

export interface Scene {
  session: Session;
  world: World;
  view: PlayerPresenter;
  vfx: Vfx;
  camera: Camera;
  /** World time, for drifting haze and pulses. */
  time: number;
  /** Debug layers switched on, by id. */
  debug: ReadonlySet<string>;
}

/** Something drawn in the world, sorted by altitude with everything else. */
export interface Drawable {
  alt: number;
  draw: () => void;
}

/** A layer adds drawables to the world's altitude-sorted list. */
export type WorldLayer = (p: Painter, s: Scene, out: Drawable[]) => void;

/** An overlay draws on top of the sorted world, in screen space or projected. */
export type Overlay = (p: Painter, s: Scene) => void;

/** Enemies and orbs out of hit height from the player (see combat/hitbox.ts) are faded. */
export const OUT_OF_HEIGHT_ALPHA = 0.4;
