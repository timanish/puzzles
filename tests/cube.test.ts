import Cube from 'cubejs';
import { describe, expect, it } from 'vitest';
import { solveBeginner } from '../src/puzzles/rubik/beginner';
import {
  CORNERS,
  EDGES,
  SOLVED,
  applyMoves,
  formatAlg,
  isSolved,
  parseAlg,
  randomMoves,
  toFaceletString,
  validate,
} from '../src/puzzles/rubik/cube';

// Small seeded generator so failures can be reproduced.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('cube model', () => {
  it('matches cubejs on random move sequences', () => {
    const random = seeded(1);
    for (let i = 0; i < 200; i++) {
      const moves = randomMoves(30, random);
      const reference = new Cube().move(formatAlg(moves)).asString();
      expect(toFaceletString(applyMoves(SOLVED, moves))).toBe(reference);
    }
  });

  it('accepts reachable states', () => {
    const random = seeded(2);
    expect(validate(SOLVED)).toBeNull();
    for (let i = 0; i < 200; i++) expect(validate(applyMoves(SOLVED, randomMoves(30, random)))).toBeNull();
  });

  it('rejects states that cannot be reached', () => {
    const twisted = [...SOLVED];
    const [a, b, c] = CORNERS[0];
    [twisted[a], twisted[b], twisted[c]] = [twisted[b], twisted[c], twisted[a]];
    expect(validate(twisted)?.kind).toBe('corner-twist');

    const flipped = [...SOLVED];
    const [e, f] = EDGES[0];
    [flipped[e], flipped[f]] = [flipped[f], flipped[e]];
    expect(validate(flipped)?.kind).toBe('edge-flip');

    const swapped = [...SOLVED];
    EDGES[0].forEach((i, t) => {
      const j = EDGES[1][t];
      [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    });
    expect(validate(swapped)?.kind).toBe('parity');

    const mirrored = [...SOLVED];
    [mirrored[b], mirrored[c]] = [mirrored[c], mirrored[b]];
    expect(validate(mirrored)?.kind).toBe('corner-piece');

    const recolored = [...SOLVED];
    recolored[0] = 1;
    expect(validate(recolored)?.kind).toBe('counts');
  });
});

describe('beginner solver', () => {
  it('solves random scrambles', () => {
    const random = seeded(3);
    let total = 0;
    let worst = 0;
    let slowest = 0;
    const runs = 300;
    for (let i = 0; i < runs; i++) {
      const state = applyMoves(SOLVED, randomMoves(30, random));
      const t0 = performance.now();
      const solution = solveBeginner(state);
      slowest = Math.max(slowest, performance.now() - t0);
      const moves = solution.stages.flatMap((stage) => stage.steps.flatMap((step) => step.moves));
      expect(moves.length).toBe(solution.moveCount);
      expect(isSolved(applyMoves(state, moves))).toBe(true);
      total += moves.length;
      worst = Math.max(worst, moves.length);
    }
    console.log(`beginner: average ${(total / runs).toFixed(1)} moves, worst ${worst}, slowest ${slowest.toFixed(0)} ms`);
  });

  it('returns nothing to do for a solved cube', () => {
    expect(solveBeginner(SOLVED).moveCount).toBe(0);
  });

  it('handles a simple scramble', () => {
    const state = applyMoves(SOLVED, parseAlg("R U R' U'"));
    const solution = solveBeginner(state);
    expect(solution.moveCount).toBeGreaterThan(0);
  });
});
