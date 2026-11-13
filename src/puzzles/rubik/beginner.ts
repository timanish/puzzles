// Layer-by-layer solver that mirrors the usual beginner method.
// Each stage runs a small search over the handful of algorithms a beginner would use,
// so the output reads like a tutorial instead of an arbitrary move list.

import {
  CORNERS,
  EDGES,
  FACES,
  algPerm,
  applyPerm,
  isSolved,
  parseAlg,
  type CubeState,
  type Face,
  type Move,
  type Perm,
} from './cube';
import { makeSolution, type Solution, type SolveStage, type SolveStep } from './solution';

interface Macro {
  alg: Move[];
  perm: Perm;
  /** Two macros with the same group are never applied back to back. */
  group?: string;
  /** Pure top-layer adjustments are folded into the next algorithm when steps are built. */
  setup?: boolean;
}

const SIDES: Face[] = ['F', 'R', 'B', 'L'];
const home = (index: number) => Math.floor(index / 9);
const faceIndex = (face: Face) => FACES.indexOf(face);

function macro(alg: string, extra: Partial<Macro> = {}): Macro {
  const moves = parseAlg(alg);
  return { alg: moves, perm: algPerm(moves), ...extra };
}

// Rewrites an algorithm written for the front-right slot so that it works on another slot.
// Shifting F, R, B and L by the same amount is a rotation of the whole cube about the vertical axis.
function turned(alg: string, k: number): string {
  return alg.replace(/[FRBL]/g, (ch) => SIDES[(SIDES.indexOf(ch as Face) + k) % 4]);
}

const U_MOVES: Macro[] = ['U', 'U2', "U'"].map((m) => macro(m, { group: 'U', setup: true }));
const ALL_MOVES: Macro[] = FACES.flatMap((f) => [f, `${f}2`, `${f}'`].map((m) => macro(m, { group: f })));

const perSlot = (algs: string[]) => SIDES.map((_, k) => algs.map((alg) => macro(turned(alg, k))));

const CORNER_INSERTS = perSlot(["R U R'", "R U' R'", "R U2 R'", "F' U' F", "F' U F", "F' U2 F"]);
const EDGE_INSERTS = perSlot(["U R U' R' U' F' U F", "U' F' U F U R U' R'"]);
const CROSS_ALGS = perSlot(["F R U R' U' F'", "F U R U' R' F'"]).flat();
const FACE_ALGS = perSlot(["R U R' U R U2 R'", "R U2 R' U' R U' R'"]).flat();
const CORNER_CYCLES = perSlot(["R' F R' B2 R F' R' B2 R2", "R2 B2 R F R' B2 R F' R"]).flat();
const EDGE_CYCLES = perSlot(["R U' R U R U R U' R' U' R2", "R2 U R U R' U' R' U' R' U R'"]).flat();

/** Iterative deepening search for the shortest macro sequence that solves every locked sticker. */
function search(start: CubeState, macros: Macro[], locked: number[], maxDepth: number): Macro[] {
  const done = (s: CubeState) => locked.every((i) => s[i] === home(i));
  const path: Macro[] = [];

  const dfs = (state: CubeState, depth: number): boolean => {
    if (depth === 0) return done(state);
    const last = path[path.length - 1];
    for (const m of macros) {
      if (last && m.group && m.group === last.group) continue;
      path.push(m);
      if (dfs(applyPerm(state, m.perm), depth - 1)) return true;
      path.pop();
    }
    return false;
  };

  for (let depth = 0; depth <= maxDepth; depth++) {
    if (dfs(start, depth)) return [...path];
  }
  throw new Error('No solution found. The cube state is probably not valid.');
}

function findPiece(state: CubeState, positions: readonly (readonly number[])[], faces: number[]): number {
  const wanted = [...faces].sort().join();
  return positions.findIndex((p) => p.map((i) => state[i]).sort().join() === wanted);
}

const pieceWithFaces = (positions: readonly (readonly number[])[], faces: number[]) =>
  findPiece(Array.from({ length: 54 }, (_, i) => home(i)), positions, faces);

export interface BeginnerOptions {
  /** Color names for the faces in U, R, F, D, L, B order. They only affect the wording. */
  colorNames?: string[];
}

export function solveBeginner(start: CubeState, options: BeginnerOptions = {}): Solution {
  const names = options.colorNames ?? ['top', 'right', 'front', 'bottom', 'left', 'back'];
  const name = (face: Face) => names[faceIndex(face)];
  const top = name('U');
  const bottom = name('D');

  let state: CubeState = start;
  const locked: number[] = [];
  const stages: SolveStage[] = [];

  const run = (macros: Macro[], maxDepth: number): Macro[] => {
    const found = search(state, macros, locked, maxDepth);
    for (const m of found) state = applyPerm(state, m.perm);
    return found;
  };
  const flat = (macros: Macro[]) => macros.flatMap((m) => m.alg);

  // One step per algorithm. Top-layer adjustments join the algorithm that follows them.
  const stepsPerAlgorithm = (macros: Macro[], title: string): SolveStep[] => {
    const steps: SolveStep[] = [];
    let pending: Move[] = [];
    for (const m of macros) {
      pending.push(...m.alg);
      if (!m.setup) {
        steps.push({ title, moves: pending });
        pending = [];
      }
    }
    if (pending.length) steps.push({ title: 'Line the top layer up', moves: pending });
    return steps;
  };

  // Stage 1: the cross on the bottom face.
  {
    const steps: SolveStep[] = [];
    for (const side of SIDES) {
      const edge = pieceWithFaces(EDGES, [faceIndex('D'), faceIndex(side)]);
      locked.push(...EDGES[edge]);
      steps.push({ title: `Place the ${bottom}-${name(side)} edge`, moves: flat(run(ALL_MOVES, 7)) });
    }
    stages.push({
      title: `1. ${cap(bottom)} cross`,
      description:
        `Bring the four ${bottom} edge pieces to the bottom face. ` +
        `Each one must also match the center of the side it touches.`,
      steps,
    });
  }

  // Stage 2: the four bottom corners.
  {
    const steps: SolveStep[] = [];
    SIDES.forEach((side, k) => {
      const next = SIDES[(k + 1) % 4];
      const faces = [faceIndex('D'), faceIndex(side), faceIndex(next)];
      const target = pieceWithFaces(CORNERS, faces);
      const current = findPiece(state, CORNERS, faces);
      const macros = [...U_MOVES, ...CORNER_INSERTS[k]];
      // A corner stuck in another bottom slot has to be lifted out with that slot's moves first.
      const stuckIn = SIDES.findIndex((s, j) => {
        const slot = pieceWithFaces(CORNERS, [faceIndex('D'), faceIndex(s), faceIndex(SIDES[(j + 1) % 4])]);
        return slot === current && slot !== target;
      });
      if (stuckIn >= 0) macros.push(...CORNER_INSERTS[stuckIn]);
      locked.push(...CORNERS[target]);
      steps.push({ title: `Place the ${bottom}-${name(side)}-${name(next)} corner`, moves: flat(run(macros, 6)) });
    });
    stages.push({
      title: '2. Bottom corners',
      description:
        `Finish the ${bottom} layer. Move each ${bottom} corner above its slot in the top layer, ` +
        `then drop it in with a short three-move insert.`,
      steps,
    });
  }

  // Stage 3: the four middle-layer edges.
  {
    const steps: SolveStep[] = [];
    SIDES.forEach((side, k) => {
      const next = SIDES[(k + 1) % 4];
      const faces = [faceIndex(side), faceIndex(next)];
      const target = pieceWithFaces(EDGES, faces);
      const current = findPiece(state, EDGES, faces);
      const macros = [...U_MOVES, ...EDGE_INSERTS[k]];
      const stuckIn = SIDES.findIndex(
        (s, j) => j !== k && pieceWithFaces(EDGES, [faceIndex(s), faceIndex(SIDES[(j + 1) % 4])]) === current,
      );
      if (stuckIn >= 0) macros.push(...EDGE_INSERTS[stuckIn]);
      locked.push(...EDGES[target]);
      steps.push({ title: `Place the ${name(side)}-${name(next)} edge`, moves: flat(run(macros, 6)) });
    });
    stages.push({
      title: '3. Middle layer',
      description:
        `Fill the four edge slots of the middle layer. Line each edge up in the top layer, ` +
        `then use the eight-move insert that sends it left or right into place.`,
      steps,
    });
  }

  // Stage 4: a cross on the top face. Only the top stickers matter here.
  locked.push(1, 3, 5, 7);
  stages.push({
    title: `4. ${cap(top)} cross`,
    description:
      `Turn the ${top} edge stickers to face up. One six-move algorithm does this. ` +
      `It may need to be repeated up to three times.`,
    steps: stepsPerAlgorithm(run(CROSS_ALGS, 4), `Flip ${top} edges up`),
  });

  // Stage 5: the whole top face.
  locked.push(0, 2, 6, 8);
  stages.push({
    title: `5. ${cap(top)} face`,
    description:
      `Twist the top corners until the whole top face is ${top}. ` +
      `The algorithm here is known as the Sune. It twists three corners at once.`,
    steps: stepsPerAlgorithm(run(FACE_ALGS, 4), `Twist ${top} corners`),
  });

  // Stage 6: top corners in their final places.
  locked.push(...CORNERS.slice(0, 4).flat());
  stages.push({
    title: '6. Top corners',
    description:
      'Move the top corners to their final places. The algorithm swaps three corners around ' +
      'and leaves everything else alone.',
    steps: stepsPerAlgorithm(run([...U_MOVES, ...CORNER_CYCLES], 5), 'Cycle three corners'),
  });

  // Stage 7: top edges, which finishes the cube.
  locked.push(...EDGES.slice(0, 4).flat());
  stages.push({
    title: '7. Top edges',
    description: 'Cycle the last three edges into place. After this the cube is solved.',
    steps: stepsPerAlgorithm(run(EDGE_CYCLES, 3), 'Cycle three edges'),
  });

  if (!isSolved(state)) throw new Error('The beginner solver finished without solving the cube.');
  return makeSolution(stages);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
