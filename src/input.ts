import type { Vec } from "./island";
import { padLabel, readGamepad, rumble as padRumble, type PadLayout } from "./gamepad";

// Input: the only place that knows about keys, mouse buttons and gamepads. The game asks about
// actions ("jump", "sword", ...), the move direction and the cursor; prompts ask which buttons to
// show for an action and get them for the device in use.
//
// Input modes: "keyboard": the arrows / WASD both move and aim. "mouse": they still move, but
// jumps, double jumps and attacks aim at the cursor, and the mouse buttons attack (left: sword,
// right: spear). "gamepad": like keyboard mode, with the left stick (analog) or d-pad to move and
// the face buttons to jump and attack. The mode is cycled with I and remembered; using a pad
// switches to gamepad mode, and using the keyboard or mouse again switches back.

export type InputMode = "keyboard" | "mouse" | "gamepad";
export const INPUT_MODES: InputMode[] = ["keyboard", "mouse", "gamepad"];

/**
 * What the player can do with a button. "start" starts / resumes from the briefing, "skip" moves
 * on from the end-of-round screen, "switchMode" cycles the input mode.
 */
export type Action = "jump" | "sword" | "spear" | "start" | "pause" | "skip" | "mute" | "switchMode";

type Bindings = Partial<Record<Action, string[]>>;

/** Key codes (KeyboardEvent.code). The first ones are the ones shown. */
const KEYS: Bindings = {
  jump: ["Space"],
  sword: ["KeyZ", "KeyJ"],
  spear: ["KeyX", "KeyK"],
  start: ["Enter", "Space"],
  pause: ["Escape"],
  skip: ["Enter"],
  mute: ["KeyM"],
  switchMode: ["KeyI"],
};
/** Mouse buttons ("Mouse0": left, "Mouse2": right); only in mouse mode. */
const MOUSE: Bindings = { sword: ["Mouse0"], spear: ["Mouse2"] };
/**
 * Gamepad buttons by position (see gamepad.ts). B (right on Xbox, bottom on Nintendo) or the
 * right trigger for the sword, the left face button or left trigger for the spear.
 */
const PAD: Bindings = {
  jump: ["PadA"],
  sword: ["PadB", "PadRT"],
  spear: ["PadX", "PadLT"],
  start: ["PadA", "PadStart"],
  pause: ["PadStart"],
  skip: ["PadStart"],
  mute: ["PadBack"],
};
const MOVE_KEYS = { left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"] };

/** Bindings that work in each mode: the keyboard and pad always work, the mouse buttons only in mouse mode. */
const LIVE: Record<InputMode, Bindings[]> = { keyboard: [KEYS, PAD], mouse: [KEYS, MOUSE, PAD], gamepad: [KEYS, PAD] };
/** Bindings shown in prompts, per mode. */
const SHOWN: Record<InputMode, Bindings[]> = { keyboard: [KEYS], mouse: [MOUSE, KEYS], gamepad: [PAD] };

const codes = (tables: Bindings[], a: Action) => tables.flatMap((t) => t[a] ?? []);

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

/** Codes held now, and codes pressed since the last frame. */
const held = new Set<string>();
const pressedCodes = new Set<string>();
let padHeld = new Set<string>();
let padMove: Vec = { x: 0, y: 0 };
/** The letters on the pad in use. */
let padLayout: PadLayout = "xbox";
const cursorPos: Vec = { x: 0, y: 0 };

const MODE_KEY = "planetproto.inputMode";
let mode: InputMode = "keyboard";
try {
  const saved = localStorage.getItem(MODE_KEY) as InputMode | null;
  if (saved && INPUT_MODES.includes(saved)) mode = saved;
} catch {
  // Ignore: persistence is a convenience.
}
/** The keyboard or mouse mode to return to when the keyboard is used after the pad. */
let deskMode: InputMode = mode === "gamepad" ? "keyboard" : mode;

const listeners: (() => void)[] = [];
/** Call `fn` whenever the mode, or the buttons prompts show, change. */
export function onInputChange(fn: () => void) {
  listeners.push(fn);
}

export function inputMode() {
  return mode;
}

export function setInputMode(m: InputMode) {
  if (m !== "gamepad") deskMode = m;
  if (m === mode) return;
  mode = m;
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // Ignore: persistence is a convenience.
  }
  for (const fn of listeners) fn();
}

// ---------------------------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------------------------

function press(code: string) {
  if (!held.has(code)) pressedCodes.add(code);
  held.add(code);
}

/** Listen to the keyboard, and to the mouse on `canvas` (clicks elsewhere, e.g. on panels, don't count). */
export function attachInput(canvas: HTMLCanvasElement) {
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    if (KEYS.switchMode!.includes(e.code)) {
      if (!e.repeat) setInputMode(INPUT_MODES[(INPUT_MODES.indexOf(mode) + 1) % INPUT_MODES.length]!);
      return;
    }
    if (mode === "gamepad") setInputMode(deskMode);
    press(e.code);
  });
  window.addEventListener("keyup", (e) => held.delete(e.code));
  window.addEventListener("blur", () => held.clear());
  window.addEventListener("pointermove", (e) => {
    cursorPos.x = e.clientX;
    cursorPos.y = e.clientY;
  });
  canvas.addEventListener("mousedown", (e) => {
    if (mode === "gamepad") setInputMode(deskMode);
    press(`Mouse${e.button}`);
  });
  window.addEventListener("mouseup", (e) => held.delete(`Mouse${e.button}`));
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}

/** Read the gamepad. Once per frame, before the update. */
export function pollInput() {
  const pad = readGamepad();
  let used = Math.hypot(pad.move.x, pad.move.y) > 0.5;
  for (const code of pad.held) {
    if (padHeld.has(code)) continue;
    press(code);
    used = true;
  }
  for (const code of padHeld) if (!pad.held.has(code)) held.delete(code);
  padHeld = pad.held;
  padMove = pad.move;
  if (!used) return;
  const relabel = pad.layout !== padLayout;
  padLayout = pad.layout;
  if (mode !== "gamepad") setInputMode("gamepad");
  else if (relabel) for (const fn of listeners) fn();
}

/** Forget this frame's presses. Once per frame, after the update. */
export function endInputFrame() {
  pressedCodes.clear();
}

/** Forget everything held and pressed, so e.g. the button that started a level doesn't also jump. */
export function clearInput() {
  pressedCodes.clear();
  held.clear();
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

/** Whether `a` was pressed this frame. */
export function pressed(a: Action) {
  return codes(LIVE[mode], a).some((c) => pressedCodes.has(c));
}

/** Whether `a` is held now. */
export function isHeld(a: Action) {
  return codes(LIVE[mode], a).some((c) => held.has(c));
}

/** Whether anything was pressed this frame. */
export function anyPressed() {
  return pressedCodes.size > 0;
}

/**
 * Movement input as a screen-space vector (y down) of length 0..1: the stick when it's pushed,
 * else the arrow keys / WASD (always length 1). A half-pushed stick moves at half effort.
 */
export function moveDir(): Vec {
  if (padMove.x || padMove.y) return padMove;
  const on = (codes: string[]) => +codes.some((c) => held.has(c));
  const x = on(MOVE_KEYS.right) - on(MOVE_KEYS.left);
  const y = on(MOVE_KEYS.down) - on(MOVE_KEYS.up);
  const l = Math.hypot(x, y);
  return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

/** Whether jumps and attacks aim at the cursor. */
export function pointerAims() {
  return mode === "mouse";
}

/** Whether the move input steers attacks, so aim assist should yield while it's pushed. */
export function moveAims() {
  return mode === "gamepad";
}

/** The cursor, in screen space. */
export function cursor(): Vec {
  return cursorPos;
}

/** Rumble the pad, when playing with one. */
export function rumble(strong: number, weak: number, ms: number) {
  if (mode === "gamepad") padRumble(strong, weak, ms);
}

// ---------------------------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------------------------

/** A button (or stick) to show in a prompt. */
export type Glyph =
  | { kind: "key"; label: string; wide?: boolean }
  | { kind: "pad"; label: string }
  | { kind: "mouse"; side: "left" | "right" }
  | { kind: "arrows" }
  | { kind: "stick" }
  /** A short remark next to the buttons, like "or WASD". */
  | { kind: "note"; text: string };

const KEY_LABELS: Record<string, string> = { Escape: "Esc", Space: "Space", Enter: "Enter" };

function glyph(code: string): Glyph {
  if (code.startsWith("Pad")) return { kind: "pad", label: padLabel(code, padLayout) };
  if (code.startsWith("Mouse")) return { kind: "mouse", side: code === "Mouse0" ? "left" : "right" };
  return { kind: "key", label: KEY_LABELS[code] ?? code.replace(/^(Key|Digit)/, ""), wide: code === "Space" };
}

/**
 * The buttons to show for `a` in the current mode, at most `max` of them. Actions the mode has no
 * buttons of its own for (like switching the mode with a pad in hand) show their keys.
 */
export function prompt(a: Action, max = 2): Glyph[] {
  const shown = codes(SHOWN[mode], a);
  return (shown.length ? shown : (KEYS[a] ?? [])).slice(0, max).map(glyph);
}

/** What to show for moving. */
export function movePrompt(): Glyph[] {
  return mode === "gamepad"
    ? [{ kind: "stick" }, { kind: "note", text: "or d-pad" }]
    : [{ kind: "arrows" }, { kind: "note", text: "or WASD" }];
}

/** A prompt as plain text, for the canvas: "Enter", "Start", "A / Start". */
export function promptText(a: Action, max = 1): string {
  return prompt(a, max)
    .map((g) => (g.kind === "key" || g.kind === "pad" ? g.label : g.kind === "mouse" ? `${g.side} click` : ""))
    .join(" / ");
}
