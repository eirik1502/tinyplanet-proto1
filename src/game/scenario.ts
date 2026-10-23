import type { LevelSpec } from "../levels/levels";

// A scenario: a level set up for testing one thing, always on the same planet when it has a
// seed. Pick one in the dev panel (Run → Scenario), with `?scenario=<id>` in the URL, or from the
// command line (`bun run sim --scenario <id>`). Scenarios live in src/scenarios.

export interface Scenario {
  id: string;
  name: string;
  /** What it's for. */
  blurb: string;
  spec: LevelSpec;
  /** The planet's seed; without one every round gets a new planet. */
  seed?: number;
}
