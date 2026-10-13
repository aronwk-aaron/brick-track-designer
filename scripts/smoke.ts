// Browser smoke test: load the built app (vite preview on PORT), wait for the
// piece to build, report console errors, the info line, and a screenshot.
// Usage: CHROME=/path/to/chrome PORT=4719 tsx scripts/smoke.ts out.png
import { chromium } from 'playwright-core';

const port = process.env.PORT ?? '4719';
const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1300, height: 750 } });
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${port}/`);
try {
  await page.waitForFunction(() => document.getElementById('info')?.textContent, null, { timeout: 30000 });
} catch { errors.push('timed out waiting for the piece'); }
console.log('info:', await page.textContent('#info'));
if (errors.length) console.log('errors:\n' + errors.join('\n'));
await page.screenshot({ path: process.argv[2] ?? 'smoke.png' });
await browser.close();
