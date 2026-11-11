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
  await page.click('#tpl-body .tcard[data-template="Left switch (LEGO)"] .tpick');
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

  // settings are undo steps too, in order with the track edits: change a setting, draw a straight, Ctrl+Z twice, Ctrl+Shift+Z twice
  at = 'undoing settings';
  const ballast = () => page.evaluate(() => (JSON.parse(localStorage.getItem('btd-design')!).options?.ballast ?? 'none') as string);
  const ballast0 = await ballast();
  await page.click('#settings-open'); await page.fill('#settings-search', 'Ballast');
  const sel = page.locator('#options label.field', { has: page.locator('span', { hasText: /^Ballast\s*i?$/ }) }).locator('select');
  await sel.selectOption('ballast'); await page.waitForTimeout(300);
  check(await ballast() === 'ballast', 'a setting changed (Ballast) is in the design');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('d');
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.7);
  await page.mouse.move(box.x + box.width * 0.12, box.y + box.height * 0.4, { steps: 3 });
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.4);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  check(await routes() === 3, 'and a straight drawn after it');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  check(await routes() === 2 && await ballast() === 'ballast', 'Ctrl+Z takes the straight away first');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  check(await ballast() === ballast0, `and again the setting (${await ballast()})`);
  check(await sel.inputValue() === ballast0, 'the settings panel shows it');
  await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(150);
  check(await ballast() === 'ballast' && await routes() === 2, 'Ctrl+Shift+Z gives back the setting');
  await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(150);
  check(await routes() === 3, 'and the straight');
  // (with the focus left in the drop-down, Ctrl+Z still undoes)
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  await sel.selectOption('buddy'); await page.waitForTimeout(200);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  check(await ballast() === ballast0, 'Ctrl+Z works with the focus in the setting just changed');
  // the settings in groups: each header says what's changed and has its own reset; a group the design can't use says so
  await page.fill('#settings-search', '');
  check(await page.locator('#options summary').count() === 14, `the settings are in 14 groups (${await page.locator('#options summary').count()})`);
  check(await page.locator('#options summary', { hasText: 'Monorail' }).first().innerText().then((t) => /not used in this design/.test(t)), 'a design with no monorail marks Monorail "not used in this design"');
  await page.locator('#options summary', { hasText: 'Sleepers and ballast' }).click(); await page.locator('#options label.field', { has: page.locator('span', { hasText: /^Ballast\s*i?$/ }) }).locator('select').selectOption('buddy'); await page.waitForTimeout(200);
  check(await page.locator('#options summary', { hasText: 'Sleepers and ballast' }).locator('.chg').innerText().then((t) => /1 changed/.test(t)), 'a changed setting is counted in its group header');
  await page.locator('#options summary', { hasText: 'Sleepers and ballast' }).getByRole('button', { name: 'Reset group' }).click(); await page.waitForTimeout(200);
  check(await ballast() === 'none', 'Reset group puts it back');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  check(await ballast() === 'buddy', 'and it is one undo step');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  await page.click('#settings-close');
  check(await says(/1 switch.*built in/), 'and the design builds again after the settings undone');

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
  await page.click('#tpl-body .tcard[data-template="Oval (LEGO R40)"] .tpick');
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

  // a curve's Flip button turns it the other way, in one undo step
  at = 'flip';
  const angleIn = { inputValue: () => page.evaluate(() => String((JSON.parse(localStorage.getItem('btd-design')!).routes[0].segs as { kind: string; angle?: number }[]).find((g) => g.kind === 'curve')?.angle)) };
  await page.locator('#routes details.route').first().evaluate((d: HTMLDetailsElement) => { d.open = true; });
  const was0 = await angleIn.inputValue();
  await page.locator('#routes button', { hasText: /^Flip$/ }).first().click();
  check(await angleIn.inputValue() === String(-Number(was0)), `Flip turns the curve the other way (${was0} then ${await angleIn.inputValue()})`);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  check(await angleIn.inputValue() === was0, `and one undo puts it back (${await angleIn.inputValue()})`);
  // with the 3D view hidden an edit builds no parts (no Building chip): only the plan's trackwork
  await page.click('#toggle-3d');
  await page.keyboard.press('Control+Shift+z');   // (redo: the flip again)
  await page.waitForTimeout(700);
  check(await page.locator('#buildstatus').isHidden(), 'an edit with the 3D view hidden starts no parts build');
  await page.keyboard.press('Control+z'); await page.click('#toggle-3d');
  await says(/parts? to print.*built in/);
  // a radius handle pulled in past the least says why it stopped
  const hs2 = await handles(), rad = hs2.find((h) => h.seg === 0 && h.kind === 'radius');
  if (rad) {
    const tb2 = (await page.locator('#track').boundingBox())!;
    await page.mouse.move(tb2.x + rad.x, tb2.y + rad.y); await page.mouse.down();
    // (towards the route's start: the radius goes to nothing)
    const st = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('btd-design')!).routes[0] as { x: number; y: number }; const v = (window as unknown as { btdCanvas: { view(): { scale: number; ox: number; oy: number } } }).btdCanvas.view(); return [v.ox + r.x * v.scale, v.oy - r.y * v.scale]; });
    await page.mouse.move(tb2.x + (rad.x + st[0]) / 2, tb2.y + (rad.y + st[1]) / 2, { steps: 4 });
    await page.mouse.move(tb2.x + st[0], tb2.y + st[1], { steps: 4 });
    const hint = await page.locator('#hint').innerText();
    await page.mouse.up();
    check(/smallest radius is 24 studs/.test(hint), `a handle at a limit says why in the hint (${hint})`);
    await page.keyboard.press('Control+z');
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
  // (the route as the plan has it, mid-drag: a drag isn't stored till it's let go of)
  const xyLive = (n: string) => page.evaluate((nm) => { const r = (window as unknown as { btdCanvas: { host: { design(): { routes: { name: string; x: number; y: number }[] } } } }).btdCanvas.host.design().routes.find((q) => q.name === nm)!; return `${r.x},${r.y}`; }, n);
  const errs0 = errors.length;
  // Esc during a drag of a whole route puts it back, and the route stays selected
  const [bx, by] = await scr(12, 0);
  await page.mouse.move(bx, by); await page.mouse.down(); await page.mouse.move(bx + 60, by + 40, { steps: 4 });
  check(await xyLive('B') !== '4,0', 'a route being dragged moves');
  check(await xy('B') === '4,0', 'and a reload now would bring it back where it was (nothing stored mid-drag)');
  await page.keyboard.press('Escape');
  check(await xyLive('B') === '4,0' && await xy('B') === '4,0', 'Esc mid-drag puts the route back');
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
  // a drag saves once, on release: nothing is stored while it goes on (the design is as last let go of), then the design as dropped
  at = 'saving a drag';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: -20, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'B', x: 4, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 16 }] },
  ] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(400);
  await page.evaluate(() => { const w = window as unknown as { __saves: number }; w.__saves = 0; const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k: string, v: string) { if (k === 'btd-design') w.__saves++; return o.call(this, k, v); }; });
  const saves = () => page.evaluate(() => (window as unknown as { __saves: number }).__saves);
  const b0 = (await xy('B')).split(',').map(Number), [dx0, dy0] = await scr(b0[0] + 8, b0[1]);
  await page.mouse.move(dx0, dy0); await page.mouse.down(); await page.mouse.move(dx0 + 40, dy0 + 30, { steps: 6 }); await page.waitForTimeout(700);
  check(await saves() === 0 && await xy('B') === b0.join(','), `nothing is stored while a route is dragged (${await saves()} saves)`);
  await page.mouse.up();
  check(await saves() >= 1 && await xy('B') !== b0.join(','), `the design is stored when it is dropped (${await saves()} saves, ${await xy('B')})`);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  check(await xy('B') === b0.join(','), 'and the drag is one undo step');

  // resizing the window keeps the plan point at the middle of the plan where it was (the route's screen position moves by half the change)
  at = 'resize';
  const viewOf = () => page.evaluate(() => { const c = document.getElementById('track')!.getBoundingClientRect(); const v = (window as unknown as { btdCanvas: { view(): { scale: number; ox: number; oy: number } } }).btdCanvas.view(); return { ...v, w: c.width, h: c.height }; });
  const v0 = await viewOf();
  await page.setViewportSize({ width: 1400 - 240, height: 900 - 120 }); await page.waitForTimeout(400);
  const v1 = await viewOf();
  check(Math.abs((v1.w - v0.w)) > 100 && Math.abs(v1.ox - v0.ox - (v1.w - v0.w) / 2) < 1 && Math.abs(v1.oy - v0.oy - (v1.h - v0.h) / 2) < 1 && v1.scale === v0.scale,
    `a resize moves the route by half the change and keeps the zoom (${(v1.ox - v0.ox).toFixed(1)} of ${(v1.w - v0.w).toFixed(1)}, ${(v1.oy - v0.oy).toFixed(1)} of ${(v1.h - v0.h).toFixed(1)})`);
  await page.setViewportSize({ width: 1400, height: 900 }); await page.waitForTimeout(400);

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
  // undo survives a reload (the history is kept beside the design)
  at = 'undo after a reload';
  await page.waitForTimeout(1200);
  await page.reload(); await page.waitForSelector('#track');
  check(!(await page.isDisabled('#undo')), 'Undo is still there after a reload');
  await page.click('#undo'); await page.waitForTimeout(200);
  check(await routes() === 1 && (await tab()).length === 1, 'and steps back to the design before the last change');

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

  // guides while drawing: 8 studs beside a straight snaps, shows its label, and Alt turns it off
  at = 'guides';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 30 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#fit'); await page.waitForTimeout(300); await page.click('#mode-draw');
  const guide = () => page.locator('#track').evaluate((e) => (e as HTMLElement).dataset.guide ?? '');
  { const [gx, gy] = await scr(8.2, 5); await page.mouse.click(gx, gy); const [hx, hy] = await scr(8.3, 22.2); await page.mouse.move(hx, hy); await page.waitForTimeout(250);
    check(/8 studs from A/.test(await guide()), `drawing beside a straight snaps and says so (${await guide()})`);
    await page.keyboard.down('Alt'); await page.waitForTimeout(250);
    check(await guide() === '', 'Alt turns the guide off'); await page.keyboard.up('Alt');
    await page.mouse.click(hx, hy); await page.waitForTimeout(200);
    const rt = await page.evaluate(() => JSON.parse(localStorage.getItem('btd-design')!).routes[1]);
    check(rt.x === 8 && rt.segs[0].studs === 17, `the track laid is exactly 8 studs from A, 17 long (${JSON.stringify(rt)})`); }

  // split and merge: Split then a click on the route cuts it at a whole stud, Merge puts it back, each one undo step
  at = 'split and merge';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 24 }, { kind: 'curve', radius: 24, angle: 90 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(300);
  { const [px, py] = await scr(0, 10); await page.mouse.click(px, py);
    check(!(await page.isDisabled('#sel-split')) && await page.isDisabled('#sel-merge'), 'Split is there for one route, Merge not');
    await page.click('#sel-split'); const [qx, qy] = await scr(0.3, 11.2); await page.mouse.move(qx, qy); await page.waitForTimeout(150);
    check(/where to cut it/.test(await page.locator('#hint').innerText()), 'Split asks for a click on the route');
    await page.mouse.click(qx, qy); await page.waitForTimeout(300);
    const cut = await page.evaluate(() => JSON.parse(localStorage.getItem('btd-design')!).routes as { y: number; segs: unknown[] }[]);
    check(cut.length === 2 && Number.isInteger(cut[1].y) && Math.abs(cut[1].y - 11) <= 1 && cut[1].segs.length === 2, `it cut the route at a whole stud near 11 (${JSON.stringify(cut.map((r) => r.y))})`);
    check(!(await page.isDisabled('#sel-merge')), 'both halves are selected and Merge is on');
    await page.click('#sel-merge'); await page.waitForTimeout(300);
    check(await routes() === 1, 'Merge makes them one route again');
    await page.click('#undo'); await page.waitForTimeout(150);
    check(await routes() === 2, 'one Undo takes the merge back');
    await page.click('#undo'); await page.waitForTimeout(150);
    check(await routes() === 1, 'and one more the split'); }

  // parallel track: refuses a curve going under R24 with the reason, then makes one 16 studs over in one undo step
  at = 'parallel';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 20 }, { kind: 'curve', radius: 32, angle: 90 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(300);
  { const [px, py] = await scr(0, 10); await page.mouse.click(px, py); await page.click('#sel-parallel');
    check(/Range 6 to 200, default 16/.test(await page.locator('#par-range').innerText()), 'Parallel shows the spacing range and default');
    await page.selectOption('#par-side', 'left'); await page.fill('#par-spacing', '16'); await page.click('#par-make');
    check(/R24/.test(await page.locator('#par-why').innerText()) && await routes() === 1, `a curve that would go under the least radius is refused, with the reason (${await page.locator('#par-why').innerText()})`);
    await page.selectOption('#par-side', 'right'); await page.click('#par-make'); await page.waitForTimeout(300);
    const pr = await page.evaluate(() => JSON.parse(localStorage.getItem('btd-design')!).routes as { x: number; segs: { radius?: number }[] }[]);
    check(pr.length === 2 && pr[1].x === 16 && pr[1].segs[1].radius === 48, `Parallel makes the track 16 studs to the right with R48 (${JSON.stringify(pr[1])})`);
    await page.click('#undo'); await page.waitForTimeout(150);
    check(await routes() === 1, 'one Undo takes it back'); }

  // a locked route: selected and copied, but not dragged, nudged, mirrored or deleted ("R3 is locked"); unlocked on its card
  at = 'locks';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'R3', x: 0, y: 0, heading: 0, locked: true, segs: [{ kind: 'straight', studs: 20 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(300);
  { const route = () => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('btd-design')!).routes));
    const r0 = await route(), hintNow = () => page.locator('#hint').innerText();
    const [ax, ay] = await scr(0, 10), [bx, by] = await scr(10, 10);
    await page.mouse.click(ax, ay); await page.waitForTimeout(150);
    check(/R3 is locked/.test(await hintNow()), `selecting it says it is locked (${await hintNow()})`);
    await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 5 }); await page.waitForTimeout(100);
    check(/R3 is locked/.test(await hintNow()), 'dragging it says R3 is locked'); await page.mouse.up();
    await page.keyboard.press('ArrowRight'); await page.click('#sel-mirror'); await page.click('#sel-rotl'); await page.keyboard.press('Delete'); await page.click('#sel-del');
    const [ex, ey] = await scr(0, 0); await page.mouse.move(ex, ey); await page.mouse.down(); await page.mouse.move(ex + 40, ey + 40, { steps: 5 }); await page.mouse.up();
    check(await route() === r0, 'dragging, nudging, mirroring, turning, deleting and reshaping its end all leave it as it was');
    await page.click('#sel-dup'); await page.waitForTimeout(200);
    const dup = await page.evaluate(() => JSON.parse(localStorage.getItem('btd-design')!).routes as { locked?: boolean }[]);
    check(dup.length === 2 && dup[0].locked === true && dup[1].locked === undefined, 'a copy can be made, and is not locked');
    await page.click('#undo'); await page.waitForTimeout(150);
    await page.mouse.click(ax, ay); await page.waitForTimeout(150); await page.locator('.lockrow input').first().uncheck(); await page.waitForTimeout(150);
    check(!(await route()).includes('locked'), 'unticking Locked on its card unlocks it'); }

  // measure: T, two clicks on tracks 16 studs apart: the distance and the angle between them; Esc clears
  at = 'measure';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 20 }] }, { name: 'B', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 20 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#fit'); await page.waitForTimeout(300);
  { const meas = () => page.locator('#track').evaluate((e) => (e as HTMLElement).dataset.measure ?? '');
    await page.keyboard.press('t'); await page.waitForTimeout(100);
    const [ax, ay] = await scr(0, 7), [bx, by] = await scr(16, 7);
    await page.mouse.click(ax, ay); await page.mouse.click(bx, by); await page.waitForTimeout(250);
    check(/^16 studs \(128 mm\) · 0° between the tracks · 16 studs apart/.test(await meas()), `Measure says the distance and the angle (${await meas()})`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check(await meas() === '', 'Esc clears it'); await page.keyboard.press('t'); }

  // Add to design: a switch template follows the pointer, snaps onto the straight's end, one click puts it down, one undo takes it back
  at = 'add a template';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'R1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(300);
  { const placing = () => page.locator('#track').evaluate((e) => (e as HTMLElement).dataset.placing ?? 'none');
    await page.click('#templates-open'); await page.fill('#tpl-search', 'switch lego');
    await page.click('#tpl-body .tcard[data-template="Left switch (LEGO)"]'); await page.waitForTimeout(250);
    const [px, py] = await scr(0.3, 16.4); await page.mouse.move(px, py); await page.waitForTimeout(250);
    check(await placing() === 'snapped R1', `Add to design: the switch's toe snaps onto the straight's end (${await placing()})`);
    await page.mouse.click(px, py); await page.waitForTimeout(300);
    const added = await page.evaluate(() => JSON.parse(localStorage.getItem('btd-design')!).routes as { x: number; y: number }[]);
    check(added.length === 3 && added[1].x === 0 && added[1].y === 16, `it's put down with its toe on the end (${JSON.stringify(added.map((r) => [r.x, r.y]))})`);
    await page.click('#undo'); await page.waitForTimeout(150);
    check(await routes() === 1, 'one Undo takes it back');
    await page.click('#templates-open'); await page.fill('#tpl-search', 'switch lego'); await page.click('#tpl-body .tcard[data-template="Left switch (LEGO)"] .tadd'); await page.waitForTimeout(150);
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    check(await placing() === 'none' && await routes() === 1, 'Esc cancels placing'); }

  // My templates: the design saved as a template survives a reload, is listed, adds to a design, and is deleted (asking first)
  at = 'my templates';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'R1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select');
  { await page.click('#templates-open'); await page.click('#tpl-save'); await page.waitForTimeout(250);
    check(await page.locator('.tcard.mine').count() === 1, 'Save as template… puts the design in My templates');
    await page.reload(); await page.waitForSelector('#track'); await page.click('#templates-open'); await page.waitForTimeout(250);
    check(await page.locator('.tcard.mine').count() === 1, 'it is still listed after a reload');
    await page.locator('.tcard.mine').click(); await page.waitForTimeout(200); await page.click('#fit'); await page.waitForTimeout(300);
    const [px, py] = await scr(20, 8); await page.mouse.move(px, py); await page.waitForTimeout(150); await page.mouse.click(px, py); await page.waitForTimeout(300);
    check(await routes() === 2, 'Add to design puts it on the plan beside the design');
    await page.click('#templates-open'); await page.waitForTimeout(200);
    await page.locator('.tcard.mine .tmore').click({ force: true }); await page.locator('.tcard.mine .tdelete').click(); await page.waitForTimeout(150); await page.click('#ask-yes'); await page.waitForTimeout(250);
    check(await page.locator('.tcard.mine').count() === 0, 'Delete asks, then takes it out of the list'); await page.keyboard.press('Escape'); }

  // the plan by keyboard: [ and ] cycle the selected route, Tab moves to a handle and an arrow key changes it, Enter lays track on from the end
  at = 'plan by keyboard';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'B', x: 40, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 10 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(300);
  { const sel = () => page.evaluate(() => (window as unknown as { btdCanvas: { selection(): number[] } }).btdCanvas.selection().join());
    await page.focus('#track');
    check(/Track plan, 2 routes/.test(await page.locator('#track').getAttribute('aria-label') ?? ''), 'the plan has a label that says what is on it');
    await page.keyboard.press(']'); check(await sel() === '0', '] selects the first route');
    await page.keyboard.press(']'); check(await sel() === '1', '] again the next');
    await page.keyboard.press(']'); check(await sel() === '0', 'and round to the first');
    await page.keyboard.press('['); check(await sel() === '1', '[ goes back');
    await page.keyboard.press('['); await page.keyboard.press('Tab'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Shift+ArrowUp'); await page.waitForTimeout(200);
    const len = await page.evaluate(() => JSON.parse(localStorage.getItem('btd-design')!).routes[0].segs[0].studs);
    check(len === 25, `Tab to the length handle, Up then Shift+Up makes the straight 16 + 1 + 8 = 25 (${len})`);
    await page.evaluate(() => (document.activeElement as HTMLElement).blur()); await page.focus('#track'); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    const more = await page.evaluate(() => JSON.parse(localStorage.getItem('btd-design')!).routes[0].segs[0].studs);
    check(more === 30, `Enter lays track on from the end, the arrow key moving the crosshair a stud, Enter laying it (${more} studs)`);
    await page.keyboard.press('Escape'); }

  // the route card: Guard rails and Dual gauge are sections of their own with a switch each, options only when on; none on a monorail
  at = 'route card sections';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'M', x: 30, y: 0, heading: 0, system: 'monorail', segs: [{ kind: 'straight', studs: 8 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(300);
  { const heads = () => page.locator('details.rsub > summary').allInnerTexts();
    const [ax, ay] = await scr(0, 8); await page.mouse.click(ax, ay); await page.waitForTimeout(250);
    const h0 = (await heads()).join('|');
    check(/Guard rails\noff/.test(h0) && /Dual gauge\noff/.test(h0), `Guard rails and Dual gauge are separate sections, one line each when off (${h0.replace(/\n/g, ' ')})`);
    check(await page.locator('details.rsub:has(.rswitch) select, details.rsub:has(.rswitch) small').count() === 0, 'with guard rails off there are no options under it');
    await page.locator('.rswitch').nth(0).check(); await page.waitForTimeout(250);
    check(/Guard rail points/.test(await page.locator('#routes').innerText()) && /Dual gauge\noff/.test((await heads()).join('|')), 'turning guard rails on shows its options, the dual gauge section staying one line');
    check(await page.locator('.rswitch').nth(1).isDisabled(), 'with guard rails on, the Dual gauge switch is locked (with its reason beside it)');
    const [mx, my] = await scr(30, 4); await page.mouse.click(mx, my); await page.waitForTimeout(250);
    const hm = (await heads()).join('|');
    check(!/Guard rails|Dual gauge|Ends/.test(hm) && /Height/.test(hm), `a monorail route has neither guard rails nor dual gauge (${hm.replace(/\n/g, ' ')})`); }

  check(errors.length === 0, `no errors on the page${errors.length ? `: ${errors.join(' | ').slice(0, 600)}` : ''}`);
} catch (err) {
  fails.push(`${at}: ${err instanceof Error ? err.message : err}`);
} finally { await browser.close(); stopPreview(); clearTimeout(limit); }
if (fails.length) { console.error(`::error::browser smoke test failed: ${fails.join('; ').slice(0, 900)}`); process.exit(1); }
console.log('browser smoke test passed');
