import type { Session } from "../../game/session";
import type { Camera } from "../../present/camera";
import type { Projector } from "../../render/projection";
import type { Action } from "../../input/types";

// HUD components draw on the canvas over the world, one per file. Add one by writing a file and
// listing it in ./index.ts.

export interface HudContext {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  session: Session;
  proj: Projector;
  camera: Camera;
  /** The button for an action, as text ("Enter", "A"). */
  promptText(a: Action): string;
}

export interface HudWidget {
  id: string;
  draw(c: HudContext): void;
}
