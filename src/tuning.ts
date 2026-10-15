import { DEFAULTS } from "./params";

// Live-tweakable game parameters and the tabbed slider panel that edits them.
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
  boids: "Boids",
  enemyAttacks: "Attacks",
};

const GROUP_TITLES: Record<string, string> = {
  "world.planet": "Planet",
  "move.climb": "Climbing",
  "move.jump": "Jumping",
  "move.jumpAim": "Jump aiming",
  "move.air": "Air",
  "move.slide": "Sliding",
  "camera.view": "Camera",
  "player.aim": "Aiming",
  "player.slowMo": "Slow motion (air attacks)",
  "player.health": "Health",
  "player.sword": "Sword",
  "player.spear": "Spear",
  "boids.swarm": "Swarm",
  "boids.flocking": "Flocking",
  "boids.islands": "Islands",
  "boids.queen": "Queen",
  "enemyAttacks.hit": "Damage",
  "enemyAttacks.melee": "Melee boids",
  "enemyAttacks.ranged": "Ranged boids",
};

/** [label, min, max, step, appliesOnRestart?] per slider; values without an entry get no slider. */
type Slider = [string, number, number, number, boolean?];
const SLIDERS: Record<string, Slider> = {
  "world.planet.radius": ["Boundary radius", 500, 2000, 10, true],
  "world.planet.islandCount": ["Islands", 2, 40, 1, true],

  "move.climb.speed": ["Climb speed", 50, 800, 10],
  "move.jump.min": ["Min jump length", 20, 400, 10],
  "move.jump.max": ["Max jump length", 100, 1000, 10],
  "move.jump.chargeTime": ["Charge time (s)", 0.1, 3, 0.05],
  "move.jump.gravity": ["Gravity", 200, 2000, 10],
  "move.jumpAim.time": ["Aim time (s)", 0.1, 4, 0.05],
  "move.jumpAim.turnRate": ["Aim turn rate (rad/s)", 0, 30, 0.5],
  "move.jumpAim.minTurnRate": ["Aim turn after aim time", 0, 5, 0.1],
  "move.air.turnRate": ["Air turn rate (rad/s)", 0, 15, 0.1],
  "move.air.grabRadius": ["Grab radius", 1, 40, 1],
  "move.slide.minSpeed": ["Slide min speed", 0, 600, 10],
  "move.slide.keep": ["Slide speed kept", 0, 1.5, 0.05],
  "move.slide.friction": ["Slide friction", 0.1, 10, 0.1],

  "camera.view.height": ["Height", 150, 1500, 10],
  "camera.view.followSpeed": ["Follow speed", 0.2, 15, 0.1],
  "camera.view.lookAhead": ["Look-ahead (s)", 0, 1, 0.05],

  "player.aim.chargeTime": ["Attack charge time (s)", 0.1, 2, 0.05],
  "player.aim.turnRate": ["Aim turn rate (rad/s)", 0, 30, 0.5],
  "player.aim.minTurnRate": ["Aim turn at full charge", 0, 5, 0.1],
  "player.slowMo.scale": ["World speed", 0.02, 1, 0.01],
  "player.slowMo.fadeIn": ["Fade in (s)", 0, 0.5, 0.01],
  "player.slowMo.fadeOut": ["Fade out (s)", 0, 0.5, 0.01],
  "player.health.max": ["Max health", 10, 500, 10, true],
  "player.health.fallDamage": ["Fall damage", 0, 50, 1],
  "player.health.invulnTime": ["Invulnerable after hit (s)", 0, 2, 0.05],
  "player.health.hitRadius": ["Hit radius", 2, 30, 1],
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

  "boids.swarm.meleeCount": ["Melee boids", 0, 150, 1, true],
  "boids.swarm.rangedCount": ["Ranged boids", 0, 150, 1, true],
  "boids.swarm.meleeSpeed": ["Melee speed", 20, 600, 5],
  "boids.swarm.rangedSpeed": ["Ranged speed", 20, 600, 5],
  "boids.swarm.aggroRange": ["Aggro range", 0, 1200, 10],
  "boids.swarm.disengageRange": ["Disengage range", 0, 2000, 10],
  "boids.flocking.neighborRadius": ["Neighbour radius", 10, 400, 5],
  "boids.flocking.separationRadius": ["Separation radius", 5, 150, 1],
  "boids.flocking.separation": ["Separation", 0, 3000, 10],
  "boids.flocking.alignment": ["Alignment", 0, 5, 0.05],
  "boids.flocking.cohesion": ["Cohesion", 0, 5, 0.05],
  "boids.flocking.wander": ["Wander", 0, 300, 5],
  "boids.flocking.queenAttraction": ["Pull toward queen", 0, 200, 5],
  "boids.islands.margin": ["Rim clearance", 0, 120, 1],
  "boids.islands.avoid": ["Avoid strength", 0, 200, 1],
  "boids.queen.hp": ["Health", 1, 200, 1, true],
  "boids.queen.speed": ["Speed", 0, 400, 5],
  "boids.queen.fleeRange": ["Flee range", 0, 1000, 10],
  "boids.queen.tether": ["Stays near home", 50, 1000, 10],
  "boids.queen.guardRadius": ["Guard radius", 0, 1500, 10],
  "boids.queen.threatRadius": ["Threat radius", 0, 1500, 10],

  "enemyAttacks.hit.damage": ["Damage per hit (%)", 0, 50, 0.5],
  "enemyAttacks.melee.lungeRange": ["Lunge range", 10, 400, 5],
  "enemyAttacks.melee.lungeSpeed": ["Lunge speed", 50, 1500, 10],
  "enemyAttacks.melee.lungeTime": ["Lunge time (s)", 0.05, 1.5, 0.01],
  "enemyAttacks.melee.cooldown": ["Cooldown (s)", 0, 5, 0.05],
  "enemyAttacks.ranged.keepAway": ["Keep-away distance", 0, 800, 10],
  "enemyAttacks.ranged.range": ["Shooting range", 50, 1500, 10],
  "enemyAttacks.ranged.orbSpeed": ["Orb speed", 20, 1500, 10],
  "enemyAttacks.ranged.orbLife": ["Orb life (s)", 0.2, 6, 0.1],
  "enemyAttacks.ranged.cooldown": ["Cooldown (s)", 0.1, 6, 0.05],
};

// ---------------------------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------------------------

const STORAGE_KEY = "planetproto.params";

function getPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function setPref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore: persistence is a convenience.
  }
}

function setPath(path: string, v: unknown) {
  const [t, g, k] = path.split(".") as [string, string, string];
  if (typeof v === "number" && Number.isFinite(v) && typeof defaults[t]?.[g]?.[k] === "number") live[t]![g]![k] = v;
}

function load() {
  try {
    const saved = JSON.parse(getPref(STORAGE_KEY) ?? "{}") as Tree;
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

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for contexts without the async clipboard API.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

// ---------------------------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------------------------

function fmt(v: number, step: number) {
  return step < 1 ? v.toFixed(2).replace(/\.?0+$/, "") : String(Math.round(v));
}

export function createTuningPanel() {
  load();

  const style = document.createElement("style");
  style.textContent = `
    #tuning { position: fixed; top: 10px; right: 10px; width: 290px; max-height: calc(100vh - 20px);
      display: flex; flex-direction: column;
      background: rgba(18, 12, 40, 0.86); color: #e4defc; font: 12px/1.3 system-ui, sans-serif;
      border: 1px solid rgba(170, 150, 255, 0.25); border-radius: 8px; backdrop-filter: blur(6px); user-select: none; }
    #tuning header { display: flex; align-items: center; gap: 6px; padding: 7px 10px; cursor: pointer; font-weight: 600; }
    #tuning header span { flex: 1; }
    #tuning button { background: rgba(170, 150, 255, 0.18); color: inherit; border: 0; border-radius: 4px;
      padding: 3px 8px; font: inherit; cursor: pointer; }
    #tuning button:hover { background: rgba(170, 150, 255, 0.32); }
    #tuning .tabs { display: flex; gap: 2px; padding: 0 8px; border-bottom: 1px solid rgba(170, 150, 255, 0.25); }
    #tuning .tabs button { flex: 1; border-radius: 4px 4px 0 0; background: transparent; padding: 5px 2px; color: #a99be8; }
    #tuning .tabs button.active { background: rgba(170, 150, 255, 0.22); color: #fff; }
    #tuning .body { padding: 0 10px 8px; overflow-y: auto; }
    #tuning.collapsed .body, #tuning.collapsed .tabs { display: none; }
    #tuning h4 { margin: 8px 0 3px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #a99be8; }
    #tuning label { display: grid; grid-template-columns: 1fr auto; row-gap: 1px; margin-bottom: 4px; }
    #tuning label small { color: #a99be8; margin-left: 4px; }
    #tuning output { font-variant-numeric: tabular-nums; color: #fff; }
    #tuning input[type=range] { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: #9d86ff; }
    #tuning .note { color: #a99be8; margin-top: 6px; font-size: 11px; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("div");
  panel.id = "tuning";
  const header = document.createElement("header");
  const title = document.createElement("span");
  title.textContent = "Tuning";
  const copy = document.createElement("button");
  copy.textContent = "Copy";
  copy.title = "Copy all values as source for src/params.ts";
  const reset = document.createElement("button");
  reset.textContent = "Reset tab";
  const toggle = document.createElement("button");
  header.append(title, copy, reset, toggle);
  const tabBar = document.createElement("div");
  tabBar.className = "tabs";
  const body = document.createElement("div");
  body.className = "body";
  panel.append(header, tabBar, body);

  const setCollapsed = (c: boolean) => {
    panel.classList.toggle("collapsed", c);
    toggle.textContent = c ? "Show" : "Hide";
    reset.hidden = c;
    setPref("planetproto.tuning.open", c ? "0" : "1");
  };
  setCollapsed(getPref("planetproto.tuning.open") !== "1");
  header.addEventListener("click", (e) => {
    if (e.target === header || e.target === title || e.target === toggle) {
      setCollapsed(!panel.classList.contains("collapsed"));
    }
  });

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
  document.body.appendChild(panel);
}
