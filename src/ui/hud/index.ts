import { health } from "./health";
import { lesson } from "./lesson";
import { lostFade } from "./lostFade";
import { goalPointer } from "./goalPointer";
import { roundEnd } from "./roundEnd";
import { swarmStatus } from "./swarmStatus";
import type { HudContext, HudWidget } from "./types";

// The HUD's components, in drawing order.

export const HUD: HudWidget[] = [goalPointer, lostFade, health, swarmStatus, lesson, roundEnd];

export function drawHud(c: HudContext) {
  for (const w of HUD) w.draw(c);
}

export type { HudContext, HudWidget } from "./types";
