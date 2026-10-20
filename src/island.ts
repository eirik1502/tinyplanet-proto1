export interface Vec { x: number; y: number }

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EdgePoint {
  x: number;
  y: number;
  /** outward normal */
  nx: number;
  ny: number;
  /** tangent, in the direction of increasing s */
  tx: number;
  ty: number;
}

export interface Tree { x: number; y: number; r: number; tint: number }

/** A rock slice of the island's underside, used to stack up a 3D-looking body. */
export interface Slice { alt: number; pts: Vec[]; depth: number; cliff: boolean }

/** Island top altitude above the haze surface. */
export const ISLAND_TOP = 120;
export const ROOT_BOTTOM = 8;
const CLIFF = 34;
const CLIFF_SLICES = 9;
const ROOT_SLICES = 18;

/** How an island looks: outline wobble (1 = the default) and how many trees it carries. */
export interface IslandStyle {
  /** Scales the outline's harmonics: low is round, high is ragged. Keep ≤ 1.1 (spacing pads for ~30% wobble). */
  wobble: number;
  trees: number;
}

export const DEFAULT_STYLE: IslandStyle = { wobble: 1, trees: 6 };

export class Island {
  readonly pts: Vec[] = [];
  /** cumulative perimeter length at each vertex; cum[n] = perimeter */
  readonly cum: number[] = [];
  readonly perimeter: number;
  readonly slices: Slice[] = [];
  readonly trees: Tree[] = [];
  readonly inner: Vec[] = [];

  constructor(
    readonly cx: number,
    readonly cy: number,
    readonly radius: number,
    seed: number,
    style: IslandStyle = DEFAULT_STYLE,
  ) {
    const rand = mulberry32(seed);
    const n = 64;
    const harm = [2, 3, 5, 8].map((k, i) => ({ k, amp: [0.13, 0.09, 0.05, 0.025][i]! * style.wobble, ph: rand() * Math.PI * 2 }));
    const radiusAt = (a: number) => radius * (1 + harm.reduce((acc, h) => acc + h.amp * Math.sin(h.k * a + h.ph), 0));

    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = radiusAt(a);
      this.pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    let acc = 0;
    for (let i = 0; i < n; i++) {
      this.cum.push(acc);
      const a = this.pts[i]!;
      const b = this.pts[(i + 1) % n]!;
      acc += Math.hypot(b.x - a.x, b.y - a.y);
    }
    this.cum.push(acc);
    this.perimeter = acc;

    // Lighter inner meadow
    for (const p of this.pts) this.inner.push({ x: cx + (p.x - cx) * 0.82, y: cy + (p.y - cy) * 0.82 });

    // Body: a near-vertical cliff band under the grass (its camera-facing side shows in
    // perspective), then a tapering, increasingly ragged root hanging down into the haze.
    const jitter = this.pts.map(() => rand() * 2 - 1);
    const drip = this.pts.map(() => rand());
    const cliffBottom = ISLAND_TOP - CLIFF;
    for (let j = 1; j <= CLIFF_SLICES; j++) {
      const u = j / CLIFF_SLICES;
      const alt = ISLAND_TOP - 3 - u * (CLIFF - 3);
      const pts = this.pts.map((p, i) => {
        const k = 1 - 0.035 * u + jitter[i]! * 0.012 * u;
        return { x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k };
      });
      this.slices.push({ alt, pts, depth: (ISLAND_TOP - alt) / (ISLAND_TOP - ROOT_BOTTOM), cliff: true });
    }
    for (let j = 1; j <= ROOT_SLICES; j++) {
      const t = j / ROOT_SLICES;
      const alt = cliffBottom - t * (cliffBottom - ROOT_BOTTOM);
      const base = 0.96 * (1 - 0.92 * Math.pow(t, 1.1));
      const pts = this.pts.map((p, i) => {
        // Some vertices "drip" lower than others, giving a stalactite-like silhouette.
        const k = Math.max(0.03, base * (1 - t * 0.5 * drip[i]!) + jitter[i]! * 0.06 * t);
        return { x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k };
      });
      this.slices.push({ alt, pts, depth: (ISLAND_TOP - alt) / (ISLAND_TOP - ROOT_BOTTOM), cliff: false });
    }

    // Trees, kept away from the rim so the edge stays readable.
    let tries = 0;
    while (this.trees.length < style.trees && tries++ < 200) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * radiusAt(a) * 0.62;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      const r = 14 + rand() * 12;
      if (this.trees.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + r + 8)) continue;
      this.trees.push({ x, y, r, tint: rand() });
    }
  }

  /** Rough horizontal scale of the island body at an altitude (1 at the top, shrinking down the root). */
  scaleAt(alt: number): number {
    const cliffBottom = ISLAND_TOP - CLIFF;
    if (alt >= cliffBottom) return 0.98;
    const t = Math.min(1, (cliffBottom - alt) / (cliffBottom - ROOT_BOTTOM));
    return Math.max(0.03, 0.96 * (1 - 0.92 * Math.pow(t, 1.1)) * (1 - 0.25 * t));
  }

  /** Does a ball of radius `r` at (px, py, alt) touch the island's body? */
  intersects(px: number, py: number, alt: number, r: number): boolean {
    if (alt > ISLAND_TOP + r * 0.5 || alt < ROOT_BOTTOM) return false;
    const k = this.scaleAt(alt);
    // Map into the top outline's frame, where the body at this altitude is the outline scaled by k.
    const qx = this.cx + (px - this.cx) / k;
    const qy = this.cy + (py - this.cy) / k;
    return this.contains(qx, qy) || this.closest(qx, qy).d * k < r;
  }

  pointAt(s: number): EdgePoint {
    const P = this.perimeter;
    s = ((s % P) + P) % P;
    const n = this.pts.length;
    let i = 0;
    // n is small; linear scan is fine.
    while (i < n - 1 && this.cum[i + 1]! <= s) i++;
    const a = this.pts[i]!;
    const b = this.pts[(i + 1) % n]!;
    const segLen = this.cum[i + 1]! - this.cum[i]!;
    const u = (s - this.cum[i]!) / segLen;
    const tx = (b.x - a.x) / segLen;
    const ty = (b.y - a.y) / segLen;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, tx, ty, nx: ty, ny: -tx };
  }

  /** Closest point on the rim. Returns its perimeter parameter and distance. */
  closest(px: number, py: number): { s: number; d: number } {
    const n = this.pts.length;
    let best = { s: 0, d: Infinity };
    for (let i = 0; i < n; i++) {
      const a = this.pts[i]!;
      const b = this.pts[(i + 1) % n]!;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len2 = ex * ex + ey * ey;
      const u = Math.max(0, Math.min(1, ((px - a.x) * ex + (py - a.y) * ey) / len2));
      const d = Math.hypot(a.x + ex * u - px, a.y + ey * u - py);
      if (d < best.d) best = { s: this.cum[i]! + u * Math.sqrt(len2), d };
    }
    return best;
  }

  /** First crossing of the rim by the segment a→b, as its perimeter parameter, or null. */
  segmentHit(ax: number, ay: number, bx: number, by: number): number | null {
    const n = this.pts.length;
    const dx = bx - ax;
    const dy = by - ay;
    let bestT = Infinity;
    let bestS: number | null = null;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i]!;
      const q = this.pts[(i + 1) % n]!;
      const ex = q.x - p.x;
      const ey = q.y - p.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((p.x - ax) * ey - (p.y - ay) * ex) / den;
      const u = ((p.x - ax) * dy - (p.y - ay) * dx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < bestT) {
        bestT = t;
        bestS = this.cum[i]! + u * Math.hypot(ex, ey);
      }
    }
    return bestS;
  }

  contains(px: number, py: number): boolean {
    let inside = false;
    const n = this.pts.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = this.pts[i]!;
      const b = this.pts[j]!;
      if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
}
