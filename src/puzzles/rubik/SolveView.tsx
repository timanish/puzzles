import { useEffect, useMemo, useState } from 'react';
import { solveBeginner } from './beginner';
import type { PaletteColor } from './colors';
import { Cube3D } from './Cube3D';
import { applyMove, formatAlg, formatMove, invertMove, type Move } from './cube';
import { describeMove } from './describe';
import { solveFast } from './fastSolver';
import type { Solution } from './solution';

type Mode = 'fast' | 'beginner';

interface FlatStep {
  stage: number;
  title: string;
  start: number;
  moves: Move[];
}

function flatten(solution: Solution) {
  const steps: FlatStep[] = [];
  const moves: Move[] = [];
  solution.stages.forEach((stage, s) => {
    for (const step of stage.steps) {
      steps.push({ stage: s, title: step.title, start: moves.length, moves: step.moves });
      moves.push(...step.moves);
    }
  });
  return { steps, moves };
}

interface Props {
  stickers: number[];
  palette: PaletteColor[];
  onBack: () => void;
}

export function SolveView({ stickers, palette, onBack }: Props) {
  const names = useMemo(() => palette.map((p) => p.name), [palette]);
  const colors = useMemo(() => palette.map((p) => p.css), [palette]);

  const beginner = useMemo(() => solveBeginner(stickers, { colorNames: names }), [stickers, names]);
  const [fast, setFast] = useState<Solution | null>(null);
  const [fastError, setFastError] = useState(false);
  const [mode, setMode] = useState<Mode>('beginner');

  useEffect(() => {
    let cancelled = false;
    setFast(null);
    setFastError(false);
    solveFast(
      stickers,
      beginner.stages.flatMap((stage) => stage.steps.flatMap((step) => step.moves)),
    )
      .then((s) => !cancelled && setFast(s))
      .catch(() => !cancelled && setFastError(true));
    return () => {
      cancelled = true;
    };
  }, [stickers, beginner]);

  const solution = mode === 'fast' ? fast : beginner;
  const { steps, moves } = useMemo(() => flatten(solution ?? { stages: [], moveCount: 0 }), [solution]);
  const states = useMemo(() => {
    const all = [stickers];
    for (const m of moves) all.push(applyMove(all[all.length - 1], m));
    return all;
  }, [stickers, moves]);

  // Position is the number of moves already done. Turn is the move being animated, if any.
  const [view, setView] = useState<{ at: number; turn: { move: Move; target: number } | null }>({ at: 0, turn: null });
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setView({ at: 0, turn: null });
    setPlaying(false);
  }, [solution]);

  const settled = view.turn ? view.turn.target : view.at;
  const at = Math.min(view.at, moves.length);

  const stepTo = (direction: 1 | -1) => {
    if (direction === 1 && settled < moves.length) {
      setView({ at: settled, turn: { move: moves[settled], target: settled + 1 } });
    } else if (direction === -1 && settled > 0) {
      setView({ at: settled, turn: { move: invertMove(moves[settled - 1]), target: settled - 1 } });
    }
  };
  const jump = (index: number) => {
    setPlaying(false);
    setView({ at: index, turn: null });
  };

  useEffect(() => {
    if (!playing || view.turn) return;
    if (view.at >= moves.length) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => stepTo(1), 450);
    return () => window.clearTimeout(timer);
  });

  const finished = settled >= moves.length;
  const nextMove = finished ? null : moves[settled];
  const currentStep = steps.findLast((s) => s.start <= Math.min(settled, moves.length - 1)) ?? null;
  const stage = solution && currentStep ? solution.stages[currentStep.stage] : null;

  return (
    <div className="solve">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'beginner'} className="tab" onClick={() => setMode('beginner')}>
          Beginner method
          <small>{beginner.moveCount} moves, explained</small>
        </button>
        <button type="button" role="tab" aria-selected={mode === 'fast'} className="tab" onClick={() => setMode('fast')}>
          Fastest
          <small>{fast ? `${fast.moveCount} moves` : fastError ? 'unavailable' : 'working…'}</small>
        </button>
      </div>

      <p className="hint">
        Hold the cube with the <b>{names[0]}</b> center on top and the <b>{names[2]}</b> center facing you. Keep it that
        way for the whole solve.
      </p>

      {!solution ? (
        <div className="card">
          <p>{fastError ? 'The fast solver could not be started.' : 'Preparing the fast solver. The first run takes a few seconds.'}</p>
        </div>
      ) : moves.length === 0 ? (
        <div className="card">
          <h2>Already solved</h2>
          <p>This cube needs no moves.</p>
        </div>
      ) : (
        <>
          <Cube3D
            state={states[at]}
            colors={colors}
            turn={view.turn?.move ?? null}
            onTurnEnd={() => setView((v) => (v.turn ? { at: v.turn.target, turn: null } : v))}
          />

          <div className="card move-card" aria-live="polite">
            {nextMove ? (
              <>
                <div className="move-big">{formatMove(nextMove)}</div>
                <div>
                  <div className="move-count">
                    Move {settled + 1} of {moves.length}
                    {stage && solution.stages.length > 1 ? ` · ${stage.title}` : ''}
                  </div>
                  <p className="move-text">{describeMove(nextMove, names)}</p>
                </div>
              </>
            ) : (
              <>
                <div className="move-big">✓</div>
                <div>
                  <div className="move-count">Done</div>
                  <p className="move-text">The cube is solved.</p>
                </div>
              </>
            )}
          </div>

          <div className="row center">
            <button type="button" className="btn" onClick={() => stepTo(-1)} disabled={settled === 0}>
              ‹ Back
            </button>
            <button type="button" className="btn" onClick={() => setPlaying(!playing)} disabled={finished}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" className="btn primary" onClick={() => stepTo(1)} disabled={finished}>
              Next ›
            </button>
          </div>
          <p className="hint">
            Clockwise means clockwise as seen when you look straight at that face. Drag the cube to see its other
            sides.
          </p>

          <ol className="stages">
            {solution.stages.map((s, si) => (
              <li key={si} className={stage === s && !finished ? 'stage active' : 'stage'}>
                <h3>{s.title}</h3>
                <p>{s.description}</p>
                <ul>
                  {steps
                    .filter((step) => step.stage === si)
                    .map((step) => {
                      const state =
                        settled >= step.start + step.moves.length ? 'done' : step === currentStep ? 'current' : '';
                      return (
                        <li key={step.start}>
                          <button type="button" className={`step ${state}`} onClick={() => jump(step.start)}>
                            <span>{step.title}</span>
                            <code>{formatAlg(step.moves)}</code>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="row">
        <button type="button" className="btn" onClick={onBack}>
          Solve another cube
        </button>
      </div>
    </div>
  );
}
