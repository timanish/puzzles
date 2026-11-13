import type { Move } from './cube';

/** One teaching unit: a piece to place or an algorithm to run. */
export interface SolveStep {
  title: string;
  moves: Move[];
}

export interface SolveStage {
  title: string;
  description: string;
  steps: SolveStep[];
}

export interface Solution {
  stages: SolveStage[];
  moveCount: number;
}

export function makeSolution(stages: SolveStage[]): Solution {
  const kept = stages
    .map((stage) => ({ ...stage, steps: stage.steps.filter((step) => step.moves.length > 0) }))
    .filter((stage) => stage.steps.length > 0);
  const moveCount = kept.reduce((n, stage) => n + stage.steps.reduce((m, step) => m + step.moves.length, 0), 0);
  return { stages: kept, moveCount };
}
