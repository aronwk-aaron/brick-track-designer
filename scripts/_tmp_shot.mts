import { chromium } from 'playwright-core';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5193/');
await page.waitForTimeout(1500);
const names = await page.$$eval('#template optgroup[label="Test prints"] option', (os) => os.map((o) => (o as HTMLOptionElement).value));
console.log(names);
let k = 0;
for (const name of names) {
  await page.selectOption('#template', name);
  await page.waitForTimeout(500);
  await page.waitForFunction(() => /built in/.test(document.getElementById('info')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => errors.push('timeout ' + name));
  await page.waitForTimeout(2500);
  console.log(name, '|', await page.textContent('#info'), '|', await page.textContent('#error'));
  await page.screenshot({ path: `${out}/t${++k}.png` });
}
if (errors.length) console.log('errors:\n' + errors.join('\n'));
await browser.close();
