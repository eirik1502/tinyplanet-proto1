// Live-tweakable game parameters plus a tabbed slider panel to edit them. Values persist in
// localStorage so a good feel survives reloads; "Reset" restores the current tab's defaults.

const movementDefaults = {
  climbSpeed: 300, // units/s along the rim
  gravity: 1200,
  jumpMin: 110, // horizontal range of a tapped jump (landing back at island-top height)
  jumpMax: 420, // ... and of a fully charged one
  chargeTime: 0.5, // seconds of holding Space to reach jumpMax
  airTurn: 4, // rad/s the flight direction turns toward the input direction
  bodyRadius: 18, // how close to an island body counts as touching it
  slideMinSpeed: 100, // grabbing faster than this slides along the rim
  slideKeep: 1.0, // fraction of the along-rim velocity kept when sliding starts
  slideFriction: 2.2, // exponential slide decay rate
  camHeight: 420, // camera height above the island tops
  camFollow: 2.4, // how quickly the camera catches up with the player
  camLead: 0.6, // seconds of velocity the camera looks ahead
};

const combatDefaults = {
  // Player
  playerHp: 100, // health in percent
  fallDamage: 10, // percent lost when falling into the haze
  playerRadius: 10,
  invulnTime: 0.35, // seconds of invulnerability after being hit

  // Aiming (attacks and jumps)
  aimTime: 0.5, // seconds of holding an attack to reach full power
  aimTurnRate: 14, // rad/s the aim turns toward the input at the start of a charge...
  aimMinTurnRate: 0.6, // ... slowing down to this once fully charged

  swordRange: 52,
  swordMaxRange: 88, // reach at full power
  swordArc: 1.35, // half-angle (rad) of the swipe cone
  swordDamage: 2,
  swordMaxDamage: 5,
  swordTime: 0.18, // seconds the swipe can hit
  swordFade: 0.12, // extra seconds the swipe stays visible while fading out
  swordCooldown: 0.28,

  spearSpeed: 720,
  spearMaxSpeed: 1050,
  spearLength: 46, // drawn shaft length
  spearRadius: 12, // extra hit radius around the tip
  spearLife: 0.7,
  spearDamage: 1,
  spearMaxDamage: 3,
  spearMaxScale: 1.8, // size multiplier at full power
  spearCooldown: 0.45,

  // Swarm
  meleeCount: 28,
  rangedCount: 14,
  meleeSpeed: 190,
  rangedSpeed: 160,
  aggroRange: 320, // boids notice the player within this distance
  disengageRange: 650, // ... and give up beyond this
  neighborRadius: 110, // flocking: who counts as a neighbour
  separationRadius: 30,
  separation: 500,
  alignment: 0.8,
  cohesion: 0.6,
  wander: 40,
  queenAttraction: 25, // idle boids drift toward the queen
  islandMargin: 26, // boids keep this far outside island rims
  islandAvoid: 30, // strength of the push away from islands

  // Queen
  queenHp: 24,
  queenSpeed: 85,
  queenFleeRange: 320,
  queenTether: 230, // the queen stays within this distance of her home
  guardRadius: 480, // boids this close to the queen defend her
  threatRadius: 520, // the queen feels threatened when the player is this close

  // Boid attacks
  hitDamage: 2, // percent of player health lost per enemy hit
  lungeRange: 95,
  lungeSpeed: 470,
  lungeTime: 0.32,
  lungeCooldown: 1.3,
  rangedKeepAway: 230,
  orbSpeed: 280,
  orbLife: 2.2,
  orbCooldown: 1.7,
  orbRange: 420,
};

export type Tuning = typeof movementDefaults;
export type CombatTuning = typeof combatDefaults;
export const tune: Tuning = { ...movementDefaults };
export const COMBAT: CombatTuning = { ...combatDefaults };

type Values = Record<string, number>;
interface Store { key: string; values: Values; defaults: Values }
const stores = {
  movement: { key: "planetproto.tuning", values: tune as Values, defaults: movementDefaults as Values },
  combat: { key: "planetproto.combat", values: COMBAT as Values, defaults: combatDefaults as Values },
} satisfies Record<string, Store>;

interface Spec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Only takes effect when a new round starts. */
  restart?: boolean;
}
interface Tab { title: string; store: Store; groups: { title: string; specs: Spec[] }[] }

const tabs: Tab[] = [
  {
    title: "Move",
    store: stores.movement,
    groups: [
      { title: "Climbing", specs: [{ key: "climbSpeed", label: "Climb speed", min: 50, max: 800, step: 10 }] },
      {
        title: "Jumping",
        specs: [
          { key: "jumpMin", label: "Min jump length", min: 20, max: 400, step: 10 },
          { key: "jumpMax", label: "Max jump length", min: 100, max: 1000, step: 10 },
          { key: "chargeTime", label: "Charge time (s)", min: 0.1, max: 3, step: 0.05 },
          { key: "gravity", label: "Gravity", min: 200, max: 2000, step: 10 },
        ],
      },
      {
        title: "Air",
        specs: [
          { key: "airTurn", label: "Air turn rate (rad/s)", min: 0, max: 15, step: 0.1 },
          { key: "bodyRadius", label: "Grab radius", min: 1, max: 40, step: 1 },
        ],
      },
      {
        title: "Sliding",
        specs: [
          { key: "slideMinSpeed", label: "Slide min speed", min: 0, max: 600, step: 10 },
          { key: "slideKeep", label: "Slide speed kept", min: 0, max: 1.5, step: 0.05 },
          { key: "slideFriction", label: "Slide friction", min: 0.1, max: 10, step: 0.1 },
        ],
      },
      {
        title: "Camera",
        specs: [
          { key: "camHeight", label: "Height", min: 150, max: 1500, step: 10 },
          { key: "camFollow", label: "Follow speed", min: 0.2, max: 15, step: 0.1 },
          { key: "camLead", label: "Look-ahead (s)", min: 0, max: 1, step: 0.05 },
        ],
      },
    ],
  },
  {
    title: "Player",
    store: stores.combat,
    groups: [
      {
        title: "Aiming",
        specs: [
          { key: "aimTime", label: "Attack charge time (s)", min: 0.1, max: 2, step: 0.05 },
          { key: "aimTurnRate", label: "Aim turn rate (rad/s)", min: 0, max: 30, step: 0.5 },
          { key: "aimMinTurnRate", label: "Aim turn at full charge", min: 0, max: 5, step: 0.1 },
        ],
      },
      {
        title: "Health",
        specs: [
          { key: "playerHp", label: "Max health", min: 10, max: 500, step: 10, restart: true },
          { key: "fallDamage", label: "Fall damage", min: 0, max: 50, step: 1 },
          { key: "invulnTime", label: "Invulnerable after hit (s)", min: 0, max: 2, step: 0.05 },
          { key: "playerRadius", label: "Hit radius", min: 2, max: 30, step: 1 },
        ],
      },
      {
        title: "Sword",
        specs: [
          { key: "swordRange", label: "Reach", min: 10, max: 200, step: 2 },
          { key: "swordMaxRange", label: "Reach at full power", min: 10, max: 300, step: 2 },
          { key: "swordArc", label: "Half arc (rad)", min: 0.2, max: 3.1, step: 0.05 },
          { key: "swordDamage", label: "Damage", min: 0, max: 20, step: 0.5 },
          { key: "swordMaxDamage", label: "Damage at full power", min: 0, max: 30, step: 0.5 },
          { key: "swordTime", label: "Active time (s)", min: 0.05, max: 1, step: 0.01 },
          { key: "swordCooldown", label: "Cooldown (s)", min: 0, max: 2, step: 0.02 },
        ],
      },
      {
        title: "Spear",
        specs: [
          { key: "spearSpeed", label: "Speed", min: 100, max: 2000, step: 10 },
          { key: "spearMaxSpeed", label: "Speed at full power", min: 100, max: 3000, step: 10 },
          { key: "spearLife", label: "Flight time (s)", min: 0.1, max: 3, step: 0.05 },
          { key: "spearDamage", label: "Damage", min: 0, max: 20, step: 0.5 },
          { key: "spearMaxDamage", label: "Damage at full power", min: 0, max: 30, step: 0.5 },
          { key: "spearRadius", label: "Hit radius", min: 2, max: 40, step: 1 },
          { key: "spearMaxScale", label: "Size at full power", min: 1, max: 4, step: 0.1 },
          { key: "spearCooldown", label: "Cooldown (s)", min: 0, max: 2, step: 0.02 },
        ],
      },
    ],
  },
  {
    title: "Boids",
    store: stores.combat,
    groups: [
      {
        title: "Swarm",
        specs: [
          { key: "meleeCount", label: "Melee boids", min: 0, max: 150, step: 1, restart: true },
          { key: "rangedCount", label: "Ranged boids", min: 0, max: 150, step: 1, restart: true },
          { key: "meleeSpeed", label: "Melee speed", min: 20, max: 600, step: 5 },
          { key: "rangedSpeed", label: "Ranged speed", min: 20, max: 600, step: 5 },
          { key: "aggroRange", label: "Aggro range", min: 0, max: 1200, step: 10 },
          { key: "disengageRange", label: "Disengage range", min: 0, max: 2000, step: 10 },
        ],
      },
      {
        title: "Flocking",
        specs: [
          { key: "neighborRadius", label: "Neighbour radius", min: 10, max: 400, step: 5 },
          { key: "separationRadius", label: "Separation radius", min: 5, max: 150, step: 1 },
          { key: "separation", label: "Separation", min: 0, max: 3000, step: 10 },
          { key: "alignment", label: "Alignment", min: 0, max: 5, step: 0.05 },
          { key: "cohesion", label: "Cohesion", min: 0, max: 5, step: 0.05 },
          { key: "wander", label: "Wander", min: 0, max: 300, step: 5 },
          { key: "queenAttraction", label: "Pull toward queen", min: 0, max: 200, step: 5 },
        ],
      },
      {
        title: "Islands",
        specs: [
          { key: "islandMargin", label: "Rim clearance", min: 0, max: 120, step: 1 },
          { key: "islandAvoid", label: "Avoid strength", min: 0, max: 200, step: 1 },
        ],
      },
      {
        title: "Queen",
        specs: [
          { key: "queenHp", label: "Health", min: 1, max: 200, step: 1, restart: true },
          { key: "queenSpeed", label: "Speed", min: 0, max: 400, step: 5 },
          { key: "queenFleeRange", label: "Flee range", min: 0, max: 1000, step: 10 },
          { key: "queenTether", label: "Stays near home", min: 50, max: 1000, step: 10 },
          { key: "guardRadius", label: "Guard radius", min: 0, max: 1500, step: 10 },
          { key: "threatRadius", label: "Threat radius", min: 0, max: 1500, step: 10 },
        ],
      },
    ],
  },
  {
    title: "Attacks",
    store: stores.combat,
    groups: [
      { title: "Damage", specs: [{ key: "hitDamage", label: "Damage per hit (%)", min: 0, max: 50, step: 0.5 }] },
      {
        title: "Melee boids",
        specs: [
          { key: "lungeRange", label: "Lunge range", min: 10, max: 400, step: 5 },
          { key: "lungeSpeed", label: "Lunge speed", min: 50, max: 1500, step: 10 },
          { key: "lungeTime", label: "Lunge time (s)", min: 0.05, max: 1.5, step: 0.01 },
          { key: "lungeCooldown", label: "Cooldown (s)", min: 0, max: 5, step: 0.05 },
        ],
      },
      {
        title: "Ranged boids",
        specs: [
          { key: "rangedKeepAway", label: "Keep-away distance", min: 0, max: 800, step: 10 },
          { key: "orbRange", label: "Shooting range", min: 50, max: 1500, step: 10 },
          { key: "orbSpeed", label: "Orb speed", min: 20, max: 1500, step: 10 },
          { key: "orbLife", label: "Orb life (s)", min: 0.2, max: 6, step: 0.1 },
          { key: "orbCooldown", label: "Cooldown (s)", min: 0.1, max: 6, step: 0.05 },
        ],
      },
    ],
  },
];

function load(store: Store) {
  try {
    const saved = JSON.parse(localStorage.getItem(store.key) ?? "{}") as Values;
    for (const k of Object.keys(store.defaults)) {
      if (typeof saved[k] === "number" && Number.isFinite(saved[k])) store.values[k] = saved[k];
    }
  } catch {
    // Storage unavailable or corrupt: keep defaults.
  }
}

function save(store: Store) {
  try {
    localStorage.setItem(store.key, JSON.stringify(store.values));
  } catch {
    // Ignore: persistence is a convenience.
  }
}

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

function fmt(v: number, step: number) {
  return step < 1 ? v.toFixed(2).replace(/\.?0+$/, "") : String(Math.round(v));
}

export function createTuningPanel() {
  for (const s of Object.values(stores)) load(s);

  const style = document.createElement("style");
  style.textContent = `
    #tuning { position: fixed; top: 10px; right: 10px; width: 260px; max-height: calc(100vh - 20px);
      display: flex; flex-direction: column;
      background: rgba(18, 12, 40, 0.86); color: #e4defc; font: 12px/1.3 system-ui, sans-serif;
      border: 1px solid rgba(170, 150, 255, 0.25); border-radius: 8px; backdrop-filter: blur(6px); user-select: none; }
    #tuning header { display: flex; align-items: center; gap: 6px; padding: 7px 10px; cursor: pointer; font-weight: 600; }
    #tuning header span { flex: 1; }
    #tuning button { background: rgba(170, 150, 255, 0.18); color: inherit; border: 0; border-radius: 4px;
      padding: 3px 8px; font: inherit; cursor: pointer; }
    #tuning button:hover { background: rgba(170, 150, 255, 0.32); }
    #tuning .tabs { display: flex; gap: 2px; padding: 0 8px; border-bottom: 1px solid rgba(170, 150, 255, 0.25); }
    #tuning .tabs button { flex: 1; border-radius: 4px 4px 0 0; background: transparent; padding: 5px 4px; color: #a99be8; }
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
  const reset = document.createElement("button");
  reset.textContent = "Reset tab";
  const toggle = document.createElement("button");
  header.append(title, reset, toggle);
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
    if (e.target !== reset) setCollapsed(!panel.classList.contains("collapsed"));
  });

  let current = Math.max(0, tabs.findIndex((t) => t.title === getPref("planetproto.tuning.tab")));
  let refreshers: (() => void)[] = [];

  const renderTab = () => {
    const tab = tabs[current]!;
    body.replaceChildren();
    refreshers = [];
    tabButtons.forEach((b, i) => b.classList.toggle("active", i === current));
    let anyRestart = false;
    for (const g of tab.groups) {
      const h = document.createElement("h4");
      h.textContent = g.title;
      body.appendChild(h);
      for (const spec of g.specs) {
        const values = tab.store.values;
        const label = document.createElement("label");
        const name = document.createElement("span");
        name.textContent = spec.label;
        if (spec.restart) {
          anyRestart = true;
          const mark = document.createElement("small");
          mark.textContent = "↻";
          mark.title = "Applies when a new round starts";
          name.appendChild(mark);
        }
        const out = document.createElement("output");
        const input = document.createElement("input");
        input.type = "range";
        input.min = String(spec.min);
        input.max = String(spec.max);
        input.step = String(spec.step);
        const refresh = () => {
          input.value = String(values[spec.key]);
          out.textContent = fmt(values[spec.key]!, spec.step);
        };
        refresh();
        refreshers.push(refresh);
        input.addEventListener("input", () => {
          values[spec.key] = Number(input.value);
          out.textContent = fmt(values[spec.key]!, spec.step);
          save(tab.store);
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

  const tabButtons = tabs.map((t, i) => {
    const b = document.createElement("button");
    b.textContent = t.title;
    b.addEventListener("click", () => {
      current = i;
      setPref("planetproto.tuning.tab", t.title);
      renderTab();
    });
    tabBar.appendChild(b);
    return b;
  });

  reset.addEventListener("click", () => {
    // Reset only the keys shown on this tab (the combat store is split across several tabs).
    const tab = tabs[current]!;
    for (const g of tab.groups) for (const s of g.specs) tab.store.values[s.key] = tab.store.defaults[s.key]!;
    save(tab.store);
    refreshers.forEach((r) => r());
  });

  renderTab();
  document.body.appendChild(panel);
}
