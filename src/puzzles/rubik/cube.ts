// Cube model. A state is 54 stickers in the order U, R, F, D, L, B (9 per face).
// Each entry is the index of the face whose center has that sticker's color.
// This is the same layout that Kociemba-style solvers such as cubejs use.

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACES)[number];
export type Vec3 = readonly [number, number, number];
export type CubeState = readonly number[];

/** A face turn. Turns counts clockwise quarter turns, so 3 means counterclockwise. */
export interface Move {
  face: Face;
  turns: 1 | 2 | 3;
}

export const FACE_NORMALS: Record<Face, Vec3> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

export interface Sticker {
  index: number;
  face: Face;
  /** Cubie position on a grid from -1 to 1. X points right, y up and z toward the viewer. */
  pos: Vec3;
  normal: Vec3;
}

// Each face is read row by row in its standard orientation.
// U is read with F at the bottom, D with F at the top and the side faces with U at the top.
function stickerPos(face: Face, r: number, c: number): Vec3 {
  switch (face) {
    case 'U':
      return [c - 1, 1, r - 1];
    case 'R':
      return [1, 1 - r, 1 - c];
    case 'F':
      return [c - 1, 1 - r, 1];
    case 'D':
      return [c - 1, -1, 1 - r];
    case 'L':
      return [-1, 1 - r, c - 1];
    case 'B':
      return [1 - c, 1 - r, -1];
  }
}

export const STICKERS: Sticker[] = FACES.flatMap((face, f) =>
  Array.from({ length: 9 }, (_, i) => ({
    index: f * 9 + i,
    face,
    pos: stickerPos(face, Math.floor(i / 3), i % 3),
    normal: FACE_NORMALS[face],
  })),
);

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const keyOf = (pos: Vec3, normal: Vec3) => [...pos, ...normal].map((v) => v + 0).join(',');

// A clockwise quarter turn of a face is a rotation of -90 degrees about its outward normal.
function rotateClockwise(v: Vec3, n: Vec3): Vec3 {
  const d = dot(n, v);
  const cross: Vec3 = [
    n[1] * v[2] - n[2] * v[1],
    n[2] * v[0] - n[0] * v[2],
    n[0] * v[1] - n[1] * v[0],
  ];
  return [n[0] * d - cross[0], n[1] * d - cross[1], n[2] * d - cross[2]];
}

const INDEX_BY_KEY = new Map(STICKERS.map((s) => [keyOf(s.pos, s.normal), s.index]));

/** A permutation p means newState[i] = oldState[p[i]]. */
export type Perm = readonly number[];

function quarterTurnPerm(face: Face): Perm {
  const n = FACE_NORMALS[face];
  const perm = Array.from({ length: 54 }, (_, i) => i);
  for (const s of STICKERS) {
    if (dot(s.pos, n) !== 1) continue;
    const dest = INDEX_BY_KEY.get(keyOf(rotateClockwise(s.pos, n), rotateClockwise(s.normal, n)));
    if (dest === undefined) throw new Error('Sticker geometry is inconsistent.');
    perm[dest] = s.index;
  }
  return perm;
}

export const composePerms = (first: Perm, second: Perm): Perm => second.map((i) => first[i]);

const MOVE_PERMS: Perm[] = FACES.flatMap((face) => {
  const q = quarterTurnPerm(face);
  const half = composePerms(q, q);
  return [q, half, composePerms(half, q)];
});

export const movePerm = (m: Move): Perm => MOVE_PERMS[FACES.indexOf(m.face) * 3 + m.turns - 1];

export const applyPerm = (state: CubeState, perm: Perm): number[] => perm.map((i) => state[i]);

export const applyMove = (state: CubeState, m: Move): number[] => applyPerm(state, movePerm(m));

export function applyMoves(state: CubeState, moves: readonly Move[]): number[] {
  let s = [...state];
  for (const m of moves) s = applyMove(s, m);
  return s;
}

export const algPerm = (moves: readonly Move[]): Perm =>
  moves.reduce<Perm>((acc, m) => composePerms(acc, movePerm(m)), Array.from({ length: 54 }, (_, i) => i));

export const SOLVED: CubeState = Array.from({ length: 54 }, (_, i) => Math.floor(i / 9));

export const isSolved = (state: CubeState) => state.every((v, i) => v === Math.floor(i / 9));

export const formatMove = (m: Move) => m.face + (m.turns === 1 ? '' : m.turns === 2 ? '2' : "'");
export const formatAlg = (moves: readonly Move[]) => moves.map(formatMove).join(' ');

export function parseAlg(alg: string): Move[] {
  return alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const face = token[0] as Face;
      if (!FACES.includes(face)) throw new Error(`Unknown move "${token}".`);
      const suffix = token.slice(1);
      const turns = suffix === '' ? 1 : suffix === '2' ? 2 : suffix === "'" ? 3 : null;
      if (turns === null) throw new Error(`Unknown move "${token}".`);
      return { face, turns };
    });
}

export const invertMove = (m: Move): Move => ({ face: m.face, turns: (4 - m.turns) as 1 | 2 | 3 });
export const invertAlg = (moves: readonly Move[]): Move[] => [...moves].reverse().map(invertMove);

export const toFaceletString = (state: CubeState) => state.map((v) => FACES[v]).join('');
export const fromFaceletString = (s: string) => [...s].map((ch) => FACES.indexOf(ch as Face));

export function randomMoves(count: number, random: () => number = Math.random): Move[] {
  const moves: Move[] = [];
  while (moves.length < count) {
    const face = FACES[Math.floor(random() * 6)];
    if (moves.length && moves[moves.length - 1].face === face) continue;
    moves.push({ face, turns: (1 + Math.floor(random() * 3)) as 1 | 2 | 3 });
  }
  return moves;
}

// Sticker indices of every corner and edge position.
// The first sticker of each piece is the one on U or D (or on F or B for middle edges).
// Corner stickers are listed clockwise, which the twist check below relies on.
export const CORNERS: readonly (readonly number[])[] = [
  [8, 9, 20], // URF
  [6, 18, 38], // UFL
  [0, 36, 47], // ULB
  [2, 45, 11], // UBR
  [29, 26, 15], // DFR
  [27, 44, 24], // DLF
  [33, 53, 42], // DBL
  [35, 17, 51], // DRB
];

export const EDGES: readonly (readonly number[])[] = [
  [5, 10], // UR
  [7, 19], // UF
  [3, 37], // UL
  [1, 46], // UB
  [32, 16], // DR
  [28, 25], // DF
  [30, 43], // DL
  [34, 52], // DB
  [23, 12], // FR
  [21, 41], // FL
  [50, 39], // BL
  [48, 14], // BR
];

const homeFace = (index: number) => Math.floor(index / 9);

export type ValidationProblem =
  | { kind: 'counts'; counts: number[] }
  | { kind: 'centers' }
  | { kind: 'corner-piece' }
  | { kind: 'edge-piece' }
  | { kind: 'corner-twist' }
  | { kind: 'edge-flip' }
  | { kind: 'parity' };

function permutationParity(perm: number[]): number {
  const seen = new Array(perm.length).fill(false);
  let parity = 0;
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let length = 0;
    for (let j = i; !seen[j]; j = perm[j]) {
      seen[j] = true;
      length++;
    }
    parity ^= (length - 1) & 1;
  }
  return parity;
}

/** Returns null when the state can be reached on a real cube, or the first problem found. */
export function validate(state: CubeState): ValidationProblem | null {
  const counts = new Array(6).fill(0);
  for (const v of state) counts[v]++;
  if (counts.some((c) => c !== 9)) return { kind: 'counts', counts };
  for (let f = 0; f < 6; f++) if (state[f * 9 + 4] !== f) return { kind: 'centers' };

  const cornerPerm: number[] = [];
  let twist = 0;
  for (const position of CORNERS) {
    const colors = position.map((i) => state[i]);
    let found = false;
    for (let piece = 0; piece < 8 && !found; piece++) {
      const home = CORNERS[piece].map(homeFace);
      for (let o = 0; o < 3 && !found; o++) {
        if (home.every((face, t) => colors[(o + t) % 3] === face)) {
          cornerPerm.push(piece);
          twist += o;
          found = true;
        }
      }
    }
    if (!found) return { kind: 'corner-piece' };
  }
  if (new Set(cornerPerm).size !== 8) return { kind: 'corner-piece' };

  const edgePerm: number[] = [];
  let flip = 0;
  for (const position of EDGES) {
    const colors = position.map((i) => state[i]);
    let found = false;
    for (let piece = 0; piece < 12 && !found; piece++) {
      const home = EDGES[piece].map(homeFace);
      for (let o = 0; o < 2 && !found; o++) {
        if (home.every((face, t) => colors[(o + t) % 2] === face)) {
          edgePerm.push(piece);
          flip += o;
          found = true;
        }
      }
    }
    if (!found) return { kind: 'edge-piece' };
  }
  if (new Set(edgePerm).size !== 12) return { kind: 'edge-piece' };

  if (twist % 3 !== 0) return { kind: 'corner-twist' };
  if (flip % 2 !== 0) return { kind: 'edge-flip' };
  if (permutationParity(cornerPerm) !== permutationParity(edgePerm)) return { kind: 'parity' };
  return null;
}

const rotateAbout = (axis: Vec3) => (v: Vec3) => rotateClockwise(v, axis);

/** The same cube seen in each of its 24 orientations. Colors are renamed to follow the centers. */
export function allOrientations(state: CubeState): number[][] {
  const quarterX = rotateAbout(FACE_NORMALS.R);
  const quarterY = rotateAbout(FACE_NORMALS.U);
  const repeat = (f: (v: Vec3) => Vec3, times: number) => (v: Vec3) => {
    let out = v;
    for (let k = 0; k < times; k++) out = f(out);
    return out;
  };
  const results = new Map<string, number[]>();
  // Any orientation is reached by x turns, then y turns, then x turns again.
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      for (let c = 0; c < 4; c++) {
        const turn = (v: Vec3) => repeat(quarterX, c)(repeat(quarterY, b)(repeat(quarterX, a)(v)));
        // A center sticker has the same position and normal, so this finds each center's new face.
        const rename = FACES.map((f) => INDEX_BY_KEY.get(keyOf(turn(FACE_NORMALS[f]), turn(FACE_NORMALS[f])))!);
        const out = new Array<number>(54);
        for (const s of STICKERS) {
          const dest = INDEX_BY_KEY.get(keyOf(turn(s.pos), turn(s.normal)))!;
          out[dest] = Math.floor(rename[state[s.index]] / 9);
        }
        results.set(out.join(''), out);
      }
    }
  }
  return [...results.values()];
}
