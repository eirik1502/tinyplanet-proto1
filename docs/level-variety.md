# Level variety

Levels from 4 up are currently the same generator with linearly growing counts. Goal: make each
level feel distinct through templates (layout + swarm + queen + modifiers) that scale with level.

## 1. Layout generator refactor

- [x] Refactor `generateIslands` to take a `Layout` (`planet.ts`): `radius`, `gap`, `accept` (density map, 0..1) read at a `Spot`, and optional growth `seeds`
- [x] Port the current generator as the "scatter" layout (`levels.ts`)
- [x] Reachability pass: jump groups after generation; stepping stones across the narrowest crossing until connected
- [x] Make island shape a parameter: `IslandStyle.wobble` scales the harmonics (round / ragged)
- [ ] Elongated islands (stronger k=2 harmonic)
- [x] Make tree count a parameter (`IslandStyle.trees`)

## 2. Layouts

- [x] Ring: dense towards the edges, empty centre
- [ ] Core: dense centre, sparse outskirts
- [ ] Gradient: density rises (or falls) from start towards the queen
- [x] Clusters / archipelago: multiple growth seeds, tight gaps inside, stepping stones between
- [x] Gauntlet: a narrow band across the planet; start and queen end up at opposite ends
- [x] Pebbles: many small, round islands with few trees
- [ ] Continents / one giant + pebbles
- [ ] Long jumps: gaps near the double-/air-jump limit
- [ ] Noise field: value noise as the density map
- [ ] Spiral / hub-and-spokes: skeleton path first, islands grown along it

## 3. Level templates and scaling

- [x] `LevelTemplate` type (`levels.ts`): name, blurb, minLevel, layout, size/island multipliers, enemy mix, flock size, flock map
- [ ] Extend `LevelTemplate` with queen plan, modifiers, theme bias
- [x] Difficulty budget per level (`world.level4.budget` + `world.perLevel.budget`); per-boid costs (`world.costs`); templates split it by `mix`
- [x] Template picker: unlocked by `minLevel`, never the same template twice in a row; a retry keeps the template
- [x] Tuning: `world.levels.template` forces a template (0 = random)
- [ ] Turn intro levels 1–3 into fixed templates
- [ ] Milestone template every 5th level
- [x] Show template name + one-line flavour text on the briefing
- [x] Briefing only lists enemy kinds present on the planet

## 4. Swarm and queen variation

- [x] Flock placement density map: even, guard queen, middle, ambush near start
- [ ] Flock map: edge patrols
- [x] Flock size per template (one huge flock vs. many small)
- [ ] Queen placement options: farthest island, centre, densest cluster, over the void
- [ ] Reinforcement flocks arriving from the boundary over time
- [ ] Milestone queen variants: two queens, moving queen, shielded until N flocks are destroyed

## 5. Modifiers

- [ ] Modifier system: roll 0–1 at mid levels, 1–2 at high levels; list them on the briefing
- [ ] Crumbling islands (builds on "shake islands on land")
- [ ] Wind: constant lateral air drift
- [ ] Low / heavy gravity
- [ ] Fog: limited view radius
- [ ] Drifting islands: slow orbit around the planet centre
- [ ] Elite boids: fewer, tougher, bigger

## 6. Theme and identity

- [ ] Theme bias per template (constrain hue ranges in `generateTheme`)
- [ ] Per-template tree density

## 7. Tooling

- [ ] Tuning panel: template selector + seed field with instant regenerate
- [ ] Debug overlay: top-down view of islands, jump graph, flock and queen spawns

## Templates so far

| Template | From level | Layout | Twist |
|---|---|---|---|
| Open skies | 4 | scatter | the original mix |
| The ring | 4 | ring (planet ×1.25) | flocks gather in the empty middle |
| Archipelago | 4 | 3 clusters + stepping stones (×1.4) | flocks of 6 |
| The gauntlet | 5 | narrow band (×1.35, islands ×0.8) | ranged-heavy, ambush flocks past the start |
| Pebbles | 5 | small round islands (islands ×1.6) | bomber-heavy, flocks of 3 |
| Queen's court | 6 | scatter | flocks crowd around the queen |
