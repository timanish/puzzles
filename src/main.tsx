import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root')!;
const route = root.dataset.route ?? '';

// Puzzles used to live behind the hash, as in #/rubik. Old links are sent to the real page.
const old = window.location.hash.match(/^#\/([a-z0-9-]+)$/);
if (!route && old) window.location.replace(`${old[1]}/`);

const app = (
  <StrictMode>
    <App route={route} />
  </StrictMode>
);

// The built pages already contain their HTML. The dev server serves an empty root.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
