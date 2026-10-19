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
  // (a fresh browser has an empty design, which asks you to draw)
  await page.waitForFunction(() => /built in/.test(document.getElementById('info')?.textContent ?? '') || /Draw some track/.test(document.getElementById('error')?.textContent ?? ''), null, { timeout: 30000 });
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
// Draw on the canvas: clear, then lay a straight up and a curve, then branch.
await page.click('#clear');
await page.click('#fit');
await page.selectOption('#radius', '0');
const box = (await page.locator('#track').boundingBox())!;
const at = async (fx: number, fy: number, button: 'left' | 'right' = 'left') => {
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy, { button });
};
await at(0.5, 0.9); await at(0.5, 0.6); await at(0.38, 0.1); await at(0.38, 0.1, 'right');
await at(0.5, 0.75); await at(0.62, 0.1); await at(0.62, 0.1, 'right');
await page.waitForTimeout(500);
await page.waitForFunction(() => /built in/.test(document.getElementById('info')?.textContent ?? '') || /\S/.test(document.getElementById('error')?.textContent ?? ''), null, { timeout: 30000 });
console.log('drawn:', await page.textContent('#info'), await page.textContent('#error'));
console.log('design:', await page.evaluate(() => localStorage.getItem('btd-design')));
await page.screenshot({ path: process.argv[2] ?? 'smoke.png' });
await browser.close();
