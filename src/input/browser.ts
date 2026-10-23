import type { Vec } from "../core/math";
import { getPref, setPref } from "../core/prefs";
import { padLabel, readGamepad, type PadLayout } from "./gamepad";
import { type Action, type AimMode, type Glyph, type InputFrame, type InputSource, type InputView } from "./types";

// The browser's input source: keyboard, mouse and gamepad. The only place that knows about keys,
// mouse buttons and pads. Prompts ask which buttons to show for an action and get them for the
// device in use.
//
// Input modes: "keyboard": the arrows / WASD both move and aim. "mouse": they still move, but
// jumps, double jumps and attacks aim at the cursor, and the mouse buttons attack (left: sword,
// right: spear). "gamepad": like keyboard mode, with the left stick (analog) or d-pad to move and
// the face buttons to jump and attack. The mode is cycled with I and remembered; using a pad
// switches to gamepad mode, and using the keyboard or mouse again switches back.

export type InputMode = "keyboard" | "mouse" | "gamepad";
export const INPUT_MODES: InputMode[] = ["keyboard", "mouse", "gamepad"];

type Bindings = Partial<Record<Action, string[]>>;

/** Key codes (KeyboardEvent.code). The first ones are the ones shown. */
const KEYS: Bindings = {
  jump: ["Space"],
  sword: ["KeyZ", "KeyJ"],
  spear: ["KeyX", "KeyK"],
  confirm: ["Enter", "Space"],
  pause: ["Escape"],
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
  confirm: ["PadA", "PadStart"],
  pause: ["PadStart"],
  mute: ["PadBack"],
};
const MOVE_KEYS = { left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], up: ["KeyW", "ArrowUp"], down: ["KeyS", "ArrowDown"] };
const ACTIONS: Action[] = ["jump", "sword", "spear", "confirm", "pause", "mute", "switchMode"];

/** Bindings that work in each mode: the keyboard and pad always work, the mouse buttons only in mouse mode. */
const LIVE: Record<InputMode, Bindings[]> = { keyboard: [KEYS, PAD], mouse: [KEYS, MOUSE, PAD], gamepad: [KEYS, PAD] };
/** Bindings shown in prompts, per mode. */
const SHOWN: Record<InputMode, Bindings[]> = { keyboard: [KEYS], mouse: [MOUSE, KEYS], gamepad: [PAD] };
const AIM_MODES: Record<InputMode, AimMode> = { keyboard: "assist", mouse: "pointer", gamepad: "move" };

const codes = (tables: Bindings[], a: Action) => tables.flatMap((t) => t[a] ?? []);
const MODE_KEY = "planetproto.inputMode";
const KEY_LABELS: Record<string, string> = { Escape: "Esc", Space: "Space", Enter: "Enter" };

export class BrowserInput implements InputSource {
  /** Codes held now, and codes pressed since the last frame. */
  private held = new Set<string>();
  private pressedCodes = new Set<string>();
  private padHeld = new Set<string>();
  private padMove: Vec = { x: 0, y: 0 };
  /** The letters on the pad in use. */
  private padLayout: PadLayout = "xbox";
  private cursorPos: Vec = { x: 0, y: 0 };
  private currentMode: InputMode = "keyboard";
  /** The keyboard or mouse mode to return to when the keyboard is used after the pad. */
  private deskMode: InputMode = "keyboard";
  private listeners: (() => void)[] = [];
  /** Whether anything at all was pressed in the last polled frame (for unlocking audio). */
  anyPressed = false;

  constructor() {
    const saved = getPref(MODE_KEY) as InputMode | null;
    if (saved && INPUT_MODES.includes(saved)) this.currentMode = saved;
    this.deskMode = this.currentMode === "gamepad" ? "keyboard" : this.currentMode;
  }

  get mode() {
    return this.currentMode;
  }

  /** Call `fn` whenever the mode, or the buttons prompts show, change. */
  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  setMode(m: InputMode) {
    if (m !== "gamepad") this.deskMode = m;
    if (m === this.currentMode) return;
    this.currentMode = m;
    setPref(MODE_KEY, m);
    for (const fn of this.listeners) fn();
  }

  /** The cursor, in screen space. */
  get cursor(): Vec {
    return this.cursorPos;
  }

  /** Whether jumps and attacks aim at the cursor. */
  get pointerAims() {
    return this.currentMode === "mouse";
  }

  /** Listen to the keyboard, and to the mouse on `canvas` (clicks elsewhere, e.g. on panels, don't count). */
  attach(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
      if (KEYS.switchMode!.includes(e.code)) {
        if (!e.repeat) this.setMode(INPUT_MODES[(INPUT_MODES.indexOf(this.currentMode) + 1) % INPUT_MODES.length]!);
        return;
      }
      if (this.currentMode === "gamepad") this.setMode(this.deskMode);
      this.press(e.code);
    });
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
    window.addEventListener("blur", () => this.held.clear());
    window.addEventListener("pointermove", (e) => {
      this.cursorPos.x = e.clientX;
      this.cursorPos.y = e.clientY;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (this.currentMode === "gamepad") this.setMode(this.deskMode);
      this.press(`Mouse${e.button}`);
    });
    window.addEventListener("mouseup", (e) => this.held.delete(`Mouse${e.button}`));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Read the pad and hand out this frame; presses since the last poll count once. */
  poll(view: InputView): InputFrame {
    this.readPad();
    const live = LIVE[this.currentMode];
    const pressed = new Set<Action>();
    const held = new Set<Action>();
    for (const a of ACTIONS) {
      const cs = codes(live, a);
      if (cs.some((c) => this.pressedCodes.has(c))) pressed.add(a);
      if (cs.some((c) => this.held.has(c))) held.add(a);
    }
    this.anyPressed = this.pressedCodes.size > 0;
    this.pressedCodes.clear();
    const aimMode = AIM_MODES[this.currentMode];
    return {
      move: this.moveDir(),
      aimMode,
      aim: aimMode === "pointer" ? view.aimFromScreen(this.cursorPos.x, this.cursorPos.y) : null,
      pressed,
      held,
    };
  }

  clear() {
    this.pressedCodes.clear();
    this.held.clear();
  }

  private press(code: string) {
    if (!this.held.has(code)) this.pressedCodes.add(code);
    this.held.add(code);
  }

  private readPad() {
    const pad = readGamepad();
    let used = Math.hypot(pad.move.x, pad.move.y) > 0.5;
    for (const code of pad.held) {
      if (this.padHeld.has(code)) continue;
      this.press(code);
      used = true;
    }
    for (const code of this.padHeld) if (!pad.held.has(code)) this.held.delete(code);
    this.padHeld = pad.held;
    this.padMove = pad.move;
    if (!used) return;
    const relabel = pad.layout !== this.padLayout;
    this.padLayout = pad.layout;
    if (this.currentMode !== "gamepad") this.setMode("gamepad");
    else if (relabel) for (const fn of this.listeners) fn();
  }

  /**
   * Movement input as a screen-space vector (y down) of length 0..1: the stick when it's pushed,
   * else the arrow keys / WASD (always length 1).
   */
  private moveDir(): Vec {
    if (this.padMove.x || this.padMove.y) return this.padMove;
    const on = (cs: string[]) => +cs.some((c) => this.held.has(c));
    const x = on(MOVE_KEYS.right) - on(MOVE_KEYS.left);
    const y = on(MOVE_KEYS.down) - on(MOVE_KEYS.up);
    const l = Math.hypot(x, y);
    return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }

  // -------------------------------------------------------------------------------------------
  // Prompts
  // -------------------------------------------------------------------------------------------

  private glyph(code: string): Glyph {
    if (code.startsWith("Pad")) return { kind: "pad", label: padLabel(code, this.padLayout) };
    if (code.startsWith("Mouse")) return { kind: "mouse", side: code === "Mouse0" ? "left" : "right" };
    return { kind: "key", label: KEY_LABELS[code] ?? code.replace(/^(Key|Digit)/, ""), wide: code === "Space" };
  }

  /**
   * The buttons to show for `a` in the current mode, at most `max` of them. Actions the mode has no
   * buttons of its own for (like switching the mode with a pad in hand) show their keys.
   */
  prompt(a: Action, max = 2): Glyph[] {
    const shown = codes(SHOWN[this.currentMode], a);
    return (shown.length ? shown : (KEYS[a] ?? [])).slice(0, max).map((c) => this.glyph(c));
  }

  /** What to show for moving. */
  movePrompt(): Glyph[] {
    return this.currentMode === "gamepad"
      ? [{ kind: "stick" }, { kind: "note", text: "or d-pad" }]
      : [{ kind: "arrows" }, { kind: "note", text: "or WASD" }];
  }

  /** A prompt as plain text, for the canvas: "Enter", "Start", "A / Start". */
  promptText(a: Action, max = 1): string {
    return this.prompt(a, max)
      .map((g) => (g.kind === "key" || g.kind === "pad" ? g.label : g.kind === "mouse" ? `${g.side} click` : ""))
      .join(" / ");
  }
}
