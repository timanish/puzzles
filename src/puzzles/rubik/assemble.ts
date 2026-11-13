// Builds a cube state from six faces that were seen in any order and at any rotation.
// Nothing is known about which face sits where, so every arrangement is tried
// and the one whose edges and corners form real cube pieces wins.

import { labDistance, rgbToLab, type RGB } from '../../shared/color';
import { classify, colorCost, nameCenters, type PaletteColor } from './colors';
import { CORNERS, EDGES, validate } from './cube';

export interface AssembledCube {
  stickers: number[];
  palette: PaletteColor[];
  /** False when no arrangement gave a possible cube. The best guess is returned anyway. */
  valid: boolean;
}

// ROTATIONS[k][i] is the cell that ends up at position i after k clockwise quarter turns.
const ROTATIONS: number[][] = [0, 1, 2, 3].map((k) => {
  let cells = Array.from({ length: 9 }, (_, i) => i);
  for (let n = 0; n < k; n++) cells = cells.map((_, i) => cells[(2 - (i % 3)) * 3 + Math.floor(i / 3)]);
  return cells;
});

const home = (index: number) => Math.floor(index / 9);

// Lookup from the colors on a piece position to the piece they form, or -1 if no such piece exists.
const CORNER_ID = new Int8Array(216).fill(-1);
CORNERS.forEach((corner, id) => {
  const h = corner.map(home);
  for (let o = 0; o < 3; o++) CORNER_ID[h[o] * 36 + h[(o + 1) % 3] * 6 + h[(o + 2) % 3]] = id;
});
const EDGE_ID = new Int8Array(36).fill(-1);
EDGES.forEach((edge, id) => {
  const h = edge.map(home);
  EDGE_ID[h[0] * 6 + h[1]] = id;
  EDGE_ID[h[1] * 6 + h[0]] = id;
});

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [item, ...p]));
}

interface Arrangement {
  /** For each slot in U, R, F, D, L, B order: which scanned face goes there and how it is turned. */
  face: number[];
  turn: number[];
  score: number;
}

/** Faces are six lists of nine colors, each in reading order as the camera saw it. */
export function assembleCube(faces: RGB[][]): AssembledCube {
  const labs = faces.map((face) => face.map(rgbToLab));
  const centers = labs.map((face) => face[4]);

  // First guess at each sticker's color: the nearest center, with nine stickers per color.
  const labels = faces.map(() => new Array<number>(9).fill(-1));
  const remaining = new Array(6).fill(8);
  const pairs: { f: number; i: number; color: number; d: number }[] = [];
  labs.forEach((face, f) =>
    face.forEach((lab, i) => {
      if (i === 4) labels[f][4] = f;
      else centers.forEach((center, color) => pairs.push({ f, i, color, d: colorCost(lab, center) }));
    }),
  );
  pairs.sort((a, b) => a.d - b.d);
  for (const { f, i, color } of pairs) {
    if (labels[f][i] !== -1 || remaining[color] === 0) continue;
    labels[f][i] = color;
    remaining[color]--;
  }

  // The white face goes on the bottom so that the beginner method starts with the white cross.
  const white = rgbToLab([240, 240, 240]);
  const base = centers.reduce((bestFace, c, f) => (labDistance(c, white) < labDistance(centers[bestFace], white) ? f : bestFace), 0);
  const others = [0, 1, 2, 3, 4, 5].filter((f) => f !== base);

  const state = new Int8Array(54);
  const slotOf = new Int8Array(6);
  const best: Arrangement[] = [];
  const KEEP = 6;

  for (const order of permutations(others)) {
    // Slots are U, R, F, D, L, B. The base face is fixed at D without a turn, which removes
    // the 24 ways of looking at one and the same cube.
    const face = [order[0], order[1], order[2], base, order[3], order[4]];
    face.forEach((f, slot) => (slotOf[f] = slot));
    for (let code = 0; code < 1024; code++) {
      const turn = [code & 3, (code >> 2) & 3, (code >> 4) & 3, 0, (code >> 6) & 3, (code >> 8) & 3];
      for (let slot = 0; slot < 6; slot++) {
        const source = labels[face[slot]];
        const map = ROTATIONS[turn[slot]];
        for (let i = 0; i < 9; i++) state[slot * 9 + i] = slotOf[source[map[i]]];
      }
      let cornersSeen = 0;
      let edgesSeen = 0;
      for (const [a, b, c] of CORNERS) {
        const id = CORNER_ID[state[a] * 36 + state[b] * 6 + state[c]];
        if (id >= 0) cornersSeen |= 1 << id;
      }
      for (const [a, b] of EDGES) {
        const id = EDGE_ID[state[a] * 6 + state[b]];
        if (id >= 0) edgesSeen |= 1 << id;
      }
      let score = 0;
      for (let m = cornersSeen; m; m &= m - 1) score++;
      for (let m = edgesSeen; m; m &= m - 1) score++;
      if (best.length < KEEP || score > best[best.length - 1].score) {
        best.push({ face, turn, score });
        best.sort((x, y) => y.score - x.score);
        if (best.length > KEEP) best.pop();
      }
    }
  }

  // Re-read the colors piece by piece for the most promising arrangements.
  // That step can still repair a few stickers that the first guess got wrong.
  let chosen: ReturnType<typeof classify> | null = null;
  let fallback: ReturnType<typeof classify> | null = null;
  for (const { face, turn } of best) {
    const samples = face.map((f, slot) => ROTATIONS[turn[slot]].map((i) => faces[f][i]));
    const result = classify(samples);
    fallback ??= result;
    if (!validate(result.stickers) && (!chosen || result.cost < chosen.cost)) chosen = result;
  }
  const result = chosen ?? fallback!;
  return { stickers: result.stickers, palette: nameCenters(result.refs), valid: chosen !== null };
}
