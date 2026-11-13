/// <reference lib="webworker" />
// Runs the two-phase solver off the main thread. Building its lookup tables takes a few seconds.
//
// The cubejs files are plain scripts that attach Cube to "this". Bundlers load them as modules,
// where "this" is undefined, so the sources are evaluated here with the worker scope as "this".
import type CubeClass from 'cubejs';
import cubeSource from 'cubejs/lib/cube.js?raw';
import solveSource from 'cubejs/lib/solve.js?raw';

import { formatAlg, fromFaceletString } from './cube';
import { solveShort } from './shortSolver';

new Function(cubeSource).call(self);
new Function(solveSource).call(self);
const Cube = (self as unknown as { Cube: typeof CubeClass }).Cube;

let ready = false;
const init = () => {
  if (!ready) {
    Cube.initSolver();
    solveShort(fromFaceletString('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'));
    ready = true;
  }
};

self.onmessage = (event: MessageEvent<{ type: 'init' } | { type: 'solve'; id: number; facelets: string }>) => {
  const message = event.data;
  try {
    init();
    if (message.type === 'solve') {
      // Easy cubes get an exact shortest solution. The rest go to the two-phase solver.
      const short = solveShort(fromFaceletString(message.facelets));
      const solution = short ? formatAlg(short) : Cube.fromString(message.facelets).solve();
      self.postMessage({ id: message.id, solution, exact: short !== null });
    }
  } catch (e) {
    if (message.type === 'solve') self.postMessage({ id: message.id, error: String(e) });
  }
};
