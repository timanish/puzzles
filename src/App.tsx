import { useEffect, useState } from 'react';
import { RubikApp } from './puzzles/rubik/RubikApp';

const SITE = 'https://timanish.github.io';

// Each puzzle lives in its own folder under src/puzzles and is registered here.
const PUZZLES = [
  {
    id: 'rubik',
    title: "Rubik's Cube",
    blurb: 'Turn a 3x3 cube in front of the camera, then follow the solution one move at a time.',
    tags: ['Camera scan', 'Beginner method', 'Shortest solution'],
    // Sticker colors of the small preview, row by row.
    preview: ['#ffd500', '#1e5fd8', '#d32f2f', '#f2f2f2', '#1faa55', '#ff8a1f', '#d32f2f', '#ffd500', '#1e5fd8'],
    component: RubikApp,
  },
];

const STEPS = [
  { title: 'Show', text: 'Hold the puzzle up to your camera. The app finds it in the picture by itself.' },
  { title: 'Check', text: 'Compare what the app read with the real thing, and fix anything it got wrong.' },
  { title: 'Solve', text: 'Follow the solution one step at a time, with a picture and a plain description of each move.' },
];

const currentRoute = () => window.location.hash.replace(/^#\/?/, '');

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.dataset.theme
    ? root.dataset.theme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  root.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch {
    // Private browsing can block storage. The theme still changes for this visit.
  }
}

/** Faint contour lines behind the page, the same motif as the main site. */
function Topo() {
  return (
    <div className="topo" aria-hidden="true">
      <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 900 600">
        <g fill="none" stroke="var(--topo-line)" strokeWidth="1.2">
          {[120, 170, 220, 280, 340, 400, 460, 520].map((y, i) => (
            <path
              key={y}
              d={`M-50,${y} C${150 + i * 10},${y - 60} ${280 + i * 10},${y + 60} ${450 + i * 10},${y + 20} C${620 + i * 10},${y - 20} ${720 + i * 10},${y + 80} 950,${y + 30}`}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onChange = () => {
      setRoute(currentRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const puzzle = PUZZLES.find((p) => p.id === route);

  return (
    <>
      <Topo />
      <header className="site-head">
        <div className="nav">
          <a className="logo" href={`${SITE}/`}>
            anish<span className="accent">.</span>timsina
          </a>
          <nav>
            <a href={`${SITE}/#about`}>About</a>
            <a href={`${SITE}/#experience`}>Experience</a>
            <a href={`${SITE}/now/`}>Now</a>
            <a href="#/" className="current">
              Puzzles
            </a>
            <button type="button" id="theme-toggle" aria-label="Toggle color theme" title="Toggle theme" onClick={toggleTheme}>
              <span className="sun">☀️</span>
              <span className="moon">🌙</span>
            </button>
          </nav>
        </div>
      </header>

      <main>
        {puzzle ? (
          <div className="puzzle-shell">
            <p className="crumbs mono">
              <a href="#/">puzzles</a> / {puzzle.id}
            </p>
            <puzzle.component />
          </div>
        ) : (
          <>
            <section className="hero">
              <div className="glow" aria-hidden="true" />
              <p className="eyebrow mono">$ ls puzzles/</p>
              <h1 className="grad-text">Puzzle Camera</h1>
              <p className="headline">Point a camera at a puzzle. Get the solution one step at a time.</p>
              <p className="sub">Everything runs in your browser. The camera picture never leaves your device.</p>
            </section>

            <section>
              <h2>
                <span className="mono accent">01.</span> Puzzles
              </h2>
              <div className="puzzles">
                {PUZZLES.map((p) => (
                  <a key={p.id} href={`#/${p.id}`} className="puzzle-card">
                    <div className="mini-face" aria-hidden="true">
                      {p.preview.map((color, i) => (
                        <span key={i} style={{ background: color }} />
                      ))}
                    </div>
                    <div>
                      <h3>{p.title}</h3>
                      <p>{p.blurb}</p>
                      <ul className="tags">
                        {p.tags.map((tag) => (
                          <li key={tag}>{tag}</li>
                        ))}
                      </ul>
                    </div>
                  </a>
                ))}
                <div className="puzzle-card soon">
                  <p className="mono">More puzzles are on the way.</p>
                </div>
              </div>
            </section>

            <section>
              <h2>
                <span className="mono accent">02.</span> How it works
              </h2>
              <ol className="steps-grid">
                {STEPS.map((step, i) => (
                  <li key={step.title}>
                    <span className="mono accent">{i + 1}</span>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </main>

      <footer>
        <p className="mono">
          Part of <a href={`${SITE}/`}>anish.timsina</a> · hosted on GitHub Pages ·{' '}
          <a href="https://github.com/timanish/puzzles" rel="noopener">
            view source
          </a>
        </p>
        <p className="mono dim">© {new Date().getFullYear()} Anish Timsina</p>
      </footer>
    </>
  );
}
