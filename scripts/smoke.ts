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
  await page.waitForFunction(() => /built in/.test(document.getElementById('info')?.textContent ?? ''), null, { timeout: 30000 });
} catch { errors.push('timed out waiting for the piece'); }
console.log('info:', await page.textContent('#info'));
console.log('error:', await page.textContent('#error'));
console.log('plan svg:', (await page.innerHTML('#plan')).length, 'chars');
if (errors.length) console.log('errors:\n' + errors.join('\n'));
// Every template builds without errors.
for (const name of await page.$$eval('#template option', (os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean))) {
  await page.selectOption('#template', name);
  await page.waitForFunction(() => /built in|\S/.test(document.getElementById('error')?.textContent ?? '') || /built in/.test(document.getElementById('info')?.textContent ?? ''), null, { timeout: 30000 });
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !/Building/.test(document.getElementById('info')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});
  console.log(`template "${name}":`, await page.textContent('#info'), await page.textContent('#error'));
}
await page.screenshot({ path: process.argv[2] ?? 'smoke.png' });
await browser.close();
