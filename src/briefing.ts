import { Avatar, type AvatarView } from "./avatar";
import type { BaseParams, BoidType } from "./boids/types";
import { drawBoidBody } from "./sprites";
import { padLabel, type PadLayout } from "./gamepad";
import { params } from "./tuning";

// The briefing shown before each level (and as the pause screen): input mode, a compact movement
// strip, the player's card with the unlocked attacks and air abilities as its properties, and a
// card per enemy on this level with its health and attack. Newly unlocked items are tagged.
// Texts stay short: only what you can't easily learn by playing.

export type InputMode = "keyboard" | "mouse" | "gamepad";
export type Weapon = "sword" | "spear";

export interface BriefingEnemy {
  type: BoidType<BaseParams>;
  params: BaseParams;
}

export interface BriefingInfo {
  level: number;
  /** Replaces "Level n" in the title. */
  heading?: string;
  /** The level's template. */
  template: { name: string; blurb: string; boss: boolean } | null;
  /** The level's modifiers. */
  modifiers: { name: string; blurb: string }[];
  /** Why the screen is up: a new level, a retry after defeat, or a pause mid-level. */
  reason: "new" | "retry" | "pause";
  inputMode: InputMode;
  /** The letters on the gamepad, for gamepad mode. */
  padLayout: PadLayout;
  weapons: Weapon[];
  /** A card per kind of enemy on the planet (the queen first): its type and params. */
  enemies: BriefingEnemy[];
  /** Weapons and enemy types (by id) unlocked on this level. */
  fresh: string[];
  /** Play the appearance animation on new items (on opening, not on re-renders). */
  animate: boolean;
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
  net: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v9M8 8l4 4 4-4"/><path d="M3 15c3 4 15 4 18 0"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>`,
  keyboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>`,
  gamepad: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10a5 5 0 0 1 4.9 6l-.7 3.4a2.4 2.4 0 0 1-4.2 1L15 15H9l-2 2.4a2.4 2.4 0 0 1-4.2-1L2.1 13A5 5 0 0 1 7 7z"/><path d="M7 10v3M5.5 11.5h3M16 11h.01M18 12.5h.01"/></svg>`,
  mouse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="2.5" width="12" height="19" rx="6"/><path d="M12 2.5V10M6 10h12"/></svg>`,
};

/** A mouse with its left or right button lit. */
function mouseButton(side: "left" | "right") {
  const fill = side === "left" ? "M12 3H12A6 6 0 0 0 6.2 9.5H12z" : "M12 3A6 6 0 0 1 17.8 9.5H12z";
  return `<span class="mouse" title="${side} click"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="${fill}" fill="currentColor" stroke="none"/><rect x="6" y="2.5" width="12" height="19" rx="6"/><path d="M12 2.5V10M6 10h12"/></svg></span>`;
}

const kbd = (k: string, wide = false) => `<kbd${wide ? ' class="wide"' : ""}>${k}</kbd>`;
/** The letters on the gamepad of the briefing being built. */
let layout: PadLayout = "xbox";
/** A gamepad button by code ("PadA": the bottom face button), labelled for the pad in use. */
function pad(code: string) {
  const label = padLabel(code, layout);
  return `<kbd class="pad${label.length === 1 ? " round" : ""}">${label}</kbd>`;
}
const stick = `<kbd class="pad round">L</kbd>`;
const arrows = `<span class="cluster"><span></span>${kbd("↑")}<span></span>${kbd("←")}${kbd("↓")}${kbd("→")}</span>`;
const or = `<span class="or">/</span>`;
/**
 * Class, style and corner badge for an entity that may be newly unlocked. Each new entity on the
 * sheet appears a little after the previous one.
 */
let freshCount = 0;
function freshMark(on: boolean) {
  if (!on) return { cls: "", style: "", badge: "" };
  return { cls: " fresh", style: `--d:${freshCount++ * 0.35}s;`, badge: '<span class="badge-new">NEW</span>' };
}
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
  const f = freshMark(!!a.fresh);
  return `
    <div class="ability${f.cls}" style="${f.style}">
      ${f.badge}
      <div class="ability-icon">${a.icon}</div>
      <div class="ability-body">
        <div class="ability-head"><b>${a.name}</b>${a.stats.map((s) => chip(s)).join("")}${a.input ? `<span class="ability-input">${a.input}</span>` : ""}</div>
        <div class="ability-text">${a.text}</div>
      </div>
    </div>`;
}

function playerCard(b: BriefingInfo) {
  const mouse = b.inputMode === "mouse";
  const gamepad = b.inputMode === "gamepad";
  const sw = params.player.sword;
  const sp = params.player.spear;
  const attacks: Ability[] = [];
  if (b.weapons.includes("sword"))
    attacks.push({
      icon: ICONS.sword,
      name: "Sword",
      text: "Hold to power up. Bounce on aerial hits.",
      stats: [`${fmt(sw.damage)}–${fmt(sw.maxDamage)} dmg`, `${fmt(sw.cooldown)}s recharge`],
      input: gamepad ? `${pad("PadB")}${or}${pad("PadRT")}` : mouse ? `${mouseButton("left")}${or}${kbd("Z")}` : `${kbd("Z")}${or}${kbd("J")}`,
      fresh: b.fresh.includes("sword"),
    });
  if (b.weapons.includes("spear"))
    attacks.push({
      icon: ICONS.spear,
      name: "Spear",
      text: "Hold to power up. Thrown.",
      stats: [`${fmt(sp.damage)}–${fmt(sp.maxDamage)} dmg`, `${fmt(sp.cooldown)}s recharge`],
      input: gamepad ? `${pad("PadX")}${or}${pad("PadLT")}` : mouse ? `${mouseButton("right")}${or}${kbd("X")}` : `${kbd("X")}${or}${kbd("K")}`,
      fresh: b.fresh.includes("spear"),
    });
  const passives: Ability[] = [
    {
      icon: ICONS.jump,
      name: "Double jump",
      text: "Refills on aerial hits.",
      stats: ["1 per flight"],
      input: `${gamepad ? pad("PadA") : kbd("Space", true)}<span class="or">in air</span>`,
    },
    {
      icon: ICONS.net,
      name: "Safety bounce",
      text: "Springs you back up from your first dip below the rim.",
      stats: ["1 per flight"],
    },
    {
      icon: ICONS.focus,
      name: "Focus",
      text: "Slow motion while aiming in the air. Refills on landing.",
      stats: [`${fmt(1 / params.player.focus.drain)}s budget`],
    },
  ];
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
      <div class="columns">
        <section><h4>Attacks</h4><div class="abilities attacks">${attacks.map(ability).join("")}</div></section>
        <section><h4>Abilities</h4><div class="abilities passives">${passives.map(ability).join("")}</div></section>
      </div>
    </article>`;
}

function enemyCard(e: BriefingEnemy, i: number, b: BriefingInfo) {
  const { type, params: p } = e;
  const f = freshMark(b.fresh.includes(type.id));
  const queen = type.id === "queen";
  return `
    <article class="unit enemy${queen ? " queen" : ""}${f.cls}" style="--c:${type.color};${f.style}">
      ${f.badge}
      <header>
        <canvas class="portrait" data-portrait="${i}"></canvas>
        <div>
          <h3>${type.name}</h3>
          <div class="stats">${chip(`${ICONS.heart}${fmt(p.hp)} HP`, "hp")}${p.size !== 1 ? chip(`size ×${fmt(p.size)}`) : ""}</div>
        </div>
      </header>
      <div class="abilities">${type
        .card(p)
        .map((a) => ability({ ...a, icon: ICONS[a.icon] }))
        .join("")}</div>
    </article>`;
}

export function briefingHtml(b: BriefingInfo): string {
  freshCount = 0;
  layout = b.padLayout;
  const mode = b.inputMode;
  const title =
    b.reason === "pause"
      ? `Paused · ${b.heading ?? `Level ${b.level}`}`
      : b.reason === "retry"
        ? `Retry ${b.heading?.toLowerCase() ?? `level ${b.level}`}`
        : (b.heading ?? `Level ${b.level}`);
  const moves =
    mode === "gamepad"
      ? [
          [`${stick}<span class="or">or d-pad</span>`, "Climb · steer in the air"],
          [pad("PadA"), "Jump · hold for height"],
        ]
      : [
          [`${arrows}<span class="or">or WASD</span>`, "Climb · steer in the air"],
          [kbd("Space", true), mode === "mouse" ? "Jump toward the cursor · hold for height" : "Jump · hold for height"],
        ];
  const modeButton = (m: InputMode, label: string) => `<button data-mode="${m}" class="${mode === m ? "on" : ""}">${label}</button>`;
  return `
    <div class="sheet${b.animate ? " intro" : ""}">
      <header class="top">
        <div>
          <h1>${title}${b.template ? `<span class="template"> · ${b.template.name}</span>` : ""}${b.template?.boss ? `<span class="boss">Boss</span>` : ""}</h1>
          ${b.template ? `<p class="blurb">${b.template.blurb}</p>` : ""}
          ${
            b.modifiers.length
              ? `<ul class="modifiers">${b.modifiers.map((m) => `<li><b>${m.name}</b> ${m.blurb}</li>`).join("")}</ul>`
              : ""
          }
          <p class="goal">${ICONS.crown}${b.enemies.some((e) => e.type.id === "queen") ? "Kill the queen" : "Kill every boid"}</p>
        </div>
        <div class="modes" role="group" aria-label="Input mode">
          ${modeButton("keyboard", `${ICONS.keyboard}Keyboard`)}
          ${modeButton("mouse", `${ICONS.keyboard}+${ICONS.mouse}Mouse`)}
          ${modeButton("gamepad", `${ICONS.gamepad}Gamepad`)}
          ${kbd("I")}
        </div>
      </header>
      <section class="moves">
        ${moves.map(([k, t]) => `<div class="move"><span class="keys">${k}</span><span>${t}</span></div>`).join("")}
      </section>
      <div class="units">
        ${playerCard(b)}
        <div class="enemies">${b.enemies.map((e, i) => enemyCard(e, i, b)).join("")}</div>
      </div>
      <p class="hint">${mode === "gamepad" ? `${pad("PadBack")} mutes · ${pad("PadStart")} pauses` : `${kbd("M")} mutes · ${kbd("Esc")} pauses`}</p>
      <button class="start" data-start>${b.reason === "pause" ? "Resume" : "Start"} <span>${mode === "gamepad" ? `${pad("PadA")} ${pad("PadStart")}` : `${kbd("Enter")} ${kbd("Space", true)}`}</span></button>
    </div>`;
}

// ---------------------------------------------------------------------------------------------
// Portraits: the in-game sprites, drawn into the cards' canvases
// ---------------------------------------------------------------------------------------------

/** Paint every `canvas[data-portrait]` under `root`. */
export function paintPortraits(root: HTMLElement, weapons: Weapon[], enemies: BriefingEnemy[]) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of Array.from(root.querySelectorAll<HTMLCanvasElement>("canvas[data-portrait]"))) {
    const size = c.clientWidth || 64;
    c.width = c.height = Math.round(size * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const which = c.dataset.portrait!;
    const enemy = enemies[Number(which)];
    if (which === "player") paintPlayer(ctx, size, weapons);
    else if (enemy) {
      const queen = enemy.type.id === "queen";
      const k = (size / 64) * (queen ? 1 : 2.6);
      // The queen's body sits behind her head: shift her down to centre it.
      ctx.translate(size / 2, size / 2 + (queen ? 6 * k : 0));
      // Portraits show every variant at the usual size; the card lists its size.
      const look = { id: 1, heading: -Math.PI / 2, phase: 0.06, lunge: 0, cooldown: 0, windup: 0, recover: 0, flash: 0, flock: { engaged: true } };
      drawBoidBody(ctx, enemy.type, { ...look, params: { ...enemy.params, size: 1 } }, k);
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
