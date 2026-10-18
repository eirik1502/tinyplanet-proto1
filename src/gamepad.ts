import type { Vec } from "./island";

// Gamepad input, read once per frame from the browser's Gamepad API. Buttons come out as
// key-like codes named by their position in the standard (Xbox) layout: "PadA" is the bottom face
// button on every pad, whatever is printed on it. The left stick (or d-pad) comes out as a vector.
// Pads the browser doesn't map itself are translated by a built-in profile when there is one.
// Browsers only report a pad after one of its buttons is pressed.

/** Button codes by standard-mapping index. */
const BUTTONS = [
  "PadA", "PadB", "PadX", "PadY", "PadLB", "PadRB", "PadLT", "PadRT",
  "PadBack", "PadStart", "PadLS", "PadRS", "PadUp", "PadDown", "PadLeft", "PadRight",
];

/** The letters printed on the pad, for showing buttons. */
export type PadLayout = "xbox" | "nintendo";

/** Labels for each button code, per layout (by position: Nintendo's bottom button is B). */
const LABELS: Record<PadLayout, Record<string, string>> = {
  xbox: { PadA: "A", PadB: "B", PadX: "X", PadY: "Y", PadLB: "LB", PadRB: "RB", PadLT: "LT", PadRT: "RT", PadBack: "Back", PadStart: "Start" },
  nintendo: { PadA: "B", PadB: "A", PadX: "Y", PadY: "X", PadLB: "L", PadRB: "R", PadLT: "ZL", PadRT: "ZR", PadBack: "−", PadStart: "+" },
};

export function padLabel(code: string, layout: PadLayout) {
  return LABELS[layout][code] ?? code.replace(/^Pad/, "");
}

/**
 * How to read a pad the browser doesn't map: the raw button index for each standard index, the
 * axis holding the d-pad as a hat switch, and the letters printed on it.
 */
interface Profile {
  buttons: number[];
  hat?: number;
  layout: PadLayout;
}

/** Profiles by USB vendor id (and optionally product id, as "vendor:product"). */
const PROFILES: Record<string, Profile> = {
  // PowerA Switch pads (probed on a Core Plus Wired, 20d6:a711, Chrome on macOS): Switch HID
  // order for the face buttons, the d-pad as a hat on axis 9.
  "20d6": { buttons: [1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11], hat: 9, layout: "nintendo" },
};

/** Vendor and product ids from a pad's id: "… (Vendor: 20d6 Product: a711)" or "20d6-a711-…". */
function usbIds(id: string): { vendor: string; product: string } | null {
  const m = /Vendor: ([0-9a-f]{4}) Product: ([0-9a-f]{4})/i.exec(id) ?? /^([0-9a-f]{4})-([0-9a-f]{4})-/i.exec(id);
  return m ? { vendor: m[1]!.toLowerCase(), product: m[2]!.toLowerCase() } : null;
}

function profileFor(pad: Gamepad): Profile | null {
  if (pad.mapping === "standard") return null;
  const ids = usbIds(pad.id);
  if (!ids) return null;
  return PROFILES[`${ids.vendor}:${ids.product}`] ?? PROFILES[ids.vendor] ?? null;
}

/** Layout guess for a pad the browser maps itself. */
function layoutFor(pad: Gamepad): PadLayout {
  return usbIds(pad.id)?.vendor === "057e" || /nintendo|joy-con|pro controller/i.test(pad.id) ? "nintendo" : "xbox";
}

/**
 * A hat switch axis as d-pad directions. It steps through eight positions clockwise from up,
 * -1 to 1 in steps of 2/7; anything outside that (e.g. 3.29) is at rest.
 */
function hatDirs(v: number): string[] {
  if (v < -1.05 || v > 1.05) return [];
  const i = Math.round(((v + 1) * 7) / 2);
  return [
    ["PadUp"], ["PadUp", "PadRight"], ["PadRight"], ["PadDown", "PadRight"],
    ["PadDown"], ["PadDown", "PadLeft"], ["PadLeft"], ["PadUp", "PadLeft"],
  ][i] ?? [];
}

/** Stick travel ignored around the centre, so a resting stick reads as zero. */
const DEAD_ZONE = 0.25;
/** A trigger counts as pressed past this. */
const TRIGGER_PRESS = 0.5;

export interface PadState {
  /** Codes of the buttons held now. */
  held: Set<string>;
  /** Left stick (or d-pad), length 0..1, screen space (y down). */
  move: Vec;
  layout: PadLayout;
}

const IDLE: PadState = { held: new Set(), move: { x: 0, y: 0 }, layout: "xbox" };

/** The pad last read, for rumble. */
let current: Gamepad | null = null;

/** The left stick with a radial dead zone, rescaled so it reads 0..1 from the dead zone's edge. */
function stick(x: number, y: number): Vec {
  const l = Math.hypot(x, y);
  if (l <= DEAD_ZONE) return { x: 0, y: 0 };
  const k = Math.min(1, (l - DEAD_ZONE) / (1 - DEAD_ZONE)) / l;
  return { x: x * k, y: y * k };
}

/** The first connected pad's buttons and stick (idle when there is none). */
export function readGamepad(): PadState {
  const pads = navigator.getGamepads?.() ?? [];
  const pad = pads.find((p) => p?.connected && p.mapping === "standard") ?? pads.find((p) => p?.connected) ?? null;
  current = pad;
  if (!pad) return IDLE;

  const profile = profileFor(pad);
  const held = new Set<string>();
  BUTTONS.forEach((code, i) => {
    const b = pad.buttons[profile ? (profile.buttons[i] ?? -1) : i];
    if (b && (i === 6 || i === 7 ? b.value > TRIGGER_PRESS : b.pressed)) held.add(code);
  });
  if (profile?.hat !== undefined) for (const code of hatDirs(pad.axes[profile.hat] ?? 9)) held.add(code);

  let move = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
  if (!move.x && !move.y) {
    const dx = +held.has("PadRight") - +held.has("PadLeft");
    const dy = +held.has("PadDown") - +held.has("PadUp");
    const l = Math.hypot(dx, dy);
    if (l) move = { x: dx / l, y: dy / l };
  }
  return { held, move, layout: profile?.layout ?? layoutFor(pad) };
}

/** When the current rumble ends (ms, performance.now) and how strong it is. */
let rumbleEnd = 0;
let rumbleStrength = 0;

/**
 * Rumble the pad: `strong` (low-frequency motor) and `weak` (high-frequency) 0..1, for `ms`.
 * A weaker rumble doesn't cut a stronger one short.
 */
export function rumble(strong: number, weak: number, ms: number) {
  const act = current?.vibrationActuator;
  if (!act?.playEffect) return;
  const now = performance.now();
  const strength = Math.max(strong, weak);
  if (now < rumbleEnd && strength < rumbleStrength) return;
  rumbleEnd = now + ms;
  rumbleStrength = strength;
  act
    .playEffect("dual-rumble", { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })
    .catch(() => {});
}
