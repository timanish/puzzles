import { useCallback, useEffect, useState } from 'react';
import type { RGB } from '../../shared/color';
import { assembleCube } from './assemble';
import { DEFAULT_PALETTE, type PaletteColor } from './colors';
import { SOLVED, applyMoves, randomMoves } from './cube';
import type { Neighbors } from './faceTracker';
import { warmUpFastSolver } from './fastSolver';
import { Guide } from './Guide';
import { ReviewView } from './ReviewView';
import { ScanView } from './ScanView';
import { SolveView } from './SolveView';

type Screen =
  | { name: 'start' }
  | { name: 'scan' }
  | { name: 'review'; stickers: number[]; palette: PaletteColor[]; note?: string }
  | { name: 'solve'; stickers: number[]; palette: PaletteColor[] };

export function RubikApp() {
  const [screen, setScreen] = useState<Screen>({ name: 'start' });

  useEffect(warmUpFastSolver, []);

  const onScanned = useCallback((faces: RGB[][], neighbors: Neighbors[]) => {
    const { stickers, palette, valid } = assembleCube(faces, neighbors);
    setScreen({
      name: 'review',
      stickers,
      palette,
      note: valid
        ? undefined
        : 'The six sides did not fit together into a possible cube. This is the closest guess. Fix the wrong squares, or start over and scan again.',
    });
  }, []);

  switch (screen.name) {
    case 'start':
      return (
        <>
        <div className="card">
          <h2>Scan your cube</h2>
          <p>Turn your cube in front of the camera until it has seen all six sides. You then get a move-by-move solution, both the shortest route and a beginner method that explains each stage.</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => setScreen({ name: 'scan' })}>
              Scan with camera
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setScreen({ name: 'review', stickers: [...SOLVED], palette: DEFAULT_PALETTE })}
            >
              Enter colors by hand
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                setScreen({ name: 'solve', stickers: applyMoves(SOLVED, randomMoves(25)), palette: DEFAULT_PALETTE })
              }
            >
              Try a random scramble
            </button>
          </div>
        </div>
        <Guide />
        </>
      );
    case 'scan':
      return <ScanView onDone={onScanned} onCancel={() => setScreen({ name: 'start' })} />;
    case 'review':
      return (
        <ReviewView
          initial={screen.stickers}
          palette={screen.palette}
          note={screen.note}
          onSolve={(stickers) => setScreen({ name: 'solve', stickers, palette: screen.palette })}
          onBack={() => setScreen({ name: 'start' })}
        />
      );
    case 'solve':
      return <SolveView stickers={screen.stickers} palette={screen.palette} onBack={() => setScreen({ name: 'start' })} />;
  }
}
