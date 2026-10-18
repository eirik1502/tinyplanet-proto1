# TinyPlanet Proto 1

A small browser game prototype set on a procedurally generated tiny planet. Climb islands, jump between them, and kill the queen.
![Ingame_screenshot_1.png](docs/Ingame_screenshot_1.png)

## Running

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev        # dev server with hot reload
bun run build      # production build to dist/
bun run typecheck
```

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | Climb; steer, speed up and brake while airborne |
| Space | Jump at once (hold for full height); press again in the air to double jump |
| Z / J | Sword |
| X / K | Spear (from level 3) |
| M | Mute / unmute sound |
| I | Switch input mode: keyboard only / keyboard + mouse |
| Esc | Pause and show the controls |

Each level opens with a briefing: pick the input mode, and see the controls and enemies for that
level. The first levels introduce things one at a time: level 1 has the sword and a small queen
flock of melee boids, level 2 adds ranged boids, and level 3 adds the spear and bombers. From level
4 on everything is unlocked and the swarm grows each level.

In keyboard + mouse mode, movement (climbing, air steering) stays on the arrows / WASD, but all
aiming follows the cursor: jumps launch toward it, double jumps look for an island around it, and
attacks point at it. Left click attacks with the sword and right click with the spear (Z / X still
work too). The mode is remembered between sessions.

Every flight has one double jump. Hitting an enemy while airborne refills it (max one) and regains
focus; a sword hit also bounces you up. Slow motion while winding up an air attack drains focus; grabbing a rim refills
it. The first dip below the rim in a flight springs you back up once.

Game parameters can be tweaked live from the in-game slider panel (defaults in `src/params.ts`).
