# Level variety

Make each level feel distinct through templates (layout + swarm + queen + modifiers) that scale
with level. `PROGRESSION` in `src/levels.ts` says which template each level uses.

## 1. Layout generator

- [x] `generateIslands` takes a `Layout` (`planet.ts`): `radius`, `gap`, `accept` (density map, 0..1) read at a `Spot`, optional growth `seeds`, optional preferred `start`
- [x] Port the original generator as the "scatter" layout
- [x] Reachability pass: jump groups after generation; stepping stones across the narrowest crossing until connected
- [x] Island shape: `IslandStyle.wobble` scales the harmonics (round / ragged)
- [ ] Elongated islands (stronger k=2 harmonic; needs more spacing padding than the current 1.3)
- [x] Tree count: `IslandStyle.trees`, scaled up by area on bigger islands

## 2. Layouts

- [x] Ring: dense towards the edges, empty centre
- [x] Core: dense centre, open sky around it
- [x] Gradient: sparse at the start, dense toward the far side
- [x] Clusters / archipelago: multiple growth seeds, tight gaps inside, stepping stones between
- [x] Gauntlet: a narrow band across the planet; start and queen at opposite ends
- [x] Pebbles: many small, round islands with few trees
- [x] Continents: a few huge islands with pebbles between
- [x] Long leaps: gaps near the jump limit
- [x] Wilds: value noise as the density map
- [ ] Spiral / hub-and-spokes: skeleton path first, islands grown along it

## 3. Templates and progression

- [x] `LevelTemplate`: name, blurb, boss, layout, size/islands/budget multipliers, enemy mix, flock size, flock map, queen spot, queen health, theme, modifiers, fixed (intro) values
- [x] Difficulty budget per level (`world.level4.budget` + `world.perLevel.budget`); per-boid costs (`world.costs`); templates split it by `mix`
- [x] `PROGRESSION`: each entry (a template or a pool) is in effect from its level until the next entry; the last one stays in effect
- [x] Pool picks never repeat the previous level's template; a retry keeps template and modifiers
- [x] Intro levels 1–3 are fixed templates (values from `world.intro1..3`)
- [x] Boss levels 8, 13 and 18, with separate pools between them
- [ ] Levels past 18 (currently the last boss repeats; add entries or an endless rule)
- [x] Tuning: `world.levels.template` forces a pool template (0 = random)
- [x] Briefing: template name, blurb, boss tag, modifiers; only enemy kinds present on the planet

## 4. Swarm and queen variation

- [x] Flock maps: even, guard queen, middle, edges, ambush near start
- [x] Flock size per template
- [x] Queen spot: farthest from start, nearest the centre, most crowded island
- [ ] Queen over the void (needs a way to reach her: she'd have to come to the player)
- [x] Reinforcements: hunting flocks arrive from the boundary every N s, up to a swarm cap (boss only)
- [x] Shielded queen: immune until a share of the swarm is killed; bubble + HUD count (boss only)
- [ ] Two queens / moving queen (combat assumes one queen throughout)

## 5. Modifiers

- [x] Modifier system: from `world.levels.modifiersFrom` (9) 0–1 rolled, from `twoModifiersFrom` (14) 1–2; boss-only ones are never rolled; listed on the briefing and HUD
- [x] Wind: steady air drift, with streaks on screen
- [x] Low / heavy gravity
- [x] Fog: view radius around the player
- [x] Elite swarm: bigger boids with double health (boss only)
- [ ] Crumbling islands (builds on "shake islands on land")
- [ ] Drifting islands: slow orbit around the planet centre

## 6. Theme and identity

- [x] Theme hint per template (vegetation hue / saturation ranges)
- [x] Per-template tree density (via layout style)

## 7. Tooling

- [ ] Tuning panel: seed field with instant regenerate
- [ ] Debug overlay: top-down view of islands, jump graph, flock and queen spawns

## Progression

| Level | Template(s) |
|---|---|
| 1 | First flight |
| 2 | Crossfire |
| 3 | Bombs away |
| 4–7 | Open skies, The ring, Archipelago, Pebbles |
| 8 | **Boss: The hive**: core layout, shielded queen at the centre, reinforcements, queen ×2 HP, budget ×0.8 |
| 9–12 | The gauntlet, Queen's court, The citadel, Long leaps (modifiers from here) |
| 13 | **Boss: Royal guard**: clusters, elite swarm, shielded queen, fog, queen ×2.5 HP, budget ×0.5 |
| 14–17 | The thicket, Continents, The wilds (up to two modifiers) |
| 18 | **Boss: The storm**: ring, wind, elite swarm, reinforcements, queen ×3 HP, budget ×0.5 |
