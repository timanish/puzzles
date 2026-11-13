import { useEffect, useState } from 'react';
import { RubikApp } from './puzzles/rubik/RubikApp';

// Each puzzle lives in its own folder under src/puzzles and is registered here.
const PUZZLES = [
  {
    id: 'rubik',
    title: "Rubik's Cube",
    blurb: 'Scan a 3x3 cube and follow the solution one move at a time.',
    component: RubikApp,
  },
];

const currentRoute = () => window.location.hash.replace(/^#\/?/, '');

export function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const puzzle = PUZZLES.find((p) => p.id === route);

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand">
          Puzzle Camera
        </a>
        {puzzle && <span className="crumb">{puzzle.title}</span>}
      </header>
      <main>
        {puzzle ? (
          <puzzle.component />
        ) : (
          <>
            <div className="card">
              <h2>Point your camera at a puzzle</h2>
              <p>Pick a puzzle, show it to the camera and get step-by-step instructions to solve it.</p>
            </div>
            <div className="puzzles">
              {PUZZLES.map((p) => (
                <a key={p.id} href={`#/${p.id}`} className="card puzzle-link">
                  <h3>{p.title}</h3>
                  <p>{p.blurb}</p>
                </a>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
