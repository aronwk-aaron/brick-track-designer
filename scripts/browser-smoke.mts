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
  const page: Page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
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
  // (My templates kept by an older version in localStorage move into IndexedDB on the next open, and are listed)
  await page.evaluate(() => localStorage.setItem('btd-my-templates', JSON.stringify([{ v: 1, id: 'old1', name: 'Kept before', at: 1, design: { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }] }] } }])));
  await page.click('#tpl-close'); await page.reload(); await page.waitForTimeout(500); await page.click('#templates-open');
  check((await page.locator('#tpl-body .tcard[data-template="mine:old1"]').count()) === 1, 'a template kept in localStorage by an older version is listed after moving to IndexedDB');
  check((await page.evaluate(() => localStorage.getItem('btd-my-templates'))) === null, 'and it has left localStorage');
  await page.click('#tpl-close'); await page.reload(); await page.waitForTimeout(500); await page.click('#templates-open');
  check((await page.locator('#tpl-body .tcard[data-template="mine:old1"]').count()) === 1, 'it is still there after another reload (kept in IndexedDB)');
  // (a second tab sees a change the first makes, without a reload: renamed in tab 2, listed so in tab 1)
  {
    const p2 = await page.context().newPage(); await p2.goto(url); await p2.waitForSelector('#track'); await p2.waitForTimeout(500);
    await p2.evaluate(() => { const ch = new BroadcastChannel('btd-my-templates'); ch.postMessage({ k: 'btd-my-templates', v: JSON.stringify([{ v: 1, id: 'old1', name: 'Renamed in tab 2', at: 1, design: { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }] }] } }]) }); ch.close(); });
    await page.click('#tpl-close'); await page.click('#templates-open');
    check((await page.locator('#tpl-body .tcard[data-template="mine:old1"]').innerText()).includes('Renamed in tab 2'), 'a change in another tab is seen here without a reload');
    await p2.close();
  }
  // (and gone again, for the checks of My templates further on)
  await page.evaluate(() => new Promise<void>((ok) => { const r = indexedDB.open('btd'); r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').delete('btd-my-templates'); t.oncomplete = () => { r.result.close(); ok(); }; }; }));
  await page.click('#tpl-close'); await page.reload(); await page.waitForTimeout(500); await page.click('#templates-open');
  // (Clear recent under the Recent cards: empties that section)
  await page.evaluate(() => localStorage.setItem('btd-template-recent', JSON.stringify(['Left switch (LEGO)'])));
  await page.click('#tpl-close'); await page.click('#templates-open');
  check((await page.locator('#tpl-s-recent').count()) === 1, 'a recently used template shows under Recent');
  await page.click('#tpl-recent-clear');
  check((await page.locator('#tpl-s-recent').count()) === 0 && (await page.evaluate(() => localStorage.getItem('btd-template-recent'))) === '[]', 'Clear recent empties Recent');
  await page.fill('#tpl-search', 'switch lego');
  check((await page.locator('#tpl-body .tcard').count()) === 2, 'a search narrows them to the two cards (LEGO\'s switches, and the monorail points)');
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
  await page.click('#parts-menu-btn');
  check(await page.locator('#parts-menu').evaluate((m) => m.matches(':popover-open')), 'the Parts menu opens');
  await page.click('#parts-open');
  check(!(await page.locator('#parts-menu').evaluate((m) => m.matches(':popover-open'))), 'and shuts when an item is chosen');
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

  // a straight's length handle drags with the same guides: its end 8 studs beside another straight says so, and Alt turns it off
  at = 'guides on handles';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 30 }] }, { name: 'B', x: 8, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 10 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(300);
  { const [px, py] = await scr(8, 4); await page.mouse.click(px, py); await page.waitForTimeout(200);
    const lh = (await handles()).find((h) => h.kind === 'length');
    check(!!lh, 'a selected straight has its length handle');
    if (lh) {
      const tb = (await page.locator('#track').boundingBox())!, [tx, ty] = await scr(8, 18.3);
      await page.mouse.move(tb.x + lh.x, tb.y + lh.y); await page.mouse.down(); await page.mouse.move(tx, ty, { steps: 6 }); await page.waitForTimeout(250);
      check(/8 studs from A/.test(await guide()), `dragging a straight's length handle shows the guide (${await guide()})`);
      await page.keyboard.down('Alt'); await page.mouse.move(tx, ty + 1); await page.waitForTimeout(250);
      check(await guide() === '', 'Alt turns it off'); await page.keyboard.up('Alt');
      await page.mouse.up(); await page.waitForTimeout(200);
      const len = await page.evaluate(() => JSON.parse(localStorage.getItem('btd-design')!).routes[1].segs[0].studs);
      check(Number.isInteger(len) && len > 14, `and the straight ends up a whole number of studs, dragged longer (${len})`);
    } }

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

  // A part from the palette with nothing selected: an R40 curve follows the pointer, near the straight's open end it snaps on
  // (its end exactly on that end, heading on along it), Alt places it freely, a click puts it down and it stays selected
  at = 'add a part, snapping';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'R1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(300);
  { const placing = () => page.locator('#track').evaluate((e) => (e as HTMLElement).dataset.placing ?? 'none');
    await page.evaluate(() => { (window as unknown as { btdCanvas: { setSelection(r: number[]): void } }).btdCanvas.setSelection([]); (document.getElementById('palette') as HTMLDetailsElement).open = true; });
    await page.waitForTimeout(150);
    await page.locator('#palette-body button[title*="53400"][title$="Turning left"]').click(); await page.waitForTimeout(150);
    const [fx, fy] = await scr(30, 40); await page.mouse.move(fx, fy, { steps: 4 }); await page.waitForTimeout(200);
    check(await placing() === 'free', `a palette part follows the pointer, not snapped far from any end (${await placing()})`);
    const [px, py] = await scr(0.4, 16.3); await page.mouse.move(px, py, { steps: 8 }); await page.waitForTimeout(250);
    check(await placing() === 'snapped R1', `near the straight's end it snaps on (${await placing()})`);
    await page.keyboard.down('Alt'); await page.mouse.move(px + 1, py); await page.waitForTimeout(150);
    check(await placing() === 'free', 'holding Alt places it freely');
    await page.keyboard.up('Alt'); await page.mouse.move(px, py); await page.waitForTimeout(250);
    await page.mouse.click(px, py); await page.waitForTimeout(300);
    const rs = await page.evaluate(() => JSON.parse(localStorage.getItem('btd-design')!).routes as { x: number; y: number; heading: number; segs: { kind: string; radius?: number; angle?: number }[] }[]);
    const c = rs[1];
    check(rs.length === 2 && Math.abs(c.x) < 1e-6 && Math.abs(c.y - 16) < 1e-6 && Math.abs(c.heading) < 1e-6 && c.segs[0].radius === 40 && Math.abs(c.segs[0].angle!) === 22.5,
      `the curve starts exactly on the end, heading on along it (${JSON.stringify(c)})`);
    check(await page.evaluate(() => (window as unknown as { btdCanvas: { selection(): number[] } }).btdCanvas.selection().join()) === '1', 'and stays selected, for the next part to go on its end');
    await page.click('#undo'); await page.waitForTimeout(150);
    check(await routes() === 1, 'one Undo takes it back'); }

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

  // joined tracks (expert): a chain of three goes together when one is dragged; Alt moves the one alone; a joint taken apart
  at = 'joined tracks';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'B', x: 0, y: 16, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'C', x: 0, y: 32, heading: 0, segs: [{ kind: 'straight', studs: 8 }] }, { name: 'X', x: 24, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(300);
  { const all = async () => `${await xy('A')} ${await xy('B')} ${await xy('C')} ${await xy('X')}`, hintNow = () => page.locator('#hint').innerText();
    const apart = () => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('btd-design')!).expert?.apart ?? null));
    const data = (k: string) => page.evaluate((key) => document.getElementById('track')!.dataset[key] ?? '', k);
    const dragA = async (alt = false) => {
      const [x0, y0] = await scr(0, 8), [x1] = await scr(4, 8);
      if (alt) await page.keyboard.down('Alt');
      await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y0, { steps: 4 }); await page.waitForTimeout(80);
      const mid = { hint: await hintNow(), opened: await data('opened'), b: await xyLive('B') };
      await page.mouse.up(); if (alt) await page.keyboard.up('Alt');
      await page.waitForTimeout(200);
      return mid; };
    check((JSON.parse(await data('joints')) as { a: string; b: string }[]).map((j) => `${j.a}-${j.b}`).join() === 'A-B,B-C', `the plan marks the two joints of the chain (${await data('joints')})`);
    const m1 = await dragA();
    check(await all() === '4,0 4,16 4,32 24,0', `dragging one track of a chain takes the chain along, and nothing else (${await all()})`);
    check(/3 joined tracks/.test(m1.hint), `the hint says so while it moves (${m1.hint})`);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    check(await all() === '0,0 0,16 0,32 24,0', `one undo puts the whole chain back (${await all()})`);
    const m2 = await dragA(true);
    check(await all() === '4,0 0,16 0,32 24,0' && m2.b === '0,16', `Alt+drag moves the one track alone (${await all()})`);
    check(m2.opened === 'A-B' && /takes apart A and B/.test(m2.hint), `the joint it leaves is marked and said while it moves (${m2.opened}: ${m2.hint})`);
    check(/Took A apart from B/.test(await hintNow()), `and said when it's let go (${await hintNow()})`);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    check(await all() === '0,0 0,16 0,32 24,0' && (JSON.parse(await data('joints')) as unknown[]).length === 2, 'undo joins them again');
    // (a click on the joint selects it: Take apart; the two still touch, and A then moves alone)
    // (once the plan is of the tracks as they are again: a flangeway cut's end left over from the middle of a drag, when A's rails lay
    // across B's, would take the click)
    const nearJoint = () => page.evaluate(() => { const cv = (window as unknown as { btdCanvas: { overlay?: { items?: { kind: string; at: [number, number]; pts: [number, number][] }[] } } }).btdCanvas;
      return (cv.overlay?.items ?? []).filter((it) => [it.at, ...it.pts].some((q) => Math.hypot(q[0] / 8, q[1] / 8 - 16) < 2)).map((it) => it.kind).join(); });
    for (let k = 0; k < 150 && await nearJoint() !== ''; k++) await page.waitForTimeout(200);
    const [jx, jy] = await scr(0, 16);
    await page.mouse.click(jx, jy); await page.waitForTimeout(200);
    check(await page.locator('#sel-apart').isVisible() && !(await page.locator('#sel-join').isVisible()), `a click on a joint offers Take apart (selected: ${await page.locator('#sel-count').innerText()}; on the plan there: ${await nearJoint() || 'nothing else'}; ${await hintNow()})`);
    await page.click('#sel-apart'); await page.waitForTimeout(200);
    check(await apart() === '[["A","B"]]' && await page.locator('#sel-join').isVisible(), `Take apart is kept in the design, and Join is offered (${await apart()})`);
    await dragA();
    check(await all() === '4,0 0,16 0,32 24,0' && await apart() === 'null', `taken apart, the track moves alone; moved off, the two are just two tracks (${await all()}, ${await apart()})`);
    await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    check(await all() === '0,0 0,16 0,32 24,0' && await apart() === 'null', 'two undos: back together, joined');
    const [cx, cy] = await scr(0, 24);
    await page.mouse.dblclick(cx, cy); await page.waitForTimeout(200);
    check(await page.locator('#sel-count').innerText() === '3 selected', `a double click selects all that is joined (${await page.locator('#sel-count').innerText()})`);
    // (a straight made longer by its handle: what is on its end goes with it)
    await page.keyboard.press('Escape'); const [ax, ay] = await scr(0, 4); await page.mouse.click(ax, ay); await page.waitForTimeout(200);
    await page.focus('#track'); await page.keyboard.press('Tab'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200);
    check(await all() === '0,0 0,17 0,33 24,0', `a track made longer carries what is joined to its end (${await all()})`);
    await page.keyboard.press('Escape'); }

  // the Expert tools switch: off to start with, the cards have no cuts or own-settings sections and a click on a cut picks its track; a track that has cuts says so, with Show; remembered
  at = 'the Expert tools switch';
  await page.evaluate(() => { localStorage.removeItem('btd-expert'); localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, options: { splitTrack: 'lengths' }, routes: [
    { name: 'Main', x: 0, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 48 }], cuts: [12], own: { ballast: 'ballast' }, stretches: [{ from: 20, to: 32, own: { sleepers: 'bed' } }] },
    { name: 'Far', x: 0, y: 24, heading: -90, segs: [{ kind: 'straight', studs: 48 }] }] })); });
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(400);
  { const heads = async () => (await page.locator('details.route.selected details.rsub > summary').allInnerTexts()).map((t) => t.split('\n')[0]).join('|');
    const pressed = () => page.locator('#expert-toggle').getAttribute('aria-pressed'), bar = () => page.locator('#sel-count').innerText();
    const [tx, ty] = await scr(44, 0); await page.mouse.click(tx, ty); await page.waitForTimeout(250);
    check(await pressed() === 'false' && !/Cuts into parts|Bed and underside/.test(await heads()), `the expert tools are hidden to start with: a card has no Cuts or Bed sections (${await heads()})`);
    check(/Has 1 cut by hand, 1 setting of its own, 1 stretch\./.test(await page.locator('details.route.selected').innerText()), 'a track that has cuts, settings and stretches of its own says so on its card');
    const [fx, fy] = await scr(44, 24); await page.mouse.click(fx, fy); await page.waitForTimeout(250);
    check(await page.locator('details.route.selected .byhand').count() === 0, 'a track with none has no such line');
    const [cx, cy] = await scr(12, 0.5); await page.mouse.click(cx, cy); await page.waitForTimeout(250);
    check(await bar() === '1 selected' && await page.locator('#itemcard').isHidden(), `hidden, a click on a cut picks the track under it (${await bar()})`);
    check(await page.locator('#cutpaths').isHidden(), 'and the Cut paths panel is away (the design has none)');
    await page.locator('details.route.selected .byhand button').click(); await page.waitForTimeout(250);
    check(await pressed() === 'true' && /Bed and underside/.test(await heads()) && /Cuts into parts/.test(await heads()) && await page.locator('.byhand').count() === 0, `Show turns the expert tools on: the card has its sections (${await heads()})`);
    await page.mouse.click(cx, cy); await page.waitForTimeout(250);
    check(/^Cut across Main, 12 studs/.test(await bar()), `shown, the click picks the cut (${await bar()})`);
    await page.click('#expert-toggle'); await page.waitForTimeout(250);
    check(await pressed() === 'false' && await page.locator('#itemcard').isHidden() && await page.locator('#selbar').isHidden(), 'the button hides them again, and lets go of the cut');
    await page.click('#expert-toggle'); await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.waitForTimeout(300);
    check(await pressed() === 'true' && await page.locator('#cutpaths').isVisible(), 'shown or hidden is remembered in the browser'); }

  // the typed selection (expert): a click selects a cut across a track, a cut path or a stretch; the bar and its card say what it is; Delete, the arrow keys, Esc
  at = 'selecting a cut, a cut path, a stretch';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, options: { splitTrack: 'lengths' }, routes: [
    { name: 'Main', x: 0, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 48 }], cuts: [12], stretches: [{ from: 20, to: 32, own: { sleepers: 'bed' } }] },
    { name: 'Far', x: 0, y: 24, heading: -90, segs: [{ kind: 'straight', studs: 48 }] }], expert: { cutPaths: [{ id: 'c1', pts: [[40, 10], [40, -6]] }] } })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(400);
  { const bar = () => page.locator('#sel-count').innerText(), main = () => page.evaluate(() => JSON.parse(localStorage.getItem('btd-design')!).routes[0] as { cuts?: number[]; stretches?: { from: number; to: number }[] });
    const paths = () => page.evaluate(() => (JSON.parse(localStorage.getItem('btd-design')!).expert?.cutPaths ?? []) as { pts: [number, number][] }[]);
    const kinds = () => page.evaluate(() => (window as unknown as { btdCanvas: { items(): { kind: string }[] } }).btdCanvas.items().map((i) => i.kind).join());
    const [cx, cy] = await scr(12, 0.5); await page.mouse.click(cx, cy); await page.waitForTimeout(200);
    check(await bar() === 'Cut across Main, 12 studs from its start' && await kinds() === 'cut', `a click on a cut across a track selects the cut, and the bar says what it is (${await bar()}; ${await kinds()})`);
    check(await page.locator('#sel-item-del').isVisible() && !(await page.locator('#sel-copy').isVisible()), 'the bar has Delete for it, and none of the tracks\' buttons');
    check(await page.locator('#itemcard').isVisible() && await page.locator('#itemcard input').inputValue() === '12', 'its card is over the routes\' cards, with its number');
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
    check((await main()).cuts?.join() === '13' && /13 studs/.test(await bar()), `an arrow key moves it a stud along the track (${(await main()).cuts}; ${await bar()})`);
    await page.locator('#itemcard input').fill('30'); await page.locator('#itemcard input').press('Enter'); await page.waitForTimeout(300);
    check((await main()).cuts?.join() === '30' && /30 studs/.test(await bar()), `a number typed on its card moves it (${(await main()).cuts}; ${await bar()})`);
    await page.click('#sel-item-del'); await page.waitForTimeout(200);
    check((await main()).cuts === undefined && await page.locator('#selbar').isHidden() && await page.locator('#itemcard').isHidden(), 'Delete on the bar takes the cut out, and the bar and the card go');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    check((await main()).cuts?.join() === '30', 'one undo brings it back');
    const [px, py] = await scr(40, 7); await page.mouse.click(px, py); await page.waitForTimeout(200);
    check(await bar() === 'Cut path 1' && await kinds() === 'cutpath' && await page.locator('#itemcard input').count() === 4, `a click on a cut path selects it: its card has its corners (${await bar()})`);
    await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(150);
    check(JSON.stringify((await paths())[0]?.pts) === '[[48,10],[48,-6]]', `Shift and an arrow key moves the path eight studs (${JSON.stringify((await paths())[0]?.pts)})`);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    // (a stretch: of the selected track; its track stays selected under it)
    const [tx, ty] = await scr(44, 0); await page.mouse.click(tx, ty); await page.waitForTimeout(200);
    check(await bar() === '1 selected' && await page.locator('#sel-copy').isVisible() && await kinds() === 'route', `a click on a track selects the track as ever (${await bar()})`);
    const [sx2, sy2] = await scr(26, 0.5); await page.mouse.click(sx2, sy2); await page.waitForTimeout(250);
    check(await bar() === 'Stretch 1 of Main, 20 to 32 studs' && await kinds() === 'route,stretch', `a click on a selected track's stretch selects the stretch, its track with it (${await bar()}; ${await kinds()})`);
    check(await page.locator('#itemcard input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).join()) === '20,32', 'its card has where it starts and ends');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check(await bar() === '1 selected' && await kinds() === 'route', `Esc lets go of the stretch and keeps the track (${await bar()})`);
    await page.mouse.click(sx2, sy2); await page.waitForTimeout(200); await page.keyboard.press('Delete'); await page.waitForTimeout(200);
    check((await main()).stretches === undefined && await routes() === 2 && await bar() === '1 selected', 'Delete takes the stretch out, not its track');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    check((await main()).stretches?.length === 1, 'and one undo brings it back');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); }

  // stretches on the plan (expert): an end dragged along the track on whole studs, held at the track's end with why; the whole stretch dragged; Add a stretch… by a drag along the track
  at = 'stretches on the plan';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [
    { name: 'Main', x: 0, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 48 }], stretches: [{ from: 20, to: 32, own: { sleepers: 'bed' } }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(400);
  { const sts = () => page.evaluate(() => JSON.stringify((JSON.parse(localStorage.getItem('btd-design')!).routes[0].stretches ?? []).map((q: { from: number; to: number }) => [q.from, q.to])));
    const hintNow = () => page.locator('#hint').innerText(), cardTo = () => page.locator('#routes input[aria-label="Stretch 1 to"]').inputValue();
    const [tx, ty] = await scr(44, 0); await page.mouse.click(tx, ty); await page.waitForTimeout(200);
    const [bx2, by2] = await scr(26, 0.5); await page.mouse.click(bx2, by2); await page.waitForTimeout(250);
    const ends = JSON.parse(await page.locator('#track').getAttribute('data-stretch') ?? '{"ends":[]}').ends as [number, number][];
    check(ends.length === 2, 'the selected stretch has an end to drag each side');
    if (ends.length === 2) {
      const [ex2, ey2] = await scr(40.3, 1), [fx, fy] = await scr(60, 1);
      await page.mouse.move(tbx.x + ends[1][0], tbx.y + ends[1][1]); await page.mouse.down(); await page.mouse.move(ex2, ey2, { steps: 5 }); await page.waitForTimeout(150);
      check(await cardTo() === '40' && await sts() === '[[20,32]]', `a stretch's end dragged along the track goes to the whole stud, and the card follows; nothing is stored mid-drag (${await cardTo()})`);
      await page.mouse.move(fx, fy, { steps: 4 }); await page.waitForTimeout(150);
      check(/The track ends here \(48 studs long\)/.test(await hintNow()), `past the track's end it stops there and says why (${await hintNow()})`);
      await page.mouse.up(); await page.waitForTimeout(250);
      check(await sts() === '[[20,48]]', `let go, it is kept (${await sts()})`);
      await page.keyboard.press('Control+z'); await page.waitForTimeout(250);
      check(await sts() === '[[20,32]]', 'and the drag is one undo step'); }
    // (the whole stretch, by its band)
    await page.mouse.click(tx, ty); await page.waitForTimeout(200);
    await page.mouse.move(bx2, by2); await page.mouse.down(); await page.mouse.move(...(await scr(31, 0.5)), { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(250);
    check(await sts() === '[[25,37]]' && await page.locator('#sel-count').innerText() === 'Stretch 1 of Main, 25 to 37 studs', `the whole stretch dragged along keeps its length (${await sts()})`);
    // (Add a stretch…: a press on the track and a drag along it)
    await page.locator('#routes button', { hasText: 'Add a stretch…' }).click(); await page.waitForTimeout(150);
    await page.mouse.move(...(await scr(2, 0))); await page.mouse.down(); await page.mouse.move(...(await scr(9.6, 1)), { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(300);
    check(await sts() === '[[2,10],[25,37]]' && await page.locator('#sel-count').innerText() === 'Stretch 1 of Main, 2 to 10 studs', `Add a stretch… lays one where the track is dragged along, and selects it (${await sts()})`);
    await page.locator('#routes button', { hasText: 'Add a stretch…' }).click(); await page.waitForTimeout(150);
    await page.mouse.move(...(await scr(28, 0))); await page.mouse.down(); await page.mouse.move(...(await scr(34, 0)), { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(250);
    check(await sts() === '[[2,10],[25,37]]' && /Stretch 2 is here already/.test(await hintNow()), `not over a stretch that is there, and says so (${await hintNow()})`);
    await page.keyboard.press('Escape'); await page.keyboard.press('Control+z'); await page.waitForTimeout(250);
    check(await sts() === '[[25,37]]', 'one undo takes the new stretch away'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); }

  // a joint's own row in the Trackwork panel: the two tracks and where; a click selects the joint on the plan; Take apart and Join from the row
  at = 'joints in the Trackwork panel';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [
    { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'B', x: 0, y: 32, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'S', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(400);
  { const apart = () => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('btd-design')!).expert?.apart ?? null));
    await page.locator('#trackwork').evaluate((d: HTMLDetailsElement) => { d.open = true; });
    const grp = page.locator('#trackwork details.twg', { hasText: 'Joints between tracks' });
    await grp.waitFor({ timeout: 20_000 }).catch(() => undefined);
    await grp.evaluate((d: HTMLDetailsElement) => { d.open = true; }).catch(() => undefined);
    const rows = (await grp.locator('details.tw > summary').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    check(rows.length === 2 && rows.some((t) => /^(A and B|B and A) end to end · joined$/.test(t)) && rows.some((t) => /^S and A S off A's side · joined$/.test(t)), `the Trackwork panel lists each joint with its two tracks and where it is (${rows.join(' | ')})`);
    const row = grp.locator('details.tw', { hasText: 'S and A' });
    await row.locator('summary').click(); await page.waitForTimeout(300);
    check(await page.locator('#sel-count').innerText() === 'Joint between S and A' && await row.evaluate((d: HTMLDetailsElement) => d.open), `a click on a joint's row selects the joint on the plan and opens the row (${await page.locator('#sel-count').innerText()})`);
    check(/S's start on A's side, 8 studs along, at 0, 8/.test(await row.innerText()), 'the row says where the joint is');
    await row.getByRole('button', { name: 'Take apart' }).click(); await page.waitForTimeout(300);
    check(await apart() === '[["S","A"]]' && /taken apart/.test(await row.locator('summary').innerText()) && await page.locator('#sel-join').isVisible(), `Take apart in the row takes the two apart (${await apart()})`);
    await row.getByRole('button', { name: 'Join' }).click(); await page.waitForTimeout(300);
    check(await apart() === 'null' && /joined/.test(await row.locator('summary').innerText()), 'Join in the row joins them again');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
    check(await apart() === '[["S","A"]]', 'each is one undo step');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(300); }

  // the Pick list (expert, in the legend): what a click takes; one kind picked, a click takes only that (a branch's joint under its points; a cut and not its track)
  at = 'the Pick list';
  await page.evaluate(() => localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, options: { splitTrack: 'lengths' }, routes: [
    { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }], cuts: [20] }, { name: 'B', x: 0, y: 32, heading: 0, segs: [{ kind: 'straight', studs: 16 }] },
    { name: 'S', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }] }] })));
  await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.click('#fit'); await page.waitForTimeout(400);
  { const bar = () => page.locator('#sel-count').innerText(), hintNow = () => page.locator('#hint').innerText();
    const kinds = () => page.evaluate(() => (window as unknown as { btdCanvas: { items(): { kind: string }[] } }).btdCanvas.items().map((i) => i.kind).join());
    const points = () => page.evaluate(() => (window as unknown as { btdCanvas: { overlay?: { items?: { kind: string; off?: boolean; cand?: unknown }[] } } }).btdCanvas.overlay?.items?.filter((it) => it.kind === 'points' && !it.off && !it.cand).length ?? 0);
    for (let k = 0; k < 100 && await points() === 0; k++) await page.waitForTimeout(200);
    check(await page.locator('#pick-row').isVisible() && await page.locator('#pick').inputValue() === 'all' && await page.locator('#pick option').count() === 7, 'with the expert tools shown the legend has the Pick list, on Everything');
    const [jx, jy] = await scr(0, 8), [ax, ay] = await scr(0.5, 26), [cx, cy] = await scr(0.5, 20);
    await page.selectOption('#pick', 'joint'); await page.mouse.click(jx, jy); await page.waitForTimeout(250);
    check(await bar() === 'Joint between S and A' && await kinds() === 'joint' && await points() === 1, `picking joints, a click on a branch's joint selects it, under its points, which stay as they are (${await bar()}; ${await kinds()})`);
    await page.mouse.click(ax, ay); await page.waitForTimeout(200); await page.mouse.move(ax + 3, ay); await page.waitForTimeout(150);
    check(await kinds() === '' && /Picking only joints/.test(await hintNow()), `and a click on a track takes nothing, the hint saying why (${await hintNow()})`);
    await page.selectOption('#pick', 'cut'); await page.mouse.click(cx, cy); await page.waitForTimeout(200);
    check(/^Cut across A, 20 studs/.test(await bar()), `picking cuts, a click on a cut selects it (${await bar()})`);
    await page.selectOption('#pick', 'track'); await page.mouse.click(cx, cy); await page.waitForTimeout(200);
    check(await bar() === '1 selected' && await kinds() === 'route', `picking tracks, the same click takes the track (${await bar()})`);
    await page.selectOption('#pick', 'mark'); await page.reload(); await page.waitForSelector('#track'); await page.click('#mode-select'); await page.waitForTimeout(300);
    check(await page.locator('#pick').inputValue() === 'mark', 'the list is remembered in the browser');
    // (the expert tools hidden: the list goes, and a click takes a track again whatever it was left on)
    await page.click('#expert-toggle'); await page.waitForTimeout(200); await page.mouse.click(ax, ay); await page.waitForTimeout(200);
    check(await page.locator('#pick-row').isHidden() && await bar() === '1 selected', 'with the expert tools hidden the list is away and a click takes a track');
    await page.click('#expert-toggle'); await page.selectOption('#pick', 'all'); await page.keyboard.press('Escape'); }

  check(errors.length === 0, `no errors on the page${errors.length ? `: ${errors.join(' | ').slice(0, 600)}` : ''}`);
} catch (err) {
  fails.push(`${at}: ${err instanceof Error ? err.message : err}`);
} finally { await browser.close(); stopPreview(); clearTimeout(limit); }
if (fails.length) { console.error(`::error::browser smoke test failed: ${fails.join('; ').slice(0, 900)}`); process.exit(1); }
console.log('browser smoke test passed');
