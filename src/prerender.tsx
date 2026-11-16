// Renders each page to HTML at build time, so that search engines and link previews
// see the real text instead of an empty page. It is run by scripts/prerender.mjs.
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App';
import { FAQ } from './puzzles/rubik/guideText';
import { APP_URL } from './site';

const RUBIK_DATA = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: "Rubik's Cube Solver with Camera Scan",
    url: `${APP_URL}rubik/`,
    description:
      "Scan a 3x3 Rubik's Cube with your camera and follow the solution one move at a time, as a beginner method or as the shortest route.",
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript. The scan needs a camera.',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@type': 'Person', name: 'Anish Timsina', url: new URL('/', APP_URL).href },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  },
];

/** Structured data for each page, keyed by route. */
const DATA: Record<string, object[]> = { rubik: RUBIK_DATA };

export function render(route: string): { body: string; head: string } {
  const body = renderToString(
    <StrictMode>
      <App route={route} />
    </StrictMode>,
  );
  const head = (DATA[route] ?? [])
    // A "<" is escaped so that the text can never close the script tag.
    .map((data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`)
    .join('\n    ');
  return { body, head };
}
