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

/**
 * Draws one face turned by an angle on a noisy background. With gaps, the pieces are separated
 * by dark lines, as on a stickered cube. Without gaps the pieces touch, as on a stickerless cube,
 * and only a small dark spot shows where four piece corners meet.
 */
function drawFace(colors: RGB[], angle: number, random: () => number, gaps = true, width = 320, height = 180) {
  const data = new Uint8ClampedArray(width * height * 4);
  const pitch = 30;
  const half = gaps ? 12 : 15;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Position in the face's own coordinates.
      const dx = x - 170;
      const dy = y - 88;
      const fx = dx * cos + dy * sin;
      const fy = -dx * sin + dy * cos;
      let color: number[] = [70 + x * 0.12, 80 + y * 0.15, 90];
      const edgeOfFace = pitch * 1.5 + (gaps ? 3 : 0);
      if (Math.abs(fx) < edgeOfFace && Math.abs(fy) < edgeOfFace) {
        color = [12, 12, 14];
        const c = Math.max(-1, Math.min(1, Math.round(fx / pitch)));
        const r = Math.max(-1, Math.min(1, Math.round(fy / pitch)));
        const nearJunction = Math.abs(Math.abs(fx) - pitch / 2) < 2.5 && Math.abs(Math.abs(fy) - pitch / 2) < 2.5;
        if (Math.abs(fx - c * pitch) <= half && Math.abs(fy - r * pitch) <= half && (gaps || !nearJunction)) {
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

function expectColors(found: ReturnType<typeof detectFace>, face: RGB[], label: string) {
  expect(found, label).not.toBeNull();
  found!.colors.forEach((color, i) => {
    const off = Math.abs(color[0] - face[i][0]) + Math.abs(color[1] - face[i][1]) + Math.abs(color[2] - face[i][2]);
    expect(off, `${label}, cell ${i}`).toBeLessThan(30);
  });
}

describe('finding a face in a picture', () => {
  const mixed: RGB[] = [0, 1, 2, 3, 4, 5, 1, 1, 3].map((v) => SEEN[v]);
  // Large blocks of one color, like a nearly solved cube.
  const blocky: RGB[] = [3, 3, 3, 4, 4, 4, 4, 4, 4].map((v) => SEEN[v]);
  const solid: RGB[] = new Array(9).fill(SEEN[2]);

  it('reads a face with dark gaps at several angles', () => {
    const random = seeded(9);
    for (const degrees of [0, 12, -25, 38]) {
      expectColors(detectFace(drawFace(mixed, (degrees * Math.PI) / 180, random)), mixed, `angle ${degrees}`);
    }
  });

  it('reads a face without gaps, where same-colored pieces merge', () => {
    const random = seeded(12);
    for (const degrees of [0, 9, -20, 33]) {
      const angle = (degrees * Math.PI) / 180;
      expectColors(detectFace(drawFace(mixed, angle, random, false)), mixed, `mixed, angle ${degrees}`);
      expectColors(detectFace(drawFace(blocky, angle, random, false)), blocky, `blocky, angle ${degrees}`);
      expectColors(detectFace(drawFace(solid, angle, random, false)), solid, `solid, angle ${degrees}`);
    }
  });

  it('finds nothing in a picture without a cube', () => {
    const random = seeded(10);
    const empty = drawFace(mixed, 0, random);
    for (let i = 0; i < empty.data.length; i += 4) empty.data.set([90, 100, 110], i);
    expect(detectFace(empty)).toBeNull();
  });
});
