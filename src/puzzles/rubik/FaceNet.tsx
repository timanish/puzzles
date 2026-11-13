import type { CubeState } from './cube';

// Unfolded cube: U on top, then L, F, R, B in a row, then D below F.
const LAYOUT: { face: number; col: number; row: number; label: string }[] = [
  { face: 0, col: 2, row: 1, label: 'Top' },
  { face: 4, col: 1, row: 2, label: 'Left' },
  { face: 2, col: 2, row: 2, label: 'Front' },
  { face: 1, col: 3, row: 2, label: 'Right' },
  { face: 5, col: 4, row: 2, label: 'Back' },
  { face: 3, col: 2, row: 3, label: 'Bottom' },
];

interface Props {
  state: CubeState;
  colors: string[];
  colorNames: string[];
  /** Called with a sticker index. Centers are fixed and never reported. */
  onPaint?: (index: number) => void;
}

export function FaceNet({ state, colors, colorNames, onPaint }: Props) {
  return (
    <div className="net">
      {LAYOUT.map(({ face, col, row, label }) => (
        <div key={face} className="net-face" style={{ gridColumn: col, gridRow: row }} aria-label={`${label} face`}>
          {Array.from({ length: 9 }, (_, i) => {
            const index = face * 9 + i;
            const center = i === 4;
            return (
              <button
                key={i}
                type="button"
                className={center ? 'net-cell net-center' : 'net-cell'}
                style={{ background: colors[state[index]] }}
                disabled={center || !onPaint}
                onClick={() => onPaint?.(index)}
                aria-label={`${label} face, square ${i + 1}, ${colorNames[state[index]]}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
