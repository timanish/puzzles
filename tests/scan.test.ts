import { describe, expect, it } from 'vitest';
import { assembleCube } from '../src/puzzles/rubik/assemble';
import { SOLVED, allOrientations, applyMoves, parseAlg, randomMoves, validate } from '../src/puzzles/rubik/cube';
import { detectFace } from '../src/puzzles/rubik/detectFace';
import type { RGB } from '../src/shared/color';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// Sticker colors as a dim, warm-tinted camera might see them. Order is U, R, F, D, L, B.
const SEEN: RGB[] = [
  [190, 180, 160],
  [165, 40, 30],
  [20, 110, 60],
  [190, 160, 30],
  [205, 85, 28],
  [20, 50, 130],
];

const rotate = <T,>(cells: T[]) => cells.map((_, i) => cells[(2 - (i % 3)) * 3 + Math.floor(i / 3)]);

/** Six noisy faces in a random order, each turned by a random amount. */
function photograph(state: number[], random: () => number): RGB[][] {
  const colors = state.map((v) => SEEN[v].map((c) => c + (random() - 0.5) * 26) as unknown as RGB);
  const faces = Array.from({ length: 6 }, (_, f) => {
    let face = colors.slice(f * 9, f * 9 + 9);
    for (let k = Math.floor(random() * 4); k > 0; k--) face = rotate(face);
    return face;
  });
  for (let i = faces.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [faces[i], faces[j]] = [faces[j], faces[i]];
  }
  return faces;
}

describe('assembling a cube from loose faces', () => {
  it('rebuilds scrambled cubes from faces in any order and rotation', () => {
    const random = seeded(5);
    for (let run = 0; run < 25; run++) {
      const state = applyMoves(SOLVED, randomMoves(30, random));
      const result = assembleCube(photograph(state, random));
      expect(result.valid).toBe(true);
      expect(validate(result.stickers)).toBeNull();
      const same = allOrientations(state).some((o) => o.join() === result.stickers.join());
      expect(same).toBe(true);
      // White ends up on the bottom, so yellow is on top.
      expect(result.palette[3].name).toBe('white');
      expect(result.palette[0].name).toBe('yellow');
    }
  });

  it('lists 24 orientations of a cube', () => {
    const state = applyMoves(SOLVED, parseAlg("R U F' L2 D B"));
    const all = allOrientations(state);
    expect(all.length).toBe(24);
    for (const o of all) expect(validate(o)).toBeNull();
  });
});

/** Draws one face as nine squares with dark gaps, turned by an angle, on a noisy background. */
function drawFace(colors: RGB[], angle: number, random: () => number, width = 320, height = 180) {
  const data = new Uint8ClampedArray(width * height * 4);
  const pitch = 30;
  const half = 12;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Position in the face's own coordinates.
      const dx = x - 170;
      const dy = y - 88;
      const fx = dx * cos + dy * sin;
      const fy = -dx * sin + dy * cos;
      let color: number[] = [70 + (x % 37), 80 + (y % 29), 90];
      if (Math.abs(fx) < pitch * 1.5 + 3 && Math.abs(fy) < pitch * 1.5 + 3) {
        color = [12, 12, 14];
        const c = Math.round(fx / pitch);
        const r = Math.round(fy / pitch);
        if (Math.abs(c) <= 1 && Math.abs(r) <= 1 && Math.abs(fx - c * pitch) < half && Math.abs(fy - r * pitch) < half) {
          color = [...colors[(r + 1) * 3 + c + 1]];
        }
      }
      const i = (y * width + x) * 4;
      for (let k = 0; k < 3; k++) data[i + k] = color[k] + (random() - 0.5) * 10;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('finding a face in a picture', () => {
  const face: RGB[] = [0, 1, 2, 3, 4, 5, 1, 1, 3].map((v) => SEEN[v]);

  it('reads the nine colors at several angles', () => {
    const random = seeded(9);
    for (const degrees of [0, 12, -25, 38]) {
      const found = detectFace(drawFace(face, (degrees * Math.PI) / 180, random));
      expect(found, `angle ${degrees}`).not.toBeNull();
      expect(found!.matched).toBe(9);
      found!.colors.forEach((color, i) => {
        const off = Math.abs(color[0] - face[i][0]) + Math.abs(color[1] - face[i][1]) + Math.abs(color[2] - face[i][2]);
        expect(off, `angle ${degrees}, cell ${i}`).toBeLessThan(30);
      });
    }
  });

  it('finds nothing in a picture without a cube', () => {
    const random = seeded(10);
    const empty = drawFace(face, 0, random);
    for (let i = 0; i < empty.data.length; i += 4) empty.data.set([90, 100, 110], i);
    expect(detectFace(empty)).toBeNull();
  });
});
