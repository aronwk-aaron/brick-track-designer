// The app in a real browser, quickly (CI's smoke job; the tests have no page): the built site served by vite preview,
// then a template loaded and built, a route drawn and undone, Delete pressed behind an open dialog, a file that isn't
// a design opened, an edit with Auto off, and a template over a changed design. Any error on the page fails it. A few minutes at most: each wait has
// its own limit, and the whole run one (SMOKE_MINUTES, default 6).
//   pnpm build && npx tsx scripts/browser-smoke.mts      (CHROME: the browser to use; PORT: preview's)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';

const root = new URL('../', import.meta.url).pathname, port = process.env.PORT ?? '4733';
const chrome = process.env.CHROME ?? ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const preview = spawn('npx', ['vite', 'preview', '--port', port, '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
const stopPreview = () => { try { process.kill(-preview.pid!, 'SIGTERM'); } catch { /* (gone already) */ } };
const limit = setTimeout(() => { console.error(`::error::the browser smoke test ran past its time and was stopped (at: ${at})`); stopPreview(); process.exit(124); }, Number(process.env.SMOKE_MINUTES ?? 6) * 60_000);
let at = 'starting';
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

const url = `http://localhost:${port}/`;
for (let k = 0; ; k++) { try { if ((await fetch(url)).ok) break; } catch { /* (not up yet) */ } if (k > 100) throw new Error('vite preview did not start'); await new Promise((r) => setTimeout(r, 200)); }
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page: Page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader/i.test(m.text())) errors.push(m.text()); });
  // (a design being replaced asks first: yes)
  page.on('dialog', (d) => { void d.accept(); });
  const status = () => page.evaluate(() => `${document.getElementById('info')!.textContent} ${document.getElementById('error')!.textContent}`);
  const says = (re: RegExp, ms = 90_000) => page.waitForFunction((src) => new RegExp(src).test(`${document.getElementById('info')!.textContent} ${document.getElementById('error')!.textContent}`) && document.getElementById('buildstatus')!.hidden, re.source, { timeout: ms }).then(() => true, () => false);
  const routes = () => page.evaluate(() => (JSON.parse(localStorage.getItem('btd-design') ?? '{"routes":[]}').routes as unknown[]).length);

  at = 'loading the page';
  await page.goto(url); await page.waitForSelector('#track');
  check(await says(/Nothing to build yet/, 20_000), 'an empty plan says there is nothing to build');

  at = 'a template';
  // (the template browser: search for a name, press its card)
  await page.click('#templates-open');
  check(await page.locator('#tpl-dlg').evaluate((d: HTMLDialogElement) => d.open), 'the template browser opens');
  check((await page.locator('#tpl-body .tcard').count()) > 50, 'it lists the templates');
  await page.fill('#tpl-search', 'switch lego');
  check((await page.locator('#tpl-body .tcard').count()) === 1, 'a search narrows them to the card');
  await page.click('#tpl-body button[data-template="Left switch (LEGO)"]');
  check(!(await page.locator('#tpl-dlg').evaluate((d: HTMLDialogElement) => d.open)), 'pressing the card closes the browser');
  check(await says(/1 switch.*parts? to print.*built in/), `a template loads and builds (${await status()})`);
  check(await routes() === 2, 'the template has its two routes');

  at = 'drawing';
  const box = (await page.locator('#track').boundingBox())!;
  await page.keyboard.press('d');
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.7);
  await page.mouse.move(box.x + box.width * 0.12, box.y + box.height * 0.4, { steps: 3 });
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.4);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  check(await routes() === 3, 'two clicks in Draw lay a route');
  await page.keyboard.press('Control+z');
  check(await routes() === 2, 'Undo takes it away again');
  check(await says(/1 switch.*built in/), 'and the design builds again');

  at = 'a dialog';
  await page.keyboard.press('Control+a');
  await page.click('#parts-open');
  check(await page.locator('#parts-dlg').evaluate((d: HTMLDialogElement) => d.open), 'the parts list opens');
  await page.keyboard.press('Delete');
  check(await routes() === 2, 'Delete behind the open parts list removes nothing');
  await page.keyboard.press('Escape');

  at = 'a bad file';
  await page.setInputFiles('#load-file', { name: 'not-a-design.btd.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"routes":[{"name":"A"}]}') });
  check(await says(/Couldn't open not-a-design/, 20_000), `a file that isn't a design is turned away (${await status()})`);
  check(await routes() === 2, 'and the design is as it was');

  at = 'Auto off';
  await page.click('#auto-build');
  await page.keyboard.press('Control+a'); await page.keyboard.press('r');
  check(await says(/press Build/, 30_000), 'with Auto off an edit leaves the 3D view to Build');
  check(await page.isDisabled('#export-stl'), 'and the STL download waits for it');
  await page.click('#rebuild');
  check(await says(/1 switch.*built in/), 'Build builds it');
  check(!(await page.isDisabled('#export-stl')), 'and the STL download is there again');

  at = 'replacing a changed design';
  await page.click('#templates-open');
  await page.fill('#tpl-search', 'oval');
  await page.click('#tpl-body button[data-template="Oval (LEGO R40)"]');
  await page.waitForSelector('#ask-dlg[open]', { timeout: 10_000 }).catch(() => undefined);
  check(await page.locator('#ask-dlg').evaluate((d: HTMLDialogElement) => d.open), 'a template over a changed design asks first');
  await page.click('#ask-no');
  check(await routes() === 2, 'Keep it keeps it');
  check(await page.locator('#tpl-dlg').evaluate((d: HTMLDialogElement) => d.open), 'and the browser stays open');
  await page.keyboard.press('Escape');
  check(!(await page.locator('#tpl-dlg').evaluate((d: HTMLDialogElement) => d.open)), 'Esc closes the browser');

  check(errors.length === 0, `no errors on the page${errors.length ? `: ${errors.join(' | ').slice(0, 600)}` : ''}`);
} catch (err) {
  fails.push(`${at}: ${err instanceof Error ? err.message : err}`);
} finally { await browser.close(); stopPreview(); clearTimeout(limit); }
if (fails.length) { console.error(`::error::browser smoke test failed: ${fails.join('; ').slice(0, 900)}`); process.exit(1); }
console.log('browser smoke test passed');
