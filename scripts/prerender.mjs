// Fills the built pages with their rendered HTML. Run after "vite build".
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

/** Built page of each route. */
const PAGES = { '': 'dist/index.html', rubik: 'dist/rubik/index.html' };

// Vite loads the TypeScript sources directly, so no second build is needed.
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { render } = await vite.ssrLoadModule('/src/prerender.tsx');
  for (const [route, file] of Object.entries(PAGES)) {
    const page = await readFile(file, 'utf8');
    const root = /(<div id="root"[^>]*>)(<\/div>)/;
    if (!root.test(page) || !page.includes('</head>')) throw new Error(`${file} has no empty root element to fill.`);
    const { body, head } = render(route);
    const filled = page
      .replace(root, (_, open, close) => open + body + close)
      .replace('</head>', () => (head ? `  ${head}\n  </head>` : '</head>'));
    await writeFile(file, filled);
    console.log(`prerendered ${file} (${body.length} characters)`);
  }
} finally {
  await vite.close();
}
