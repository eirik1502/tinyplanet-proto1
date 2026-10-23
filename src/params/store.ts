import { getPref, setPref } from "../core/prefs";
import { DEFAULTS, type Params } from "./defaults";
import { SLIDERS } from "./meta";

// Game params. A world takes a Params object; the browser game passes `liveParams`, which the
// tuning panel edits in place and which persists in the browser. Headless runs and scenarios make
// their own with `makeParams`, so they never touch the browser's tuning.

export type { Params } from "./defaults";

/** A partial params tree: only the values to change. */
export type ParamsPatch = { [T in keyof Params]?: { [G in keyof Params[T]]?: Partial<Params[T][G]> } };

type Tree = Record<string, Record<string, Record<string, number>>>;

/** Fresh params: the defaults with `patch` on top. */
export function makeParams(patch: ParamsPatch = {}): Params {
  const p = structuredClone(DEFAULTS);
  applyPatch(p, patch);
  return p;
}

/** Set every known number in `patch` on `p`. */
export function applyPatch(p: Params, patch: ParamsPatch) {
  const live = p as unknown as Tree;
  const defaults = DEFAULTS as unknown as Tree;
  const src = patch as unknown as Tree;
  for (const t of Object.keys(src))
    for (const g of Object.keys(src[t] ?? {}))
      for (const k of Object.keys(src[t]![g] ?? {})) {
        const v = src[t]![g]![k];
        if (typeof v === "number" && Number.isFinite(v) && typeof defaults[t]?.[g]?.[k] === "number") live[t]![g]![k] = v;
      }
}

// ---------------------------------------------------------------------------------------------
// The browser's live params
// ---------------------------------------------------------------------------------------------

const STORAGE_KEY = "planetproto.params";

function loadLive(): Params {
  const p = structuredClone(DEFAULTS);
  try {
    const saved = JSON.parse(getPref(STORAGE_KEY) ?? "{}") as Tree;
    // Move values from before jumps were set by speed and height don't fit the new model.
    if (saved.move?.jump && "length" in saved.move.jump) delete saved.move;
    applyPatch(p, saved as ParamsPatch);
  } catch {
    // Corrupt: keep defaults.
  }
  return p;
}

/** The params the browser game plays with, edited live by the tuning panel. */
export const liveParams: Params = loadLive();

export function saveLiveParams() {
  setPref(STORAGE_KEY, JSON.stringify(liveParams));
}

/** Put the defaults back for one tab of the live params. */
export function resetLiveTab(tab: keyof Params) {
  const live = liveParams as unknown as Tree;
  const defaults = DEFAULTS as unknown as Tree;
  for (const g of Object.keys(live[tab]!)) Object.assign(live[tab]![g]!, defaults[tab]![g]!);
  saveLiveParams();
}

// ---------------------------------------------------------------------------------------------
// Copy as source
// ---------------------------------------------------------------------------------------------

/** Round away float noise from slider steps (0.30000000000000004 → 0.3). */
const clean = (v: number) => Number(v.toFixed(4));

/** `p` as a replacement for the DEFAULTS object in params/defaults.ts. */
export function paramsSource(p: Params): string {
  const live = p as unknown as Tree;
  const out = ["export const DEFAULTS = {"];
  for (const t of Object.keys(live)) {
    out.push(`  ${t}: {`);
    for (const g of Object.keys(live[t]!)) {
      out.push(`    ${g}: {`);
      for (const k of Object.keys(live[t]![g]!)) {
        const label = SLIDERS[`${t}.${g}.${k}`]?.[0];
        out.push(`      ${k}: ${clean(live[t]![g]![k]!)},${label ? ` // ${label}` : ""}`);
      }
      out.push("    },");
    }
    out.push("  },");
  }
  out.push("};");
  return out.join("\n") + "\n";
}
