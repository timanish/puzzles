import type { Face, Move } from './cube';
import { FACES } from './cube';

const FACE_WORDS: Record<Face, string> = {
  U: 'top',
  D: 'bottom',
  R: 'right',
  L: 'left',
  F: 'front',
  B: 'back',
};

/** Plain-language instruction for one move. Color names are in U, R, F, D, L, B order. */
export function describeMove(move: Move, colorNames: string[]): string {
  const how =
    move.turns === 1
      ? 'a quarter turn clockwise'
      : move.turns === 3
        ? 'a quarter turn counterclockwise'
        : 'a half turn';
  return `Turn the ${FACE_WORDS[move.face]} face (${colorNames[FACES.indexOf(move.face)]} center) ${how}.`;
}
