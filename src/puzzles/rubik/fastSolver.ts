import { isSolved, parseAlg, simplifyAlg, toFaceletString, type CubeState, type Move } from './cube';
import { makeSolution, type Solution } from './solution';

let worker: Worker | null = null;
let nextId = 1;
interface Answer {
  solution: string;
  exact: boolean;
}

const pending = new Map<number, { resolve: (answer: Answer) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./fastSolver.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; solution?: string; exact?: boolean; error?: string }>) => {
      const { id, solution, exact, error } = event.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (error !== undefined || solution === undefined) entry.reject(new Error(error ?? 'Solver failed.'));
      else entry.resolve({ solution, exact: Boolean(exact) });
    };
  }
  return worker;
}

/** Starts building the solver tables early, so the first solve does not have to wait for them. */
export const warmUpFastSolver = () => getWorker().postMessage({ type: 'init' });

/**
 * Short solution for the Fastest tab. Other is any solution that is already known,
 * such as the beginner one. It is used instead when it turns out to be shorter.
 */
export async function solveFast(state: CubeState, other: readonly Move[] = []): Promise<Solution> {
  const answer: Answer = isSolved(state)
    ? { solution: '', exact: true }
    : await new Promise<Answer>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        getWorker().postMessage({ type: 'solve', id, facelets: toFaceletString(state) });
      });
  let moves = parseAlg(answer.solution);
  const alternative = simplifyAlg(other);
  if (!answer.exact && other.length > 0 && alternative.length < moves.length) moves = alternative;
  return makeSolution([
    {
      title: 'Shortest route',
      description: answer.exact
        ? 'This is the shortest solution there is for this cube. Follow the moves exactly, one at a time.'
        : 'A computer search found this sequence. It is short, though an even shorter one may exist. ' +
          'The moves will not look meaningful. Follow them exactly, one at a time.',
      steps: [{ title: 'Follow every move in order', moves }],
    },
  ]);
}
