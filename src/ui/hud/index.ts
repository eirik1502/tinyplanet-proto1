import { health } from "./health";
import { lostFade } from "./lostFade";
import { queenPointer } from "./queenPointer";
import { roundEnd } from "./roundEnd";
import { swarmStatus } from "./swarmStatus";
import type { HudContext, HudWidget } from "./types";

// The HUD's components, in drawing order.

export const HUD: HudWidget[] = [queenPointer, lostFade, health, swarmStatus, roundEnd];

export function drawHud(c: HudContext) {
  for (const w of HUD) w.draw(c);
}

export type { HudContext, HudWidget } from "./types";
