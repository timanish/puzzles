import { useState } from 'react';
import type { PaletteColor } from './colors';
import { validate, type ValidationProblem } from './cube';
import { FaceNet } from './FaceNet';

function explain(problem: ValidationProblem, palette: PaletteColor[]): string {
  switch (problem.kind) {
    case 'counts': {
      const off = problem.counts
        .map((count, i) => ({ count, name: palette[i].name }))
        .filter((c) => c.count !== 9)
        .map((c) => `${c.name} ${c.count}`)
        .join(', ');
      return `Each color must appear 9 times. Right now: ${off}.`;
    }
    case 'centers':
      return 'The center squares do not match the palette.';
    case 'corner-piece':
      return 'A corner has a color combination that does not exist on a cube, or the same corner appears twice.';
    case 'edge-piece':
      return 'An edge has a color combination that does not exist on a cube, or the same edge appears twice.';
    case 'corner-twist':
      return 'Every piece exists, but one corner is twisted. Check the corner colors again.';
    case 'edge-flip':
      return 'Every piece exists, but one edge is flipped. Check the edge colors again.';
    case 'parity':
      return 'Every piece exists, but two pieces are swapped. Check the colors again.';
  }
}

interface Props {
  initial: number[];
  palette: PaletteColor[];
  note?: string;
  onSolve: (stickers: number[]) => void;
  onBack: () => void;
}

export function ReviewView({ initial, palette, note, onSolve, onBack }: Props) {
  const [stickers, setStickers] = useState(initial);
  const [brush, setBrush] = useState(0);
  const problem = validate(stickers);

  const paint = (index: number) => setStickers((s) => s.map((v, i) => (i === index ? brush : v)));

  return (
    <div className="review">
      <div className="card">
        <h2>Check the colors</h2>
        <p>
          Compare this with your cube. To fix a square, pick a color and tap the square. The layout is unfolded: the middle row runs
          left, front, right, back.
        </p>
        {note && <p className="notice">{note}</p>}
      </div>

      <FaceNet state={stickers} colors={palette.map((p) => p.css)} colorNames={palette.map((p) => p.name)} onPaint={paint} />

      <div className="palette" role="radiogroup" aria-label="Paint color">
        {palette.map((p, i) => (
          <button
            type="button"
            key={p.name}
            role="radio"
            aria-checked={brush === i}
            aria-label={p.name}
            className={brush === i ? 'swatch active' : 'swatch'}
            style={{ background: p.css }}
            onClick={() => setBrush(i)}
          />
        ))}
      </div>

      <p className={problem ? 'status bad' : 'status good'} role="status">
        {problem ? explain(problem, palette) : 'This is a valid cube. Ready to solve.'}
      </p>

      <div className="row">
        <button type="button" className="btn primary" disabled={Boolean(problem)} onClick={() => onSolve(stickers)}>
          Solve
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Start over
        </button>
      </div>
    </div>
  );
}
