// Seeded randomness. The simulation draws only from seeded generators, so a world with the same
// seed, params and inputs (and the same step sizes) plays out the same way.

/** A random number generator: 0 ≤ value < 1. */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed from `rand`. */
export const nextSeed = (rand: Rng) => Math.floor(rand() * 1e9);
