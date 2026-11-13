// Finds the shortest possible solution for cubes that are close to solved.
// The two-phase solver is fast but returns the first solution it meets, which can be
// twice as long as needed on an easy cube. This search is exact up to its depth limit.
//
// It works from both ends. A table holds every position within four moves of solved.
// The search then walks forward from the scramble and stops at the first table hit.

import { FACES, SOLVED, applyPerm, invertMove, movePerm, type CubeState, type Move } from './cube';

const MOVES: Move[] = FACES.flatMap((face) => ([1, 2, 3] as const).map((turns) => ({ face, turns })));
const PERMS = MOVES.map(movePerm);
const TABLE_DEPTH = 4;
const FORWARD_DEPTH = 5;
/** Longest solution this solver can find. Longer ones need the two-phase solver. */
export const SHORT_LIMIT = TABLE_DEPTH + FORWARD_DEPTH;

const keyOf = (state: CubeState) => String.fromCharCode(...state);

// Turning one face twice in a row is never useful. Opposite faces do not disturb each other,
// so they only need to be tried in one order.
function pointless(previous: number, next: number): boolean {
  if (previous < 0) return false;
  const a = Math.floor(previous / 3);
  const b = Math.floor(next / 3);
  return a === b || (a === b + 3 && a >= 3);
}

/** For each position near solved: the moves that were applied to the solved cube to reach it. */
let table: Map<string, number[]> | null = null;

function buildTable(): Map<string, number[]> {
  const result = new Map<string, number[]>([[keyOf(SOLVED), []]]);
  let frontier: { state: number[]; path: number[] }[] = [{ state: [...SOLVED], path: [] }];
  for (let depth = 1; depth <= TABLE_DEPTH; depth++) {
    const next: typeof frontier = [];
    for (const { state, path } of frontier) {
      for (let m = 0; m < 18; m++) {
        if (pointless(path.length ? path[path.length - 1] : -1, m)) continue;
        const moved = applyPerm(state, PERMS[m]);
        const key = keyOf(moved);
        if (result.has(key)) continue;
        const entry = { state: moved, path: [...path, m] };
        result.set(key, entry.path);
        next.push(entry);
      }
    }
    frontier = next;
  }
  return result;
}

/** The shortest solution if it has at most SHORT_LIMIT moves, otherwise null. */
export function solveShort(start: CubeState): Move[] | null {
  table ??= buildTable();
  const lookup = table;
  const path: number[] = [];
  let best: Move[] | null = null;

  const finish = (fromSolved: number[]) => {
    // The table path leads from solved to this position, so it is undone in reverse.
    const moves = [...path.map((m) => MOVES[m]), ...[...fromSolved].reverse().map((m) => invertMove(MOVES[m]))];
    if (!best || moves.length < best.length) best = moves;
  };

  const walk = (state: CubeState, depth: number) => {
    if (depth === 0) {
      const hit = lookup.get(keyOf(state));
      if (hit) finish(hit);
      return;
    }
    const previous = path.length ? path[path.length - 1] : -1;
    for (let m = 0; m < 18; m++) {
      if (pointless(previous, m)) continue;
      path.push(m);
      walk(applyPerm(state, PERMS[m]), depth - 1);
      path.pop();
    }
  };

  // The first forward depth with a hit contains a shortest solution.
  for (let depth = 0; depth <= FORWARD_DEPTH && !best; depth++) walk(start, depth);
  return best;
}
