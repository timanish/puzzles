import { describe, expect, it } from 'vitest';
import { ACROSS, assembleCube } from '../src/puzzles/rubik/assemble';
import { CORNERS, SOLVED, allOrientations, applyMoves, parseAlg } from '../src/puzzles/rubik/cube';
import type { FaceDetection } from '../src/puzzles/rubik/detectFace';
import { FaceTracker, rotateCells } from '../src/puzzles/rubik/faceTracker';
import type { RGB } from '../src/shared/color';

// Colors of the faces U, R, F, D, L, B as a camera might see them.
const USUAL: RGB[] = [
  [235, 235, 225],
  [200, 40, 45],
  [30, 160, 80],
  [240, 205, 40],
  [250, 120, 35],
  [30, 80, 190],
];
const NAMES = ['white', 'red', 'green', 'yellow', 'orange', 'blue'];

const DIRECTIONS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Plays a cube being turned in front of the camera. A view is the slot facing the camera
 * and which border of that slot points up. Each step turns the cube so that the neighbor
 * in the given picture direction (0 up, 1 right, 2 down, 3 left) comes to the front.
 */
function scan(state: number[], colors: RGB[], steps: number[]): FaceTracker {
  const tracker = new FaceTracker();
  let time = 0;
  let slot = 2;
  let top = 0;

  const show = (offset: [number, number]) => {
    let cells = state.slice(slot * 9, slot * 9 + 9).map((v) => colors[v]);
    for (let k = 0; k < (4 - top) % 4; k++) cells = rotateCells(cells);
    const [cx, cy] = [160 + offset[0], 90 + offset[1]];
    const detection: FaceDetection = {
      colors: cells,
      corners: [
        [cx - 45, cy - 45],
        [cx + 45, cy - 45],
        [cx + 45, cy + 45],
        [cx - 45, cy + 45],
      ],
      matched: 12,
    };
    tracker.observe(detection, (time += 90));
  };

  show([0, 0]);
  show([0, 0]);
  for (const direction of steps) {
    const [dx, dy] = DIRECTIONS[direction];
    // The side in view slides away from the incoming one, which then appears beside it.
    show([-dx * 20, -dy * 20]);
    tracker.observe(null, (time += 90));
    const [next, border] = ACROSS[slot][(direction + top) % 4];
    top = (border - ((direction + 2) % 4) + 4) % 4;
    slot = next;
    show([dx * 20, dy * 20]);
    show([dx * 20, dy * 20]);
    show([0, 0]);
    show([0, 0]);
  }
  return tracker;
}

/** True when the slots hold the faces of the real cube in one of its 24 orientations. */
function sameCube(realFaceInSlot: number[]): boolean {
  for (let slot = 0; slot < 3; slot++) {
    if (realFaceInSlot[slot + 3] !== (realFaceInSlot[slot] + 3) % 6) return false;
  }
  const key = realFaceInSlot.slice(0, 3).join();
  return CORNERS.some((corner) => {
    const home = corner.map((i) => Math.floor(i / 9));
    return [0, 1, 2].some((o) => [home[o], home[(o + 1) % 3], home[(o + 2) % 3]].join() === key);
  });
}

// Right and back, up and back, down and back, then twice to the left. This shows all six sides.
const WALK = [1, 3, 0, 2, 2, 0, 3, 3];

describe('following the cube while it turns', () => {
  it('collects six sides and notes how they follow each other', () => {
    const tracker = scan([...SOLVED], USUAL, WALK);
    expect(tracker.faces.length).toBe(6);
    expect(tracker.neighbors.length).toBe(WALK.length);
  });

  it('rebuilds nearly solved cubes, where the pieces alone leave the layout open', () => {
    for (const alg of ['', 'R', 'R U', "F2 D'"]) {
      const state = applyMoves(SOLVED, parseAlg(alg));
      const tracker = scan(state, USUAL, WALK);
      const result = assembleCube(tracker.faces.map((f) => f.colors), tracker.neighbors);
      expect(result.valid, alg).toBe(true);
      expect(allOrientations(state).some((o) => o.join() === result.stickers.join()), alg).toBe(true);
      expect(sameCube(result.palette.map((p) => NAMES.indexOf(p.name))), alg).toBe(true);
    }
  });

  it('lets the turns overrule the usual color layout on an unusual cube', () => {
    // Red and orange have swapped places, which makes this cube a mirror image of the usual one.
    const unusual = [USUAL[0], USUAL[4], USUAL[2], USUAL[3], USUAL[1], USUAL[5]];
    const names = [NAMES[0], NAMES[4], NAMES[2], NAMES[3], NAMES[1], NAMES[5]];
    const tracker = scan([...SOLVED], unusual, WALK);
    const colors = tracker.faces.map((f) => f.colors);

    const withTurns = assembleCube(colors, tracker.neighbors);
    expect(sameCube(withTurns.palette.map((p) => names.indexOf(p.name)))).toBe(true);

    // Without the turn notes the usual layout is assumed, which is wrong for this cube.
    const withoutTurns = assembleCube(colors);
    expect(sameCube(withoutTurns.palette.map((p) => names.indexOf(p.name)))).toBe(false);
  });

  it('uses the usual color layout when there are no turn notes', () => {
    const state = applyMoves(SOLVED, parseAlg('R'));
    const tracker = scan(state, USUAL, WALK);
    const result = assembleCube(tracker.faces.map((f) => f.colors));
    expect(allOrientations(state).some((o) => o.join() === result.stickers.join())).toBe(true);
    expect(sameCube(result.palette.map((p) => NAMES.indexOf(p.name)))).toBe(true);
  });
});
