// Turns raw sticker colors into a cube state.
// Stickers are compared with the six scanned centers instead of fixed reference colors,
// which keeps the result stable under warm, dim or uneven lighting.

import { labDistance, rgbToLab, type RGB } from '../../shared/color';
import { CORNERS, EDGES } from './cube';

export interface PaletteColor {
  name: string;
  css: string;
}

const REFERENCE: (PaletteColor & { rgb: RGB })[] = [
  { name: 'white', css: '#f2f2f2', rgb: [240, 240, 240] },
  { name: 'yellow', css: '#ffd500', rgb: [245, 210, 30] },
  { name: 'red', css: '#d32f2f', rgb: [200, 35, 40] },
  { name: 'orange', css: '#ff8a1f', rgb: [250, 120, 30] },
  { name: 'blue', css: '#1e5fd8', rgb: [20, 80, 190] },
  { name: 'green', css: '#1faa55', rgb: [20, 160, 80] },
];

const byName = (name: string) => REFERENCE.find((c) => c.name === name)!;

/** Standard color scheme in U, R, F, D, L, B order. Used for manual entry and demos. */
export const DEFAULT_PALETTE: PaletteColor[] = ['white', 'red', 'green', 'yellow', 'orange', 'blue'].map((n) => {
  const { name, css } = byName(n);
  return { name, css };
});

function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
}

// Names the six centers by trying every one-to-one pairing with the reference colors.
export function nameCenters(centers: number[][]): PaletteColor[] {
  const refs = REFERENCE.map((c) => rgbToLab(c.rgb));
  let best: number[] = [];
  let bestCost = Infinity;
  for (const p of permutations(6)) {
    const cost = p.reduce((sum, ref, face) => sum + labDistance(centers[face], refs[ref]), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = p;
    }
  }
  return best.map((ref) => ({ name: REFERENCE[ref].name, css: REFERENCE[ref].css }));
}

// Shading changes lightness far more than hue, so lightness counts for less.
const LIGHTNESS_WEIGHT = 0.5;
export const colorCost = (a: readonly number[], b: readonly number[]) =>
  Math.hypot((a[0] - b[0]) * LIGHTNESS_WEIGHT, a[1] - b[1], a[2] - b[2]);

const homeFace = (index: number) => Math.floor(index / 9);

/**
 * Decides which real piece sits at each position, using every piece exactly once.
 * This is what keeps red and orange apart: a sticker is judged together with the
 * other stickers on its piece, and a piece that is already used cannot be picked again.
 * Returns the total color error of the best assignment and writes it into out.
 */
function matchPieces(
  labs: number[][],
  refs: number[][],
  positions: readonly (readonly number[])[],
  out: number[],
): number {
  const n = positions.length;
  const size = positions[0].length;
  const cost: number[][] = [];
  const orient: number[][] = [];
  for (let pos = 0; pos < n; pos++) {
    cost.push([]);
    orient.push([]);
    for (let piece = 0; piece < n; piece++) {
      let best = Infinity;
      let bestO = 0;
      for (let o = 0; o < size; o++) {
        let c = 0;
        for (let t = 0; t < size; t++) c += colorCost(labs[positions[pos][(o + t) % size]], refs[homeFace(positions[piece][t])]);
        if (c < best) {
          best = c;
          bestO = o;
        }
      }
      cost[pos].push(best);
      orient[pos].push(bestO);
    }
  }

  // Cheapest one-to-one assignment, found by dynamic programming over sets of used pieces.
  const full = (1 << n) - 1;
  const dp = new Float64Array(full + 1).fill(Infinity);
  const choice = new Int8Array(full + 1);
  dp[0] = 0;
  for (let mask = 0; mask < full; mask++) {
    if (dp[mask] === Infinity) continue;
    let pos = 0;
    for (let m = mask; m; m &= m - 1) pos++;
    for (let piece = 0; piece < n; piece++) {
      const next = mask | (1 << piece);
      if (next === mask) continue;
      const value = dp[mask] + cost[pos][piece];
      if (value < dp[next]) {
        dp[next] = value;
        choice[next] = piece;
      }
    }
  }
  for (let pos = n - 1, mask = full; pos >= 0; pos--) {
    const piece = choice[mask];
    const o = orient[pos][piece];
    for (let t = 0; t < size; t++) out[positions[pos][(o + t) % size]] = homeFace(positions[piece][t]);
    mask ^= 1 << piece;
  }
  return dp[full];
}

/** Samples are 6 faces of 9 colors each, in U, R, F, D, L, B order. */
export function classify(samples: RGB[][]): { stickers: number[]; refs: number[][]; cost: number } {
  const labs = samples.flat().map(rgbToLab);
  let refs: number[][] = samples.map((_, f) => labs[f * 9 + 4]);
  const stickers = Array.from({ length: 54 }, (_, i) => homeFace(i));
  let cost = Infinity;

  // The centers are only a first guess at each color, and a center may carry a logo.
  // After each pass the reference colors are replaced by the average of their stickers.
  for (let pass = 0; pass < 3; pass++) {
    cost = matchPieces(labs, refs, CORNERS, stickers) + matchPieces(labs, refs, EDGES, stickers);
    refs = refs.map((_, f) => {
      const mine = labs.filter((_, i) => stickers[i] === f);
      return [0, 1, 2].map((k) => mine.reduce((sum, lab) => sum + lab[k], 0) / mine.length);
    });
  }
  return { stickers, refs, cost };
}
