// Live-tweakable movement parameters plus a slider panel to edit them. Values persist in
// localStorage so a good feel survives reloads; "Reset" restores the defaults.

const defaults = {
  climbSpeed: 300, // units/s along the rim
  climbChargeFactor: 0.7, // climb speed multiplier while charging a jump
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

export type Tuning = typeof defaults;
export const tune: Tuning = { ...defaults };

interface Spec { key: keyof Tuning; label: string; min: number; max: number; step: number }

const groups: { title: string; specs: Spec[] }[] = [
  {
    title: "Climbing",
    specs: [
      { key: "climbSpeed", label: "Climb speed", min: 50, max: 800, step: 10 },
      { key: "climbChargeFactor", label: "Climb while charging", min: 0, max: 1, step: 0.05 },
    ],
  },
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
];

const STORAGE_KEY = "planetproto.tuning";

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Tuning>;
    for (const k of Object.keys(defaults) as (keyof Tuning)[]) {
      if (typeof saved[k] === "number" && Number.isFinite(saved[k])) tune[k] = saved[k];
    }
  } catch {
    // Storage unavailable or corrupt: keep defaults.
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tune));
  } catch {
    // Ignore: persistence is a convenience.
  }
}

function fmt(v: number, step: number) {
  return step < 1 ? v.toFixed(2).replace(/\.?0+$/, "") : String(Math.round(v));
}

export function createTuningPanel() {
  load();

  const style = document.createElement("style");
  style.textContent = `
    #tuning { position: fixed; top: 10px; right: 10px; width: 250px; max-height: calc(100vh - 20px); overflow-y: auto;
      background: rgba(18, 12, 40, 0.82); color: #e4defc; font: 12px/1.3 system-ui, sans-serif;
      border: 1px solid rgba(170, 150, 255, 0.25); border-radius: 8px; backdrop-filter: blur(6px); user-select: none; }
    #tuning header { display: flex; align-items: center; gap: 6px; padding: 7px 10px; cursor: pointer; font-weight: 600; }
    #tuning header span { flex: 1; }
    #tuning button { background: rgba(170, 150, 255, 0.18); color: inherit; border: 0; border-radius: 4px;
      padding: 3px 8px; font: inherit; cursor: pointer; }
    #tuning button:hover { background: rgba(170, 150, 255, 0.32); }
    #tuning .body { padding: 0 10px 8px; }
    #tuning.collapsed .body { display: none; }
    #tuning h4 { margin: 8px 0 3px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #a99be8; }
    #tuning label { display: grid; grid-template-columns: 1fr auto; row-gap: 1px; margin-bottom: 4px; }
    #tuning output { font-variant-numeric: tabular-nums; color: #fff; }
    #tuning input[type=range] { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: #9d86ff; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("div");
  panel.id = "tuning";
  const header = document.createElement("header");
  const title = document.createElement("span");
  title.textContent = "Tuning";
  const reset = document.createElement("button");
  reset.textContent = "Reset";
  const toggle = document.createElement("button");
  header.append(title, reset, toggle);
  const body = document.createElement("div");
  body.className = "body";
  panel.append(header, body);

  const setCollapsed = (c: boolean) => {
    panel.classList.toggle("collapsed", c);
    toggle.textContent = c ? "Show" : "Hide";
    try {
      localStorage.setItem(STORAGE_KEY + ".open", c ? "0" : "1");
    } catch {
      // Ignore: persistence is a convenience.
    }
  };
  let open = false;
  try {
    open = localStorage.getItem(STORAGE_KEY + ".open") === "1";
  } catch {
    // Default to collapsed.
  }
  setCollapsed(!open);
  header.addEventListener("click", (e) => {
    if (e.target !== reset) setCollapsed(!panel.classList.contains("collapsed"));
  });

  const refreshers: (() => void)[] = [];
  for (const g of groups) {
    const h = document.createElement("h4");
    h.textContent = g.title;
    body.appendChild(h);
    for (const spec of g.specs) {
      const label = document.createElement("label");
      const name = document.createElement("span");
      name.textContent = spec.label;
      const out = document.createElement("output");
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      const refresh = () => {
        input.value = String(tune[spec.key]);
        out.textContent = fmt(tune[spec.key], spec.step);
      };
      refresh();
      refreshers.push(refresh);
      input.addEventListener("input", () => {
        tune[spec.key] = Number(input.value);
        out.textContent = fmt(tune[spec.key], spec.step);
        save();
      });
      // Hand keyboard focus back to the game so arrows/Space don't keep nudging the slider.
      input.addEventListener("change", () => input.blur());
      input.addEventListener("pointerup", () => input.blur());
      label.append(name, out, input);
      body.appendChild(label);
    }
  }

  reset.addEventListener("click", () => {
    Object.assign(tune, defaults);
    save();
    refreshers.forEach((r) => r());
  });

  document.body.appendChild(panel);
}
