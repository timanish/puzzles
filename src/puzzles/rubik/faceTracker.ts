// Follows the cube while it is turned in front of the camera.
// It keeps one reading per side, and it notes how the cube was turned from one side to the next.
// A turn that brings a new side in from the right means that this side is the right-hand
// neighbor of the one before. These notes later settle how the six sides fit together
// when the colors alone leave that open, as on a nearly solved cube.

import { rgbToLab, type RGB } from '../../shared/color';
import { colorCost } from './colors';
import type { FaceDetection } from './detectFace';

export interface TrackedFace {
  colors: RGB[];
  labs: number[][];
  matched: number;
}

/**
 * Two sides that were seen right after each other, and so share an edge.
 * A side number says which border of the stored reading touches the other face:
 * 0 is top, 1 right, 2 bottom and 3 left. It is null when that could not be told.
 */
export interface Neighbors {
  a: number;
  b: number;
  sideA: number | null;
  sideB: number | null;
}

/** A face is accepted after it has been read the same way this many times in a row. */
const STEADY_FRAMES = 2;
/** Two sightings belong to one turn of the cube when they are at most this far apart. */
const TURN_WINDOW_MS = 1500;
const SAME_FACE = 14;

export const rotateCells = <T,>(cells: T[]) => cells.map((_, i) => cells[(2 - (i % 3)) * 3 + Math.floor(i / 3)]);

function turnCells<T>(cells: T[], quarterTurns: number): T[] {
  let out = cells;
  for (let k = 0; k < ((quarterTurns % 4) + 4) % 4; k++) out = rotateCells(out);
  return out;
}

/** Color difference between a new reading and a stored one, for each clockwise quarter turn of the new one. */
function differences(fresh: number[][], stored: number[][]): number[] {
  const result: number[] = [];
  let turned = fresh;
  for (let k = 0; k < 4; k++) {
    result.push(turned.reduce((sum, lab, i) => sum + colorCost(lab, stored[i]), 0) / 9);
    turned = rotateCells(turned);
  }
  return result;
}

interface Sighting {
  face: number;
  /** Clockwise quarter turns that take the current view to the stored reading. Null when unknown. */
  turn: number | null;
  center: [number, number];
  size: number;
  right: [number, number];
  down: [number, number];
  time: number;
}

export type Observation = 'none' | 'seen' | 'known' | 'added';

export class FaceTracker {
  faces: TrackedFace[] = [];
  neighbors: Neighbors[] = [];
  private previous: number[][] | null = null;
  private steady = 0;
  private last: Sighting | null = null;

  reset() {
    this.faces = [];
    this.neighbors = [];
    this.previous = null;
    this.steady = 0;
    this.last = null;
  }

  remove(index: number) {
    this.faces = this.faces.filter((_, i) => i !== index);
    const shift = (i: number) => (i > index ? i - 1 : i);
    this.neighbors = this.neighbors
      .filter((n) => n.a !== index && n.b !== index)
      .map((n) => ({ ...n, a: shift(n.a), b: shift(n.b) }));
    this.last = null;
  }

  /** Feeds one camera frame's result. Time is in milliseconds. */
  observe(detection: FaceDetection | null, time: number): Observation {
    if (!detection) {
      this.previous = null;
      this.steady = 0;
      return 'none';
    }
    const labs = detection.colors.map(rgbToLab);
    // Two readings in a row must agree. This filters out motion blur.
    const agrees = this.previous !== null && labs.every((lab, i) => colorCost(lab, this.previous![i]) < 12);
    this.steady = agrees ? this.steady + 1 : 1;
    this.previous = labs;
    if (this.steady < STEADY_FRAMES) return 'seen';

    const match = this.identify(labs);
    if (!match) return 'seen';

    const [tl, tr, , bl] = detection.corners;
    const center = [0, 1].map((k) => detection.corners.reduce((sum, c) => sum + c[k], 0) / 4) as [number, number];
    const sighting: Sighting = {
      face: match.face,
      turn: null,
      center,
      size: Math.hypot(tr[0] - tl[0], tr[1] - tl[1]),
      right: [tr[0] - tl[0], tr[1] - tl[1]],
      down: [bl[0] - tl[0], bl[1] - tl[1]],
      time,
    };

    let added = false;
    if (match.face === -1) {
      if (this.faces.length >= 6) return 'seen';
      this.faces = [...this.faces, { colors: detection.colors, labs, matched: detection.matched }];
      sighting.face = this.faces.length - 1;
      sighting.turn = 0;
      added = true;
    } else {
      sighting.turn = this.resolveTurn(sighting, match.turns);
      if (detection.matched > this.faces[match.face].matched) {
        // A cleaner view of a known side replaces the earlier one, turned to the stored orientation.
        const turn = sighting.turn ?? match.turns[0];
        this.faces = this.faces.map((f, i) =>
          i === match.face ? { colors: turnCells(detection.colors, turn), labs: turnCells(labs, turn), matched: detection.matched } : f,
        );
      }
    }

    this.noteTurn(sighting);
    this.last = sighting;
    return added ? 'added' : 'known';
  }

  /** The step from the previous sighting to this one, if both belong to one turn of the cube. */
  private stepFrom(before: Sighting | null, now: Sighting): [number, number] | null {
    if (!before || before.face === now.face || now.time - before.time > TURN_WINDOW_MS) return null;
    const step: [number, number] = [now.center[0] - before.center[0], now.center[1] - before.center[1]];
    return Math.hypot(step[0], step[1]) > 0.25 * Math.max(before.size, now.size) ? step : null;
  }

  /**
   * Finds how the current view of a known side is turned against its stored reading.
   * The colors usually tell. A side that looks the same after turning it, such as a solved one,
   * needs other clues: the view just before, or the side the cube was turned from.
   */
  private resolveTurn(now: Sighting, fits: number[]): number | null {
    if (fits.length === 1) return fits[0];
    const before = this.last;
    if (before && before.face === now.face && before.turn !== null && now.time - before.time <= TURN_WINDOW_MS) {
      return fits.includes(before.turn) ? before.turn : null;
    }
    const step = this.stepFrom(before, now);
    if (!step || !before) return null;
    // An earlier note says which stored border of this side touches the side we came from.
    for (const note of this.neighbors) {
      const storedBorder =
        note.a === now.face && note.b === before.face ? note.sideA : note.b === now.face && note.a === before.face ? note.sideB : null;
      if (storedBorder === null) continue;
      const turn = (storedBorder - border(now, [-step[0], -step[1]]) + 4) % 4;
      if (fits.includes(turn)) return turn;
    }
    return null;
  }

  /** Works out which stored side a reading shows: its index, -1 for a new side, or null for noise. */
  private identify(labs: number[][]): { face: number; turns: number[] } | null {
    let nearest = -1;
    let nearestTurns: number[] = [];
    let nearestDifference = Infinity;
    let centerGap = Infinity;
    this.faces.forEach((face, i) => {
      const all = differences(labs, face.labs);
      const best = Math.min(...all);
      if (best < nearestDifference) {
        nearestDifference = best;
        nearest = i;
        // Several turns fit equally well when the side looks the same after turning it.
        nearestTurns = all.flatMap((d, k) => (d < best + 4 ? [k] : []));
      }
      centerGap = Math.min(centerGap, colorCost(labs[4], face.labs[4]));
    });
    if (nearestDifference < SAME_FACE) {
      return { face: nearest, turns: nearestTurns };
    }
    // A new side has a center color of its own. Red and orange centers can look alike,
    // so a clearly different pattern also counts when the centers are only a little apart.
    if (centerGap > 16 || (centerGap > 7 && nearestDifference > 28)) return { face: -1, turns: [0] };
    return null;
  }

  /** Records which side follows which when the cube has just been turned to a different side. */
  private noteTurn(now: Sighting) {
    const before = this.last;
    if (!before || before.face === now.face || now.time - before.time > TURN_WINDOW_MS) return;
    // While the cube turns, the old side slides off one way and the new side comes in from
    // the other. The step between their positions therefore points from the old side to the new one.
    const step = this.stepFrom(before, now);
    const stored = (s: Sighting, direction: [number, number]) => (s.turn !== null ? (border(s, direction) + s.turn) % 4 : null);
    const note: Neighbors = {
      a: before.face,
      b: now.face,
      sideA: step ? stored(before, step) : null,
      sideB: step ? stored(now, [-step[0], -step[1]]) : null,
    };
    this.neighbors = [...this.neighbors, note].slice(-60);
  }
}

/** Which border of a side lies in a given direction, as seen in that side's current view. */
function border(s: Sighting, direction: [number, number]): number {
  const alongRight = direction[0] * s.right[0] + direction[1] * s.right[1];
  const alongDown = direction[0] * s.down[0] + direction[1] * s.down[1];
  if (Math.abs(alongRight) > Math.abs(alongDown)) return alongRight > 0 ? 1 : 3;
  return alongDown > 0 ? 2 : 0;
}
