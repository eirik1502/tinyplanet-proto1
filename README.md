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
| X / K | Spear |

Every flight has one double jump. Hitting an enemy while airborne refills it (max one) and regains
focus; a sword hit also bounces you up. Slow motion while winding up an air attack drains focus; grabbing a rim refills
it. The first dip below the rim in a flight springs you back up once.

Game parameters can be tweaked live from the in-game slider panel (defaults in `src/params.ts`).
