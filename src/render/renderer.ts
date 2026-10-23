import { ISLAND_TOP } from "../world/island";
import { boidsLayer, playerLayer, projectilesLayer } from "./actors";
import { DEBUG_LAYERS } from "./debug";
import { effectsLayer } from "./effects";
import { aimIndicator, jumpPreview } from "./indicators";
import { boundsLayer, islandsLayer } from "./islands";
import { fog, slowMo, wind } from "./overlays";
import type { Painter } from "./painter";
import type { Drawable, Overlay, Scene, WorldLayer } from "./scene";
import { drawSpace, hazeLayer, motesLayer, veil } from "./sky";

// Draws a frame: space and the planet, then the world (every layer's drawables, sorted by
// altitude so things in front cover things behind), then overlays. Reads the scene; changes
// nothing in it.

/** World layers, in no particular order (the drawables are sorted). */
const WORLD: WorldLayer[] = [hazeLayer, motesLayer, islandsLayer, boundsLayer, playerLayer, boidsLayer, projectilesLayer, effectsLayer];
/** Overlays, in drawing order. */
const OVERLAYS: Overlay[] = [veil, wind, fog, slowMo, jumpPreview, aimIndicator];

export function render(p: Painter, s: Scene) {
  const { ctx, proj, W, H, dpr } = p;
  const zoom = Math.min(W, H) / 640;
  const shake = s.camera.shake * 18;
  proj.setCamera(s.camera.x + (Math.random() - 0.5) * shake, s.camera.y + (Math.random() - 0.5) * shake, ISLAND_TOP, s.camera.h, zoom, W, H);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawSpace(p, s.time);
  const list: Drawable[] = [];
  for (const layer of WORLD) layer(p, s, list);
  list.sort((a, b) => a.alt - b.alt);
  for (const d of list) d.draw();
  for (const o of OVERLAYS) o(p, s);
  for (const d of DEBUG_LAYERS) if (s.debug.has(d.id)) d.draw(p, s);
}
