import { DEFAULTS } from "./params";
import { getPref, setPref } from "./prefs";
import { copyText } from "./ui";

// Live-tweakable game parameters and the dev panel's Tuning section that edits them.
// `params` mirrors DEFAULTS (tab → group → value); each tab of the panel is one top-level group.
// Values persist in localStorage; "Copy" puts the current values on the clipboard as source for
// params.ts.

export type Params = typeof DEFAULTS;
export const params: Params = structuredClone(DEFAULTS);

type Tree = Record<string, Record<string, Record<string, number>>>;
const live = params as unknown as Tree;
const defaults = DEFAULTS as unknown as Tree;

const TAB_TITLES: Record<keyof Params, string> = {
  world: "World",
  move: "Move",
  camera: "Camera",
  player: "Player",
  combat: "Combat",
  audio: "Audio",
};

const GROUP_TITLES: Record<string, string> = {
  "world.levels": "Modifiers by level",
  "world.level4": "Level 4 (everything unlocked; templates scale this)",
  "world.perLevel": "Added per level after 4",
  "world.modifiers": "Level modifiers (wind, fog, bosses' shield…)",
  "move.climb": "Climbing",
  "move.jump": "Jumping",
  "move.air": "Air control",
  "move.limits": "Air limits",
  "move.airJump": "Double jump & bounces",
  "move.slide": "Sliding",
  "camera.view": "Camera",
  "player.aim": "Aiming",
  "player.slowMo": "Slow motion (air attacks)",
  "player.focus": "Focus (slow-motion budget)",
  "player.hitStop": "Hit-stop (freeze frames)",
  "player.health": "Health",
  "player.hurtbox": "Hurtbox (where the player can be hit)",
  "player.sword": "Sword",
  "player.spear": "Spear",
  "combat.hits": "Hits (every attack, from anyone)",
  "combat.islands": "Boids around islands",
  "audio.volume": "Volume (M mutes)",
};

/** [label, min, max, step, appliesOnRestart?] per slider; values without an entry get no slider. */
type Slider = [string, number, number, number, boolean?];
const SLIDERS: Record<string, Slider> = {
  "world.levels.modifiersFrom": ["Modifiers may appear from level", 1, 30, 1, true],
  "world.levels.twoModifiersFrom": ["Up to two modifiers from level", 1, 30, 1, true],
  "world.modifiers.wind": ["Wind strength", 0, 400, 5, true],
  "world.modifiers.lowGravity": ["Low gravity (×)", 0.3, 1, 0.05, true],
  "world.modifiers.heavyGravity": ["Heavy gravity (×)", 1, 2, 0.05, true],
  "world.modifiers.fog": ["Fog view radius", 150, 1000, 10, true],
  "world.modifiers.shield": ["Shield: share of the swarm to kill", 0, 1, 0.05, true],
  "world.modifiers.reinforceEvery": ["Reinforcements every (s)", 3, 120, 1, true],
  "world.modifiers.reinforceSize": ["Reinforcement flock size", 1, 12, 1, true],
  "world.modifiers.reinforceCap": ["Swarm cap (× starting swarm)", 0.5, 3, 0.1, true],
  "world.modifiers.eliteHp": ["Elite health (×)", 1, 5, 0.5, true],
  "world.modifiers.eliteSize": ["Elite size (×)", 1, 2, 0.05, true],
  "world.level4.radius": ["Boundary radius", 300, 2000, 10, true],
  "world.level4.islands": ["Islands", 1, 40, 1, true],
  "world.level4.budget": ["Swarm budget", 0, 200, 0.5, true],
  "world.perLevel.radius": ["Boundary radius", 0, 300, 5, true],
  "world.perLevel.islands": ["Islands", 0, 6, 0.1, true],
  "world.perLevel.budget": ["Swarm budget", 0, 50, 0.1, true],

  "move.climb.speed": ["Climb speed", 50, 800, 10],
  "move.jump.speed": ["Jump speed (sideways)", 50, 1000, 10],
  "move.jump.height": ["Full jump height (Space held)", 10, 300, 5],
  "move.jump.slideFactor": ["Slide speed added to the jump speed (×)", 0, 1.5, 0.05],
  "move.jump.cut": ["Upward speed kept on early release", 0, 1, 0.05],
  "move.jump.gravity": ["Gravity", 100, 2000, 10],
  "move.jump.apexGravity": ["Gravity near the apex (×)", 0.1, 1, 0.05],
  "move.jump.apexBand": ["Apex band (vertical speed)", 0, 500, 10],
  "move.air.turnRate": ["Air turn rate (rad/s)", 0, 15, 0.1],
  "move.air.accel": ["Speed up / brake (per s)", 0, 2000, 10],
  "move.air.grabRadius": ["Grab radius", 1, 40, 1],
  "move.limits.maxSpeed": ["Max air speed (sideways)", 50, 1500, 10],
  "move.limits.maxHeight": ["Max height above the rims", 20, 600, 5],
  "move.airJump.speed": ["Double jump speed (sideways)", 0, 1000, 10],
  "move.airJump.height": ["Double jump height", 0, 300, 5],
  "move.airJump.minPeak": ["Lowest peak above the rims", 0, 300, 5],
  "move.airJump.snapCone": ["Snap cone ahead (degrees)", 0, 180, 5],
  "move.airJump.bounce": ["Sword-hit bounce (up speed)", 0, 1200, 10],
  "move.airJump.netDepth": ["Safety bounce depth below rim", 0, 75, 1],
  "move.airJump.netBounce": ["Safety bounce (up speed)", 0, 1200, 10],
  "move.slide.minSpeed": ["Slide min speed", 0, 600, 10],
  "move.slide.keep": ["Slide speed kept", 0, 1.5, 0.05],
  "move.slide.friction": ["Slide friction", 0.1, 10, 0.1],

  "camera.view.height": ["Height", 150, 1500, 10],
  "camera.view.followSpeed": ["Follow speed", 0.2, 15, 0.1],
  "camera.view.lookAhead": ["Look-ahead (s)", 0, 1, 0.05],

  "player.aim.chargeTime": ["Attack charge time (s)", 0.1, 2, 0.05],
  "player.aim.turnRate": ["Aim turn rate (rad/s)", 0, 30, 0.5],
  "player.aim.minTurnRate": ["Aim turn at full charge", 0, 5, 0.1],
  "player.aim.assistRange": ["Aim assist range", 0, 1000, 10],
  "player.slowMo.scale": ["World speed", 0.02, 1, 0.01],
  "player.slowMo.fadeIn": ["Fade in (s)", 0, 0.5, 0.01],
  "player.slowMo.fadeOut": ["Fade out (s)", 0, 0.5, 0.01],
  "player.hitStop.min": ["Shortest freeze (s)", 0, 0.5, 0.01],
  "player.hitStop.max": ["Longest freeze (s)", 0, 0.6, 0.01],
  "player.hitStop.minDamage": ["Damage for shortest freeze", 0, 30, 0.5],
  "player.hitStop.maxDamage": ["Damage for longest freeze", 0, 30, 0.5],
  "player.focus.drain": ["Focus drain while slowed (per s)", 0, 3, 0.05],
  "player.focus.perHit": ["Focus regained per hit", 0, 1, 0.05],
  "player.health.max": ["Max health", 10, 500, 10, true],
  "player.health.fallDamage": ["Fall damage", 0, 50, 1],
  "player.health.invulnTime": ["Invulnerable after hit (s)", 0, 2, 0.05],
  "player.hurtbox.radius": ["Radius", 2, 30, 1],
  "player.sword.range": ["Reach", 10, 200, 2],
  "player.sword.maxRange": ["Reach at full power", 10, 300, 2],
  "player.sword.arc": ["Half arc (rad)", 0.2, 3.1, 0.05],
  "player.sword.damage": ["Damage", 0, 20, 0.5],
  "player.sword.maxDamage": ["Damage at full power", 0, 30, 0.5],
  "player.sword.activeTime": ["Active time (s)", 0.05, 1, 0.01],
  "player.sword.cooldown": ["Cooldown (s)", 0, 2, 0.02],
  "player.spear.speed": ["Speed", 100, 2000, 10],
  "player.spear.maxSpeed": ["Speed at full power", 100, 3000, 10],
  "player.spear.life": ["Flight time (s)", 0.1, 3, 0.05],
  "player.spear.damage": ["Damage", 0, 20, 0.5],
  "player.spear.maxDamage": ["Damage at full power", 0, 30, 0.5],
  "player.spear.hitRadius": ["Hit radius", 2, 40, 1],
  "player.spear.maxScale": ["Size at full power", 1, 4, 0.1],
  "player.spear.cooldown": ["Cooldown (s)", 0, 2, 0.02],


  "combat.hits.height": ["Hits reach up / down", 0, 200, 1],
  "combat.islands.margin": ["Rim clearance", 0, 120, 1],
  "combat.islands.avoid": ["Avoid strength", 0, 200, 1],

  "audio.volume.master": ["Master", 0, 1, 0.05],
  "audio.volume.music": ["Music", 0, 1, 0.05],
  "audio.volume.sfx": ["Sound effects", 0, 1, 0.05],
  "audio.volume.hearing": ["Enemies heard within", 100, 3000, 50],
};

// ---------------------------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------------------------

const STORAGE_KEY = "planetproto.params";

function setPath(path: string, v: unknown) {
  const [t, g, k] = path.split(".") as [string, string, string];
  if (typeof v === "number" && Number.isFinite(v) && typeof defaults[t]?.[g]?.[k] === "number") live[t]![g]![k] = v;
}

function load() {
  try {
    const saved = JSON.parse(getPref(STORAGE_KEY) ?? "{}") as Tree;
    // Move values from before jumps were set by speed and height don't fit the new model.
    if (saved.move?.jump && "length" in saved.move.jump) delete saved.move;
    for (const t of Object.keys(saved))
      for (const g of Object.keys(saved[t] ?? {}))
        for (const k of Object.keys(saved[t]![g] ?? {})) setPath(`${t}.${g}.${k}`, saved[t]![g]![k]);
  } catch {
    // Corrupt: keep defaults.
  }
}

function save() {
  setPref(STORAGE_KEY, JSON.stringify(params));
}

load();

// ---------------------------------------------------------------------------------------------
// Copy as source
// ---------------------------------------------------------------------------------------------

/** Round away float noise from slider steps (0.30000000000000004 → 0.3). */
function clean(v: number) {
  return Number(v.toFixed(4));
}

/** The current values as a replacement for the DEFAULTS object in params.ts. */
export function paramsSource(): string {
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

// ---------------------------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------------------------

function fmt(v: number, step: number) {
  return step < 1 ? v.toFixed(2).replace(/\.?0+$/, "") : String(Math.round(v));
}

/**
 * The Tuning section of the dev panel: a tab per top-level group of params, with sliders, and
 * buttons to copy every value as source for params.ts or reset the open tab.
 */
export function tuningSection(): HTMLElement {
  const section = document.createElement("div");
  section.className = "section tuning";
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const copy = document.createElement("button");
  copy.textContent = "Copy";
  copy.title = "Copy all values as source for src/params.ts";
  const reset = document.createElement("button");
  reset.textContent = "Reset tab";
  const hint = document.createElement("span");
  hint.textContent = "Saved in this browser";
  toolbar.append(hint, copy, reset);
  const tabBar = document.createElement("div");
  tabBar.className = "tabs";
  const body = document.createElement("div");
  body.className = "body";
  section.append(toolbar, tabBar, body);

  copy.addEventListener("click", async () => {
    const ok = await copyText(paramsSource());
    copy.textContent = ok ? "Copied!" : "Copy failed";
    setTimeout(() => (copy.textContent = "Copy"), 1400);
  });

  const tabKeys = Object.keys(TAB_TITLES) as (keyof Params)[];
  let current = Math.max(0, tabKeys.indexOf(getPref("planetproto.tuning.tab") as keyof Params));
  let refreshers: (() => void)[] = [];

  const renderTab = () => {
    const t = tabKeys[current]!;
    body.replaceChildren();
    refreshers = [];
    tabButtons.forEach((b, i) => b.classList.toggle("active", i === current));
    let anyRestart = false;
    for (const g of Object.keys(live[t]!)) {
      const values = live[t]![g]!;
      const keys = Object.keys(values).filter((k) => SLIDERS[`${t}.${g}.${k}`]);
      if (!keys.length) continue;
      const h = document.createElement("h4");
      h.textContent = GROUP_TITLES[`${t}.${g}`] ?? g;
      body.appendChild(h);
      for (const k of keys) {
        const [labelText, min, max, step, restart] = SLIDERS[`${t}.${g}.${k}`]!;
        const label = document.createElement("label");
        const name = document.createElement("span");
        name.textContent = labelText;
        if (restart) {
          anyRestart = true;
          const mark = document.createElement("small");
          mark.textContent = "↻";
          mark.title = "Applies when a new round starts";
          name.appendChild(mark);
        }
        const out = document.createElement("output");
        const input = document.createElement("input");
        input.type = "range";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        const refresh = () => {
          input.value = String(values[k]);
          out.textContent = fmt(values[k]!, step);
        };
        refresh();
        refreshers.push(refresh);
        input.addEventListener("input", () => {
          values[k] = Number(input.value);
          out.textContent = fmt(values[k]!, step);
          save();
        });
        // Hand keyboard focus back to the game so arrows/Space don't keep nudging the slider.
        input.addEventListener("change", () => input.blur());
        input.addEventListener("pointerup", () => input.blur());
        label.append(name, out, input);
        body.appendChild(label);
      }
    }
    if (anyRestart) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = "↻ applies when a new round starts";
      body.appendChild(note);
    }
  };

  const tabButtons = tabKeys.map((t, i) => {
    const b = document.createElement("button");
    b.textContent = TAB_TITLES[t];
    b.addEventListener("click", () => {
      current = i;
      setPref("planetproto.tuning.tab", t);
      renderTab();
    });
    tabBar.appendChild(b);
    return b;
  });

  reset.addEventListener("click", () => {
    const t = tabKeys[current]!;
    for (const g of Object.keys(live[t]!)) Object.assign(live[t]![g]!, defaults[t]![g]!);
    save();
    refreshers.forEach((r) => r());
  });

  renderTab();
  return section;
}
