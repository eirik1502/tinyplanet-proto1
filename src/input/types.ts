import type { Vec } from "../core/math";

// The input abstraction. Each frame an InputSource turns whatever device it reads (keys, mouse,
// pad, a script, a bot) into an InputFrame: actions pressed and held, a move direction and an
// aim. The game only ever sees frames, never devices. Outputs to a device (rumble, lights) are
// presenters listening to game events, not part of input.

/**
 * What the player can do with a button. "confirm" (the primary button) starts / resumes from the
 * briefing and moves on from the end-of-round screen; "switchMode" cycles the input mode.
 */
export type Action = "jump" | "sword" | "spear" | "confirm" | "pause" | "mute" | "switchMode";

/**
 * How attacks and jumps are aimed:
 * - "assist": by the move direction, starting at the closest enemy (keyboard).
 * - "move": by the move direction; aim assist yields while it's pushed (analog stick).
 * - "pointer": straight at `aim`, a world direction (mouse cursor).
 */
export type AimMode = "assist" | "move" | "pointer";

export interface InputFrame {
  /** Movement, screen space (y down), length 0..1: a half-pushed stick moves at half effort. */
  move: Vec;
  aimMode: AimMode;
  /** In pointer mode: unit world direction from the player to the pointer, or null when it's right on them. */
  aim: Vec | null;
  pressed: ReadonlySet<Action>;
  held: ReadonlySet<Action>;
}

/** What a source may need from the game to build a frame. */
export interface InputView {
  /** A screen point as a unit world direction from the player (at their altitude), or null on top of them. */
  aimFromScreen(x: number, y: number): Vec | null;
}

export interface InputSource {
  /** This frame's input. Called once per frame, before the step. */
  poll(view: InputView): InputFrame;
  /** Forget everything held and pressed (so the button that started a level doesn't also jump). */
  clear?(): void;
}

export const NO_INPUT: InputFrame = { move: { x: 0, y: 0 }, aimMode: "assist", aim: null, pressed: new Set(), held: new Set() };

/** A button (or stick) to show in a prompt. */
export type Glyph =
  | { kind: "key"; label: string; wide?: boolean }
  | { kind: "pad"; label: string }
  | { kind: "mouse"; side: "left" | "right" }
  | { kind: "arrows" }
  | { kind: "stick" }
  /** A short remark next to the buttons, like "or WASD". */
  | { kind: "note"; text: string };
