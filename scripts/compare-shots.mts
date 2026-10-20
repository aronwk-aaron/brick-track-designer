// Takes the comparison pictures: drives scripts/compare-view.html (on a vite
// dev server, by default http://localhost:5181) with playwright-core.
// npx tsx scripts/compare-shots.mts <shots.json> [base URL]
// shots.json: [{ file, data, cam, ...spec }] (see compare-view.html)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { file: string; w?: number; h?: number }[];
const base = process.argv[3] ?? 'http://localhost:5181';
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') console.error('page:', m.text()); });
await page.goto(`${base}/scripts/compare-view.html`);
await page.waitForFunction(() => (window as unknown as { ready: boolean }).ready);
for (const s of shots) {
  const warn = await page.evaluate((spec) => (window as unknown as { shot: (s: unknown) => Promise<string[]> }).shot(spec), s);
  await page.locator('canvas').screenshot({ path: resolve(root, s.file) });
  console.log(s.file, warn.length ? `(warnings: ${warn.join('; ')})` : '');
}
await browser.close();
