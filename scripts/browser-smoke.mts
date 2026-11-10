// The app in a real browser, quickly (CI's smoke job; the tests have no page): the built site served by vite preview,
// then a template loaded and built, a route drawn and undone, Delete pressed behind an open dialog, a file that isn't
// a design opened, an edit with Auto off, and a template over a changed design. Any error on the page fails it. A few minutes at most: each wait has
// its own limit, and the whole run one (SMOKE_MINUTES, default 6).
//   pnpm build && npx tsx scripts/browser-smoke.mts      (CHROME: the browser to use; PORT: preview's)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { unzip } from '../src/geom/unzip';

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

  at = 'a problem report';
  const dl = page.waitForEvent('download', { timeout: 30_000 });
  await page.click('#report-open');
  const dlf = await dl, rep = unzip(readFileSync((await dlf.path())!));
  check(/^btd-report-untitled-\d{8}-\d{6}\.zip$/.test(dlf.suggestedFilename()), `Report a problem downloads a zip named for the design and the time (${dlf.suggestedFilename()})`);
  check(['design.btd.json', 'report.json', 'plan.png', 'view3d.png', 'note.txt'].every((n) => rep.has(n)), `with its five files (${[...rep.keys()].join(', ')})`);
  let rd: { routes?: unknown[] } = {}, rr: { app?: { version?: string }; build?: { status?: string } } = {};
  try { rd = JSON.parse(new TextDecoder().decode(rep.get('design.btd.json'))); rr = JSON.parse(new TextDecoder().decode(rep.get('report.json'))); } catch { /* the checks say */ }
  check(rd.routes?.length === 2, 'its design parses and has the two routes');
  check(!!rr.app?.version && /built in/.test(rr.build?.status ?? ''), `its report has the version and the build's words (${rr.app?.version})`);
  check((rep.get('plan.png')?.length ?? 0) > 500 && (rep.get('view3d.png')?.length ?? 0) > 500, 'and both pictures have something in them');
  // (opened again: the design and the view come back)
  await page.setInputFiles('#load-file', { name: dlf.suggestedFilename(), mimeType: 'application/zip', buffer: Buffer.from(readFileSync((await dlf.path())!)) });
  check(await says(/1 switch.*built in/), 'a report opened again builds its design');

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

  at = 'a full circle';
  // (a fresh design with the app's own settings: the template before set its own)
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForSelector('#track');
  await page.click('#circle > summary');
  await page.fill('#circle-body input >> nth=0', '24');
  await page.fill('#circle-body input >> nth=1', '8');
  check(/8 pieces · 45° each/.test(await page.locator('#circle-body').innerText()), 'Full circle says the angle of each piece');
  await page.click('#circle-body button.add');
  check(await routes() === 1, 'Add circle adds one route');
  check(await says(/8 parts to print.*built in/), `the circle builds in its 8 pieces (${await status()})`);

  // (the circle's route is selected: its curves have handles; drag the first one's angle handle back to the middle of its arc)
  at = 'a handle';
  const handles = () => page.evaluate(() => JSON.parse(document.getElementById('track')!.dataset.handles ?? '[]') as { seg: number; kind: string; x: number; y: number }[]);
  await page.click('#mode-select');
  const hs = await handles();
  const ang = hs.find((h) => h.seg === 0 && h.kind === 'angle'), mid = hs.find((h) => h.seg === 0 && h.kind === 'radius');
  check(!!ang && !!mid, 'a selected route\'s curves have handles');
  if (ang && mid) {
    const tb = (await page.locator('#track').boundingBox())!;
    await page.mouse.move(tb.x + ang.x, tb.y + ang.y);
    await page.mouse.down();
    await page.mouse.move(tb.x + (ang.x + mid.x) / 2, tb.y + (ang.y + mid.y) / 2, { steps: 4 });
    await page.mouse.move(tb.x + mid.x, tb.y + mid.y, { steps: 4 });
    await page.mouse.up();
    const angle = () => page.locator('#routes input[title^="How far it turns"]').first().inputValue();
    check(await angle() === '22.5', `dragging the angle handle sets the angle: the card shows it (${await angle()})`);
    check(await says(/7 parts to print.*built in|8 parts to print.*built in/), `and it builds (${await status()})`);
  }

  // (two ready-made tables, one after the other: the second lands beside the first, not on it)
  at = 'tables';
  await page.click('#tables > summary');
  for (let k = 0; k < 2; k++) { await page.locator('#tables-body select').first().selectOption('0'); await page.waitForTimeout(200); }
  const tbs = await page.evaluate(() => (JSON.parse(localStorage.getItem('btd-design') ?? '{}').tables ?? []) as { x: number; w: number }[]);
  check(tbs.length === 2 && tbs[1].x >= tbs[0].x + tbs[0].w, `a second ready-made table lands clear of the first (${JSON.stringify(tbs.map((t) => t.x))})`);

  // (editing a fresh design of two short routes, fitted: where things are on the screen from the plan's own view)
  at = 'editing';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: -20, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 16 }], guardRails: true },
    { name: 'B', x: 4, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'C', x: -20, y: -12, heading: -90, segs: [{ kind: 'straight', studs: 16 }] },
  ] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit');
  await page.waitForTimeout(300);
  const tbx = (await page.locator('#track').boundingBox())!;
  const scr = async (wx: number, wy: number): Promise<[number, number]> => { const v = await page.evaluate(() => (window as unknown as { btdCanvas: { view(): { scale: number; ox: number; oy: number } } }).btdCanvas.view()); return [tbx.x + v.ox + wx * v.scale, tbx.y + v.oy - wy * v.scale]; };
  const xy = async (n: string) => page.evaluate((nm) => { const r = (JSON.parse(localStorage.getItem('btd-design') ?? '{}').routes as { name: string; x: number; y: number }[]).find((q) => q.name === nm)!; return `${r.x},${r.y}`; }, n);
  const errs0 = errors.length;
  // Esc during a drag of a whole route puts it back, and the route stays selected
  const [bx, by] = await scr(12, 0);
  await page.mouse.move(bx, by); await page.mouse.down(); await page.mouse.move(bx + 60, by + 40, { steps: 4 });
  check(await xy('B') !== '4,0', 'a route being dragged moves');
  await page.keyboard.press('Escape');
  check(await xy('B') === '4,0', 'Esc mid-drag puts the route back');
  await page.mouse.move(bx + 90, by + 60, { steps: 3 }); await page.mouse.up();
  check(await xy('B') === '4,0', 'and letting go afterwards moves nothing');
  check(await page.locator('#sel-count').innerText() === '1 selected', 'the route is still selected');
  // Delete during a drag is ignored (it used to throw on each move)
  await page.mouse.move(bx, by); await page.mouse.down(); await page.mouse.move(bx + 30, by + 30, { steps: 3 });
  await page.keyboard.press('Delete'); await page.mouse.move(bx + 60, by + 40, { steps: 3 }); await page.mouse.up();
  check(await routes() === 3, 'Delete in the middle of a drag removes nothing');
  await page.mouse.click(bx, by); // (selected again, wherever the drag left it)
  // the arrow keys nudge the selection a stud; Shift eight
  const was = (await xy('B')).split(',').map(Number);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowUp');
  check(await xy('B') === `${was[0] + 1},${was[1] + 8}`, `the arrow keys nudge the selected route (${await xy('B')})`);
  // copy with nothing selected keeps what was copied
  await page.keyboard.press('Control+c'); await page.keyboard.press('Escape'); await page.keyboard.press('Control+c');
  check(!(await page.isDisabled('#sel-paste')), 'Copy with nothing selected leaves the clipboard as it was');
  // paste again at the same spot: each one a step over
  await page.mouse.move(...(await scr(0, -30))); await page.keyboard.press('Control+v'); await page.keyboard.press('Control+v');
  const pasted = await page.evaluate(() => (JSON.parse(localStorage.getItem('btd-design') ?? '{}').routes as { x: number; y: number }[]).slice(3).map((q) => `${q.x},${q.y}`));
  check(pasted.length === 2 && pasted[0] !== pasted[1], `pasting twice at one spot doesn't stack the routes (${pasted.join(' ')})`);
  // select all takes the tables too: mirror, nudge, copy and paste carry them with the route
  at = 'tables with the selection';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
  ], tables: [{ name: 'T', shape: 'rect', x: 10, y: 0, w: 20, h: 16 }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(300);
  const tab = () => page.evaluate(() => (JSON.parse(localStorage.getItem('btd-design') ?? '{}').tables ?? []) as { x: number; y: number }[]);
  await page.keyboard.press('Control+a');
  check(await page.locator('#sel-count').innerText() === '2 selected', `select all counts the table (${await page.locator('#sel-count').innerText()})`);
  await page.keyboard.press('m');
  check((await tab())[0]?.x === -30, `mirror takes the table across with the route (${JSON.stringify(await tab())})`);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());   // (the Fit button had the focus: arrows would press nothing)
  await page.keyboard.press('ArrowRight');
  check((await tab())[0]?.x === -29, 'the arrow keys nudge the table with the route');
  await page.keyboard.press('Control+d');
  check((await tab()).length === 2 && await routes() === 2, 'duplicate copies the table with the route');
  await page.keyboard.press('Delete');
  check((await tab()).length === 1 && await routes() === 1, 'Delete takes out the selected copy and its table, not the first');
  await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
  check((await tab()).length === 0 && await routes() === 0, 'Delete takes the selected tables out with the routes');
  // an end dragged onto one that has other guard rails doesn't join (and says why)
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: -20, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 16 }], guardRails: true },
    { name: 'B', x: 4, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 16 }] },
  ] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(300);
  const [sx, sy] = await scr(4, 0), [ex, ey] = await scr(-4, 0);
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move((sx + ex) / 2, sy, { steps: 3 }); await page.mouse.move(ex, ey, { steps: 3 });
  await page.waitForTimeout(150);
  check(/can't join A/.test(await page.locator('#hint').innerText()), `the hint says why they won't join (${await page.locator('#hint').innerText()})`);
  await page.mouse.up();
  check(await routes() === 2, 'and they stay two routes');
  check(errors.length === errs0, `no errors from any of that${errors.length > errs0 ? `: ${errors.slice(errs0).join(' | ').slice(0, 300)}` : ''}`);

  check(errors.length === 0, `no errors on the page${errors.length ? `: ${errors.join(' | ').slice(0, 600)}` : ''}`);
} catch (err) {
  fails.push(`${at}: ${err instanceof Error ? err.message : err}`);
} finally { await browser.close(); stopPreview(); clearTimeout(limit); }
if (fails.length) { console.error(`::error::browser smoke test failed: ${fails.join('; ').slice(0, 900)}`); process.exit(1); }
console.log('browser smoke test passed');
