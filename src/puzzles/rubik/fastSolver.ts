import { isSolved, parseAlg, toFaceletString, type CubeState } from './cube';
import { makeSolution, type Solution } from './solution';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (alg: string) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./fastSolver.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; solution?: string; error?: string }>) => {
      const { id, solution, error } = event.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (error !== undefined || solution === undefined) entry.reject(new Error(error ?? 'Solver failed.'));
      else entry.resolve(solution);
    };
  }
  return worker;
}

/** Starts building the solver tables early, so the first solve does not have to wait for them. */
export const warmUpFastSolver = () => getWorker().postMessage({ type: 'init' });

export async function solveFast(state: CubeState): Promise<Solution> {
  const alg = isSolved(state)
    ? ''
    : await new Promise<string>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        getWorker().postMessage({ type: 'solve', id, facelets: toFaceletString(state) });
      });
  return makeSolution([
    {
      title: 'Shortest route',
      description:
        'A computer search found this sequence. It is short, but the moves will not look meaningful. ' +
        'Follow them exactly, one at a time.',
      steps: [{ title: 'Follow every move in order', moves: parseAlg(alg) }],
    },
  ]);
}
