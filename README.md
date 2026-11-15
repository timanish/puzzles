# Puzzle Camera

Point a camera at a puzzle and get the solution one step at a time.

Live site: https://timanish.github.io/puzzles/

Puzzle Camera is a suite of browser apps that solve real-life puzzles from a camera picture. The first puzzle is a 3x3 Rubik's cube. Everything runs in the browser, and the camera picture never leaves the device.

## The Rubik's cube solver

The solver has three screens.

1. **Scan.** Turn the cube slowly in front of the camera until it has seen all six sides. Any order and any orientation works. An outline appears around a side when it is seen, and the screen flashes when it is saved.
2. **Check.** The app shows the cube unfolded. Compare it with the real cube and repaint any square it read wrong. The app says what is wrong when the colors cannot form a real cube.
3. **Solve.** Step through the solution on a 3D cube that you can drag around. Each move comes with its notation and a plain description, such as "Turn the top face (white center) a quarter turn clockwise".

Two solutions are offered for every cube:

- **Beginner method.** A layer-by-layer solution in seven stages, from the bottom cross to the top edges. It reads like a tutorial and names the piece that each step places.
- **Fastest.** The shortest route the app can find. Cubes within nine moves of solved get a proven shortest solution. Other cubes get a short solution from a two-phase search, which may not be the shortest one.

You can also skip the camera. The start screen lets you enter the colors by hand or try a random scramble.

### Scanning tips

- Roll the cube from one side to the next without putting it down. The app follows the turns to work out which sides touch.
- Hold the cube by its edges so your fingers do not cover the side facing the camera.
- Light the cube from the front.
- Tap a saved side to remove it and scan it again.
- Save photo downloads the current camera picture, which helps when a failing scan needs a closer look.

## Getting started

You need Node.js. The deploy workflow builds with Node 22.

```sh
npm install
npm run dev
```

Open the address that Vite prints. Camera access works on `localhost` without extra setup.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the dev server. |
| `npm run dev:phone` | Serves over HTTPS on the local network with a self-signed certificate. |
| `npm test` | Runs the test suite once with Vitest. |
| `npm run build` | Type-checks, then builds the site into `dist`. |
| `npm run preview` | Serves the built site locally. |

### Testing on a phone

Phones only allow camera access over HTTPS. Run `npm run dev:phone`, open the network address on the phone and accept the certificate warning.

## How it works

The scan pipeline turns camera frames into a cube state in four steps.

1. **Find a face** (`detectFace.ts`). Each frame is shrunk to 320 pixels wide and searched for one cube face at any in-plane angle. Many cubes have no dark gaps between pieces, so the detector does not count stickers. It looks for the outline of the whole face, splits it into a 3x3 grid and checks the grid against the picture.
2. **Follow the cube** (`faceTracker.ts`). A side is saved once two readings in a row agree, which filters out motion blur. The tracker also notes the direction from which each new side came into view. Those notes say which sides share an edge.
3. **Fit the sides together** (`assemble.ts`). The six sides arrive in arbitrary order and rotation. Every arrangement is tried, and one whose edges and corners form real cube pieces wins. The turn notes break ties on nearly solved cubes, where the pieces alone leave the layout open. The usual color layout breaks the ties that remain.
4. **Name the colors** (`colors.ts`). Stickers are compared with the six scanned centers instead of fixed reference colors. This keeps the result stable under warm, dim or uneven lighting. Each sticker is judged together with the other stickers on its piece, which keeps red and orange apart.

The solvers work on the resulting state.

- `beginner.ts` runs a small search at each stage over the handful of algorithms a beginner would use.
- `shortSolver.ts` finds exact shortest solutions of up to nine moves. It searches forward from the scramble and meets a table of every position within four moves of solved.
- `fastSolver.worker.ts` runs both the short solver and the [cubejs](https://github.com/ldez/cubejs) two-phase solver in a web worker. Building the two-phase tables takes a few seconds, so the worker starts as soon as the cube page opens.

`cube.ts` holds the cube model. A state is 54 stickers in U, R, F, D, L, B order, the same layout that cubejs uses. The file also validates states and reports problems such as a twisted corner, a flipped edge or two swapped pieces.

## Project layout

```
src/
  App.tsx            Landing page, puzzle registry and hash routing
  shared/            Camera hook and color helpers used by every puzzle
  puzzles/rubik/     The Rubik's cube solver
    RubikApp.tsx     Screen flow: start, scan, review, solve
    ScanView.tsx     Camera scan
    ReviewView.tsx   Color check and manual entry
    SolveView.tsx    Step-by-step playback
    Cube3D.tsx       Animated 3D cube
    FaceNet.tsx      Unfolded cube for the review screen
tests/               Vitest suites for the cube model, solvers, scan and tracker
```

### Adding a puzzle

Each puzzle lives in its own folder under `src/puzzles`. Add a folder with a root component, then register it in the `PUZZLES` list in `src/App.tsx`. The list entry supplies the route, the card on the landing page and the component to render.

## Tech stack

- React 19 and TypeScript
- Vite for the dev server and build
- Vitest for tests
- cubejs for the two-phase solver

The app has no backend. Routing uses the URL hash, and assets use relative paths, so the build runs from any folder on a static host.

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`. The workflow runs the tests, builds the site and publishes `dist` to GitHub Pages. A failing test stops the deploy.
