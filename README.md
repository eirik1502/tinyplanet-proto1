# TinyPlanet Proto 1

A small browser game prototype set on a procedurally generated tiny planet. Climb islands, jump between them, and kill the queen.

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
| Arrows / WASD | Climb; steer while airborne |
| Space (hold) | Charge jump |
| Z / J | Sword |
| X / K | Spear |

Game parameters can be tweaked live from the in-game slider panel (defaults in `src/params.ts`).
