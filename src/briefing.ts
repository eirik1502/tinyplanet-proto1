import { BURST_COLORS, type BoidKind } from "./combat";

// The briefing shown before each level (and as the pause screen): input mode, controls for the
// unlocked weapons, and an overview of the enemies on this level. Newly unlocked items are tagged.

export type InputMode = "keyboard" | "mouse";
export type Weapon = "sword" | "spear";

export interface BriefingInfo {
  level: number;
  /** Why the screen is up: a new level, a retry after defeat, or a pause mid-level. */
  reason: "new" | "retry" | "pause";
  inputMode: InputMode;
  weapons: Weapon[];
  enemies: BoidKind[];
  /** Weapons and enemies unlocked on this level. */
  fresh: (Weapon | BoidKind)[];
}

const ENEMIES: Record<BoidKind, { name: string; text: string }> = {
  queen: { name: "Queen", text: "Flees when you come close. Kill her to clear the level." },
  melee: { name: "Melee boid", text: "Swoops in and lunges at you up close." },
  ranged: { name: "Ranged boid", text: "Keeps its distance and shoots. Close in fast." },
  bomber: {
    name: "Bomber boid",
    text: "Dives at you and explodes, blowing you off your rim. Killing one sets it off: use the spear.",
  },
};

function row(keys: string, text: string, isNew = false) {
  return `<tr><td class="keys">${keys}</td><td>${text}${isNew ? ' <span class="new">NEW</span>' : ""}</td></tr>`;
}

export function briefingHtml(b: BriefingInfo): string {
  const mouse = b.inputMode === "mouse";
  const title =
    b.reason === "pause" ? `Paused · Level ${b.level}` : b.reason === "retry" ? `Retry level ${b.level}` : `Level ${b.level}`;

  const move = [
    row("Arrows / WASD", "Climb along the rim"),
    row("Space", mouse ? "Jump toward the cursor (hold for height)" : "Jump (hold for height)"),
    row("Space in the air", mouse ? "Double jump to an island near the cursor" : "Double jump"),
    row("Arrows / WASD in the air", "Steer, speed up and brake"),
  ].join("");

  const aimHow = mouse ? "aims at the cursor" : "aims at the nearest enemy, arrows turn it";
  const attacks = [
    b.weapons.includes("sword") &&
      row(
        mouse ? "Left click / Z" : "Z / J",
        `Sword: hold to power up, release to strike (${aimHow}). Air hits refill your double jump and bounce you up`,
        b.fresh.includes("sword"),
      ),
    b.weapons.includes("spear") &&
      row(
        mouse ? "Right click / X" : "X / K",
        `Spear: hold to power up, release to throw (${aimHow}). Hits from range`,
        b.fresh.includes("spear"),
      ),
  ]
    .filter(Boolean)
    .join("");

  const enemies = (["queen", ...b.enemies] as BoidKind[])
    .map((k) => {
      const e = ENEMIES[k];
      const tag = b.fresh.includes(k) ? ' <span class="new">NEW</span>' : "";
      return `<li><span class="dot${k === "queen" ? " queen" : ""}" style="background:${BURST_COLORS[k]}"></span><b>${e.name}</b>${tag}<br><span class="dim">${e.text}</span></li>`;
    })
    .join("");

  return `
    <div class="card">
      <h1>${title}</h1>
      <p class="goal">Kill the queen ♛</p>
      <section>
        <h2>Input</h2>
        <div class="modes">
          <button data-mode="keyboard" class="${mouse ? "" : "on"}">Keyboard</button>
          <button data-mode="mouse" class="${mouse ? "on" : ""}">Keyboard + mouse</button>
          <span class="dim">I switches</span>
        </div>
      </section>
      <section><h2>Movement</h2><table>${move}</table></section>
      <section><h2>Attacks</h2><table>${attacks}</table></section>
      <section><h2>Enemies</h2><ul class="enemies">${enemies}</ul></section>
      <p class="dim small">M mutes · Esc pauses and shows this screen</p>
      <button class="start" data-start>${b.reason === "pause" ? "Resume" : "Start"} <span class="dim">(Enter / Space)</span></button>
    </div>`;
}
