import { Avatar, type AvatarView } from "./avatar";
import { BOID_HP, BURST_COLORS, type BoidKind } from "./combat";
import { drawBoidBody } from "./sprites";
import { params } from "./tuning";

// The briefing shown before each level (and as the pause screen): input mode, a compact movement
// strip, the player's card with the unlocked attacks and air abilities as its properties, and a
// card per enemy on this level with its health and attack. Newly unlocked items are tagged.
// Texts stay short: only what you can't easily learn by playing.

export type InputMode = "keyboard" | "mouse";
export type Weapon = "sword" | "spear";

export interface BriefingInfo {
  level: number;
  /** Why the screen is up: a new level, a retry after defeat, or a pause mid-level. */
  reason: "new" | "retry" | "pause";
  inputMode: InputMode;
  weapons: Weapon[];
  enemies: Exclude<BoidKind, "queen">[];
  /** Weapons and enemies unlocked on this level. */
  fresh: (Weapon | BoidKind)[];
  queenHp: number;
}

// ---------------------------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------------------------

const ICONS = {
  sword: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.5H20v5.5L9 20l-5-5z"/><path d="M5 14l5 5M3 21l3-3"/></svg>`,
  spear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21L15 9"/><path d="M14 4l6-1-1 6-4 1-2-2z" fill="currentColor"/></svg>`,
  lunge: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h12M12 6l6 6-6 6"/><path d="M20 5v14"/></svg>`,
  orb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="17" cy="12" r="4" fill="currentColor"/><path d="M3 12h6M5 8h5M5 16h5"/></svg>`,
  blast: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.2 5.6L20 6l-2.8 5.2L22 15l-6 .8L15 22l-3-4.6L9 22l-1-6.2-6-.8 4.8-3.8L4 6l5.8 1.6z"/></svg>`,
  crown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 18h18l-1.5-10-4.5 4-3-6-3 6-4.5-4z" fill="currentColor" fill-opacity=".25"/></svg>`,
  jump: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12l6-6 6 6M6 19l6-6 6 6"/></svg>`,
  focus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>`,
  keyboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>`,
  mouse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="2.5" width="12" height="19" rx="6"/><path d="M12 2.5V10M6 10h12"/></svg>`,
};

/** A mouse with its left or right button lit. */
function mouseButton(side: "left" | "right") {
  const fill = side === "left" ? "M12 3H12A6 6 0 0 0 6.2 9.5H12z" : "M12 3A6 6 0 0 1 17.8 9.5H12z";
  return `<span class="mouse" title="${side} click"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="${fill}" fill="currentColor" stroke="none"/><rect x="6" y="2.5" width="12" height="19" rx="6"/><path d="M12 2.5V10M6 10h12"/></svg></span>`;
}

const kbd = (k: string, wide = false) => `<kbd${wide ? ' class="wide"' : ""}>${k}</kbd>`;
const arrows = `<span class="cluster"><span></span>${kbd("↑")}<span></span>${kbd("←")}${kbd("↓")}${kbd("→")}</span>`;
const or = `<span class="or">/</span>`;
const isNew = (on: boolean) => (on ? '<span class="new">NEW</span>' : "");
const fmt = (v: number) => String(Number(v.toFixed(2)));
const chip = (text: string, cls = "") => `<span class="chip ${cls}">${text}</span>`;

// ---------------------------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------------------------

interface Ability {
  icon: string;
  name: string;
  text: string;
  stats: string[];
  input?: string;
  fresh?: boolean;
}

function ability(a: Ability) {
  return `
    <div class="ability">
      <div class="ability-icon">${a.icon}</div>
      <div class="ability-body">
        <div class="ability-head"><b>${a.name}</b>${isNew(!!a.fresh)}${a.input ? `<span class="ability-input">${a.input}</span>` : ""}</div>
        ${a.stats.length ? `<div class="stats">${a.stats.map((s) => chip(s)).join("")}</div>` : ""}
        <div class="ability-text">${a.text}</div>
      </div>
    </div>`;
}

function playerCard(b: BriefingInfo) {
  const mouse = b.inputMode === "mouse";
  const sw = params.player.sword;
  const sp = params.player.spear;
  const abilities: Ability[] = [];
  if (b.weapons.includes("sword"))
    abilities.push({
      icon: ICONS.sword,
      name: "Sword",
      text: "Hold to power up. Bounce on aerial hits.",
      stats: [`${fmt(sw.damage)}–${fmt(sw.maxDamage)} dmg`, `${fmt(sw.cooldown)}s`],
      input: mouse ? `${mouseButton("left")}${or}${kbd("Z")}` : `${kbd("Z")}${or}${kbd("J")}`,
      fresh: b.fresh.includes("sword"),
    });
  if (b.weapons.includes("spear"))
    abilities.push({
      icon: ICONS.spear,
      name: "Spear",
      text: "Hold to power up. Thrown.",
      stats: [`${fmt(sp.damage)}–${fmt(sp.maxDamage)} dmg`, `${fmt(sp.cooldown)}s`],
      input: mouse ? `${mouseButton("right")}${or}${kbd("X")}` : `${kbd("X")}${or}${kbd("K")}`,
      fresh: b.fresh.includes("spear"),
    });
  abilities.push(
    {
      icon: ICONS.jump,
      name: "Double jump",
      text: "Refills on aerial hits.",
      stats: ["1 per flight"],
      input: `${kbd("Space", true)}<span class="or">in air</span>`,
    },
    {
      icon: ICONS.focus,
      name: "Focus",
      text: "Slow motion while aiming in the air. Refills on landing.",
      stats: [`${fmt(1 / params.player.focus.drain)}s budget`],
    },
  );
  const h = params.player.health;
  return `
    <article class="unit player">
      <header>
        <canvas class="portrait" data-portrait="player"></canvas>
        <div>
          <h3>You</h3>
          <div class="stats">${chip(`${ICONS.heart}${h.max} HP`, "hp")}${chip(`Fall: −${fmt(h.fallDamage)}`)}</div>
        </div>
      </header>
      <div class="abilities">${abilities.map(ability).join("")}</div>
    </article>`;
}

function enemyCard(kind: BoidKind, b: BriefingInfo) {
  const ea = params.enemyAttacks;
  const hit = fmt(ea.hit.damage);
  const cards: Record<BoidKind, { name: string; hp: number; abilities: Ability[] }> = {
    queen: {
      name: "Queen",
      hp: b.queenHp,
      abilities: [{ icon: ICONS.crown, name: "Escorted", text: "Flees. Guarded by her flock.", stats: [] }],
    },
    melee: {
      name: "Melee boid",
      hp: BOID_HP.melee,
      abilities: [{ icon: ICONS.lunge, name: "Lunge", text: "Dashes in up close.", stats: [`${hit} dmg`, `${fmt(ea.melee.cooldown)}s`] }],
    },
    ranged: {
      name: "Ranged boid",
      hp: BOID_HP.ranged,
      abilities: [{ icon: ICONS.orb, name: "Orb shot", text: "Shoots from a distance.", stats: [`${hit} dmg`, `${fmt(ea.ranged.cooldown)}s`] }],
    },
    bomber: {
      name: "Bomber boid",
      hp: BOID_HP.bomber,
      abilities: [
        { icon: ICONS.blast, name: "Blast", text: "Explodes on contact, or when killed.", stats: [`${fmt(ea.bomber.damage)} dmg`, "knockback"] },
      ],
    },
  };
  const c = cards[kind];
  return `
    <article class="unit enemy${kind === "queen" ? " queen" : ""}" style="--c:${BURST_COLORS[kind]}">
      <header>
        <canvas class="portrait" data-portrait="${kind}"></canvas>
        <div>
          <h3>${c.name}${isNew(b.fresh.includes(kind))}</h3>
          <div class="stats">${chip(`${ICONS.heart}${fmt(c.hp)} HP`, "hp")}</div>
        </div>
      </header>
      <div class="abilities">${c.abilities.map(ability).join("")}</div>
    </article>`;
}

export function briefingHtml(b: BriefingInfo): string {
  const mouse = b.inputMode === "mouse";
  const title =
    b.reason === "pause" ? `Paused · Level ${b.level}` : b.reason === "retry" ? `Retry level ${b.level}` : `Level ${b.level}`;
  const moves = [
    [`${arrows}<span class="or">or WASD</span>`, "Climb · steer in the air"],
    [kbd("Space", true), mouse ? "Jump toward the cursor · hold for height" : "Jump · hold for height"],
  ];
  return `
    <div class="sheet">
      <header class="top">
        <div>
          <h1>${title}</h1>
          <p class="goal">${ICONS.crown}Kill the queen</p>
        </div>
        <div class="modes" role="group" aria-label="Input mode">
          <button data-mode="keyboard" class="${mouse ? "" : "on"}">${ICONS.keyboard}Keyboard</button>
          <button data-mode="mouse" class="${mouse ? "on" : ""}">${ICONS.keyboard}+${ICONS.mouse}Mouse</button>
          ${kbd("I")}
        </div>
      </header>
      <section class="moves">
        ${moves.map(([k, t]) => `<div class="move"><span class="keys">${k}</span><span>${t}</span></div>`).join("")}
      </section>
      <div class="units">
        ${playerCard(b)}
        <div class="enemies">${(["queen", ...b.enemies] as BoidKind[]).map((k) => enemyCard(k, b)).join("")}</div>
      </div>
      <p class="hint">${kbd("M")} mutes · ${kbd("Esc")} pauses</p>
      <button class="start" data-start>${b.reason === "pause" ? "Resume" : "Start"} <span>${kbd("Enter")} ${kbd("Space", true)}</span></button>
    </div>`;
}

// ---------------------------------------------------------------------------------------------
// Portraits: the in-game sprites, drawn into the cards' canvases
// ---------------------------------------------------------------------------------------------

/** Paint every `canvas[data-portrait]` under `root`. */
export function paintPortraits(root: HTMLElement, weapons: Weapon[]) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of Array.from(root.querySelectorAll<HTMLCanvasElement>("canvas[data-portrait]"))) {
    const size = c.clientWidth || 64;
    c.width = c.height = Math.round(size * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const kind = c.dataset.portrait!;
    if (kind === "player") paintPlayer(ctx, size, weapons);
    else {
      const k = (size / 64) * (kind === "queen" ? 1 : 2.6);
      // The queen's body sits behind her head: shift her down to centre it.
      ctx.translate(size / 2, size / 2 + (kind === "queen" ? 6 * k : 0));
      drawBoidBody(
        ctx,
        { kind: kind as BoidKind, id: 1, heading: -Math.PI / 2, phase: 0.06, lunge: 0, cooldown: 0, flash: 0, r: 8, flock: { engaged: true } },
        k,
      );
    }
  }
}

function paintPlayer(ctx: CanvasRenderingContext2D, size: number, weapons: Weapon[]) {
  const avatar = new Avatar();
  const s = (size / 64) * 1.7;
  const view: AvatarView = {
    mode: "air",
    x: 0,
    y: 0,
    alt: 0,
    facing: -Math.PI / 2,
    vz: 0,
    aim: null,
    spearReady: weapons.includes("spear"),
    frozen: false,
  };
  // Let the cloak settle behind the player.
  for (let i = 0; i < 90; i++) avatar.update(1 / 60, view);
  avatar.draw(ctx, view, (x, y) => ({ x: size / 2 + x * s, y: size / 2 + y * s, kt: s, kr: s, angle: 0, visible: true }));
}
