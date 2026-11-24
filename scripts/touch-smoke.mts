// The app on a tablet's touch screen (CI's smoke job, after browser-smoke): the built site served by vite preview, at a
// landscape and a portrait tablet size with a touch screen (no mouse), everything done with fingers: a template opened from
// the browser, the plan panned, pinched, a track tapped, double-tapped, held, box-selected, dragged and undone; a part from
// the palette placed with the touch bar; a track drawn; the menus, the settings, a tip held for, the 3D view turned. The page
// itself never scrolls or zooms. Any error on the page fails it. SMOKE_MINUTES (default 6) stops it.
//   pnpm build && npx tsx scripts/touch-smoke.mts      (CHROME: the browser to use; PORT: preview's; SHOTS: a folder for screenshots)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium, type CDPSession, type Page } from 'playwright-core';

const root = new URL('../', import.meta.url).pathname, port = process.env.PORT ?? '4734', shots = process.env.SHOTS;
const chrome = process.env.CHROME ?? ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const preview = spawn('npx', ['vite', 'preview', '--port', port, '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
const stopPreview = () => { try { process.kill(-preview.pid!, 'SIGTERM'); } catch { /* (gone already) */ } };
let at = 'starting';
const limit = setTimeout(() => { console.error(`::error::the touch smoke test ran past its time and was stopped (at: ${at})`); stopPreview(); process.exit(124); }, Number(process.env.SMOKE_MINUTES ?? 6) * 60_000);
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
if (shots) mkdirSync(shots, { recursive: true });

/** Fingers on the screen, through the browser's own touch input (as a tablet sends them). */
class Fingers {
  constructor(private cdp: CDPSession) {}
  ev(type: 'touchStart' | 'touchMove' | 'touchEnd', pts: [number, number][]) { return this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })) }); }
  async tap([x, y]: [number, number]) { await this.ev('touchStart', [[x, y]]); await sleep(40); await this.ev('touchEnd', []); await sleep(120); }
  async hold([x, y]: [number, number], ms = 700) { await this.ev('touchStart', [[x, y]]); await sleep(ms); await this.ev('touchEnd', []); await sleep(150); }
  async drag(a: [number, number], b: [number, number], { steps = 10, holdFirst = 0 } = {}) {
    await this.ev('touchStart', [a]); if (holdFirst) await sleep(holdFirst);
    for (let k = 1; k <= steps; k++) { await this.ev('touchMove', [[a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]]); await sleep(16); }
    await this.ev('touchEnd', []); await sleep(150);
  }
  async two(a: [number, number], b: [number, number], a2: [number, number], b2: [number, number], steps = 10) {
    await this.ev('touchStart', [a, b]);
    for (let k = 1; k <= steps; k++) { const f = k / steps, l = (p: [number, number], q: [number, number]): [number, number] => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]; await this.ev('touchMove', [l(a, a2), l(b, b2)]); await sleep(16); }
    await this.ev('touchEnd', []); await sleep(150);
  }
}

const url = `http://localhost:${port}/`;
for (let k = 0; ; k++) { try { if ((await fetch(url)).ok) break; } catch { /* (not up yet) */ } if (k > 100) throw new Error('vite preview did not start'); await sleep(200); }
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
type C = { scale: number; ox: number; oy: number; active: unknown; isPlacing: boolean; selection(): number[]; toScreen(x: number, y: number): [number, number]; toWorld(x: number, y: number): [number, number];
  hitTest(w: [number, number]): { kind: string; route?: number } | undefined; nearTrack(w: [number, number], reach: number, skip?: number): unknown; itemAt(w: [number, number]): unknown; leverAt(w: [number, number]): unknown; handleAt(w: [number, number]): unknown; host: { design(): { routes: { x: number; y: number; segs: unknown[] }[] } } };

async function tablet(width: number, height: number, tag: string) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: false });
  const page: Page = await ctx.newPage(), f = new Fingers(await ctx.newCDPSession(page));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/GPU|WebGL|swiftshader/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => { void d.accept(); });
  const shot = async (n: string) => { if (shots) await page.screenshot({ path: `${shots}/${tag}-${n}.png` }); };
  const centre = async (sel: string): Promise<[number, number]> => { await page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {}); const b = await page.locator(sel).first().boundingBox(); if (!b) throw new Error(`${sel} isn't shown`); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const tapOn = async (sel: string) => { await f.tap(await centre(sel)); await sleep(150); };
  const view = () => page.evaluate(() => { const c = (window as unknown as { btdCanvas: C }).btdCanvas; return { s: c.scale, ox: c.ox, oy: c.oy }; });
  const sel = () => page.evaluate(() => (window as unknown as { btdCanvas: C }).btdCanvas.selection().join(','));
  const routes = () => page.evaluate(() => (window as unknown as { btdCanvas: C }).btdCanvas.host.design().routes.length);
  const state = () => page.evaluate(() => JSON.stringify((window as unknown as { btdCanvas: C }).btdCanvas.host.design().routes));
  // (a point of the plan on route k's track, away from its ends, points and levers; or k -1: empty ground, clear of the chips over the plan)
  const spot = (k: number) => page.evaluate((k) => {
    const c = (window as unknown as { btdCanvas: C }).btdCanvas, el = document.getElementById('track')!, r = el.getBoundingClientRect();
    const found: [number, number][] = [];
    for (let y = 40; y < r.height - 60; y += 9) for (let x = 30; x < r.width - 30; x += 9) {
      if (document.elementFromPoint(r.left + x, r.top + y) !== el) continue;
      const w = c.toWorld(x, y), hit = c.hitTest(w);
      if (k < 0 ? !hit && !c.nearTrack(w, 60 / c.scale) : hit?.kind === 'route' && hit.route === k && !c.nearTrack(w, 40 / c.scale, k) && !c.itemAt(w) && !c.leverAt(w) && !c.handleAt(w)) found.push([r.left + x, r.top + y]);
    }
    return found.length ? found[Math.floor(found.length / 2)] : undefined;
  }, k);
  const pageStill = async (what: string) => {
    const s = await page.evaluate(() => ({ x: scrollX, y: scrollY, z: visualViewport?.scale ?? 1, w: document.documentElement.scrollWidth - innerWidth, b: document.body.scrollTop }));
    check(!s.x && !s.y && s.z === 1 && s.w <= 0 && !s.b, `[${tag}] the page didn't scroll or zoom (${what}: ${JSON.stringify(s)})`);
  };

  at = `${tag}: loading`;
  await page.goto(url); await page.waitForSelector('#track'); await sleep(600);
  check(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), `[${tag}] the page sees a touch screen (pointer: coarse)`);

  at = `${tag}: a template`;
  await tapOn('#templates-open');
  check(await page.locator('#tpl-dlg').evaluate((d: HTMLDialogElement) => d.open), `[${tag}] a tap opens the template browser`);
  check(await page.locator('#tpl-body .tcard .tact').first().evaluate((e) => getComputedStyle(e).opacity === '1'), `[${tag}] a template card's actions show without a hover`);
  await page.fill('#tpl-search', 'switch lego'); await sleep(200);
  await shot('templates');
  await tapOn('#tpl-body .tcard[data-template="Left switch (LEGO)"] .tpick');
  await page.waitForFunction(() => (window as unknown as { btdCanvas: C }).btdCanvas.host.design().routes.length === 2, null, { timeout: 15_000 }).catch(() => {});
  check(await routes() === 2, `[${tag}] a tap on a card opens it (${await routes()} routes)`);
  // (an empty plan went straight to Draw: back to Select)
  await tapOn('#mode-select'); await tapOn('#fit'); await sleep(300);

  at = `${tag}: the plan's view`;
  const empty = await spot(-1);
  check(!!empty, `[${tag}] there's empty ground on the plan`);
  if (empty) {
    const v0 = await view(); await f.drag(empty, [empty[0] + 60, empty[1] + 30]);
    const v1 = await view(); check(v1.ox !== v0.ox, `[${tag}] a finger dragged on empty ground pans`);
    await tapOn('#fit'); await sleep(200);
  }
  {
    const b = (await page.locator('#track').boundingBox())!, c: [number, number] = [b.x + b.width / 2, b.y + b.height / 2];
    let v0 = await view(); await f.two([c[0] - 50, c[1]], [c[0] + 50, c[1]], [c[0] - 110, c[1]], [c[0] + 110, c[1]]);
    let v1 = await view(); check(v1.s > v0.s * 1.5, `[${tag}] two fingers pinch to zoom (${v0.s.toFixed(1)} to ${v1.s.toFixed(1)})`);
    v0 = v1; await f.two([c[0] - 50, c[1]], [c[0] + 50, c[1]], [c[0] + 30, c[1] + 40], [c[0] + 130, c[1] + 40]);
    v1 = await view(); check(v1.ox - v0.ox > 50, `[${tag}] two fingers pan`);
    await tapOn('#fit'); await sleep(300);
  }
  await pageStill('panned and pinched');

  at = `${tag}: selecting`;
  const on0 = await spot(0), on1 = await spot(1);
  check(!!on0 && !!on1, `[${tag}] both tracks are found on the plan`);
  if (on0 && on1) {
    await f.tap(on0); check(await sel() === '0', `[${tag}] a tap selects a track (${await sel()})`);
    await shot('selected');
    await sleep(500); await f.tap(on1); await sleep(60); await f.tap(on1);
    check(await sel() === '0,1' || await sel() === '1,0', `[${tag}] a double tap selects what is joined to it (${await sel()})`);
    // (the selection bar is up now, over part of the plan: the spot looked for again, clear of it)
    const h1 = (await spot(1)) ?? on1;
    const why = async () => page.evaluate(([x, y]) => { const c = (window as unknown as { btdCanvas: Record<string, unknown> & C }).btdCanvas, r = document.getElementById('track')!.getBoundingClientRect(), w = c.toWorld(x - r.left, y - r.top);
      return JSON.stringify({ hit: c.hitTest(w), el: document.elementFromPoint(x, y)?.id, drag: !!c.drag, hd: !!c.handleDrag, item: !!c.itemDrag, lever: !!c.leverDrag, table: !!c.tableDrag, moving: !!c.moving, mode: c.mode, at: [x, y] }); }, h1);
    await f.ev('touchStart', [h1]); await sleep(900); const mid = await why(); await f.ev('touchEnd', []); await sleep(150);
    check(await sel() === '0', `[${tag}] a finger held on a selected track takes it out (${await sel()}; ${mid})`);
    await f.hold(h1, 900); check((await sel()).split(',').sort().join() === '0,1', `[${tag}] held again, it's put back in (${await sel()})`);
    if (empty) {
      await f.tap(empty); check(await sel() === '', `[${tag}] a tap on empty ground selects nothing`);
      const b = (await page.locator('#track').boundingBox())!;
      const far: [number, number] = [empty[0] < b.x + b.width / 2 ? b.x + b.width - 30 : b.x + 30, empty[1] < b.y + b.height / 2 ? b.y + b.height - 70 : b.y + 45];
      await f.drag(empty, far, { holdFirst: 650, steps: 14 });
      check((await sel()).split(',').filter(Boolean).length >= 1, `[${tag}] held on empty ground then dragged, a box selects (${await sel()})`);
    }
    // (dragged, and Undo tapped)
    await f.tap(on0); const before = await state();
    await f.drag(on0, [on0[0] + 70, on0[1] + 40], { steps: 12 }); await sleep(300);
    check(await state() !== before, `[${tag}] a selected track is dragged by a finger`);
    await tapOn('#undo'); await sleep(300);
    check(await state() === before, `[${tag}] Undo, tapped, puts it back`);
    await tapOn('#redo'); await sleep(300);
    check(await state() !== before, `[${tag}] and Redo does it again`);
    await tapOn('#undo'); await sleep(300);
  }
  await pageStill('selecting and dragging');

  at = `${tag}: a part from the palette`;
  if (empty) await f.tap(empty);
  await page.locator('#palette > summary').scrollIntoViewIfNeeded(); await tapOn('#palette > summary');
  const straight = page.locator('#palette-body button', { hasText: /^Straight$/ }).first();
  await straight.scrollIntoViewIfNeeded(); await f.tap(await centre('#palette-body button >> text=/^Straight$/'));
  const placing = () => page.evaluate(() => (window as unknown as { btdCanvas: C }).btdCanvas.isPlacing);
  check(await placing(), `[${tag}] a palette part tapped is being placed`);
  check(await page.locator('#touchbar').isVisible(), `[${tag}] the touch bar shows while placing`);
  const bar = async () => (await page.locator('#touchbar button').allTextContents()).join(' ');
  check(/⟲.*⟳.*Mirror.*←.*↑.*↓.*→.*Snap.*Put down.*Cancel/.test(await bar()), `[${tag}] with turn, mirror, nudge, snap, put down and cancel (${await bar()})`);
  await shot('placing');
  await tapOn('#touchbar button[data-act="r"]'); await tapOn('#touchbar button[data-act="m"]'); await tapOn('#touchbar button[data-act="ArrowUp"]');
  if (on0) await f.drag(on0, [on0[0] - 40, on0[1] + 60]);
  check(await placing(), `[${tag}] a finger drags the part about without putting it down`);
  await tapOn('#touchbar button[data-act="Escape"]');
  check(!(await placing()) && await routes() === 2, `[${tag}] Cancel stops placing, nothing added`);
  await f.tap(await centre('#palette-body button >> text=/^Straight$/'));
  await tapOn('#touchbar button[data-act="Enter"]');
  check(!(await placing()) && await routes() === 3, `[${tag}] Put down adds it (${await routes()} routes)`);
  check(await page.locator('#touchbar').isHidden() || !(await bar()).includes('Put down'), `[${tag}] and the placing bar goes`);

  at = `${tag}: drawing`;
  await tapOn('#mode-draw');
  const e2 = await spot(-1);
  if (e2) {
    const n = await routes();
    await f.tap(e2);
    await f.drag([e2[0], e2[1] - 10], [e2[0], e2[1] - 120], { steps: 8 });
    check(await routes() === n + 1, `[${tag}] Draw: a tap starts a track, a drag and lift lays it (${await routes()} routes)`);
    check(/Stop/.test(await bar()), `[${tag}] the touch bar has Stop while drawing (${await bar()})`);
    await shot('drawing');
    await f.hold(e2, 800);
    check(!(await page.evaluate(() => !!(window as unknown as { btdCanvas: C }).btdCanvas.active)) && await routes() === n + 1, `[${tag}] a finger held still stops drawing, nothing laid`);
  }
  await tapOn('#mode-select');

  at = `${tag}: menus`;
  for (const m of ['file', 'parts', 'help']) {
    await tapOn(`#${m}-menu-btn`);
    const open = () => page.evaluate((id) => document.getElementById(id)!.matches(':popover-open'), `${m}-menu`);
    check(await open(), `[${tag}] the ${m} menu opens on a tap`);
    if (m === 'file') await shot('filemenu');
    const small = await page.evaluate((id) => [...document.querySelectorAll<HTMLElement>(`#${id} > button, #${id} > a`)].filter((e) => e.getBoundingClientRect().height < 40).length, `${m}-menu`);
    check(small === 0, `[${tag}] its items are finger-sized`);
    const b = (await page.locator('#track').boundingBox())!; await f.tap(e2 ?? [b.x + b.width / 2, b.y + b.height / 2]); await sleep(150);
    check(!(await open()), `[${tag}] and closes on a tap on the plan`);
  }

  at = `${tag}: a tip`;
  await f.hold(await centre('#fit'), 800);
  check(await page.locator('#touchtip').isVisible() && /Fit the track/.test(await page.locator('#touchtip').innerText()), `[${tag}] a finger held on a button shows its tip`);
  await shot('tip');
  await f.tap(e2 ?? [10, 10]); await sleep(100);
  check(await page.locator('#touchtip').isHidden(), `[${tag}] and the next tap hides it`);

  at = `${tag}: settings`;
  await tapOn('#settings-open'); await sleep(300);
  check(await page.locator('#settings').isVisible(), `[${tag}] Settings opens on a tap`);
  const sec = page.locator('#options details.osec > summary').nth(1);
  const wasOpen = await sec.evaluate((s) => (s.parentElement as HTMLDetailsElement).open);
  await sec.scrollIntoViewIfNeeded(); await f.tap(await (async () => { const b = (await sec.boundingBox())!; return [b.x + 20, b.y + b.height / 2] as [number, number]; })());
  check(await sec.evaluate((s) => (s.parentElement as HTMLDetailsElement).open) !== wasOpen, `[${tag}] a tap opens or folds a settings group`);
  await shot('settings');
  await tapOn('#settings-close');

  at = `${tag}: the 3D view`;
  await page.waitForFunction(() => document.getElementById('buildstatus')!.hidden, null, { timeout: 90_000 }).catch(() => {});
  const v3 = await page.locator('#view3d canvas').first().boundingBox();
  if (v3) {
    const c: [number, number] = [v3.x + v3.width / 2, v3.y + v3.height / 2];
    const pic = () => page.locator('#view3d canvas').first().screenshot().then((b) => b.toString('base64'));
    const p0 = await pic(); await f.drag(c, [c[0] + 80, c[1] + 30]); await sleep(300);
    check(await pic() !== p0, `[${tag}] a finger turns the 3D view`);
    const p1 = await pic(); await f.two([c[0] - 40, c[1]], [c[0] + 40, c[1]], [c[0] - 100, c[1]], [c[0] + 100, c[1]]); await sleep(300);
    check(await pic() !== p1, `[${tag}] two fingers zoom the 3D view`);
    const ex = (await page.locator('#explode').boundingBox())!;
    check(ex.height >= 30, `[${tag}] the explode slider is finger-sized (${Math.round(ex.width)}x${Math.round(ex.height)})`);
    await shot('3d');
  }
  // (the cuts worked out where tracks join: drawn on the plan, and a finger on one says what it is)
  if (tag === 'landscape') {
    at = `${tag}: a cut where tracks join`;
    await tapOn('#templates-open'); await page.fill('#tpl-search', 'compact base standard'); await sleep(200);
    const kit = '#tpl-body .tcard[data-template="Switch R40 left, compact base and standard section"] .tpick';
    await page.locator(kit).first().scrollIntoViewIfNeeded(); await tapOn(kit);
    // (the design has changes in no file: it asks first, and the answer is tapped)
    await page.waitForSelector('#ask-dlg[open]', { timeout: 5_000 }).catch(() => undefined);
    if (await page.locator('#ask-dlg').evaluate((d: HTMLDialogElement) => d.open)) await tapOn('#ask-yes');
    const isKit = () => page.evaluate(() => (window as unknown as { btdCanvas: { host: { design(): { routes: { name?: string }[] } } } }).btdCanvas.host.design().routes.map((r) => r.name).join());
    await page.waitForFunction(() => (window as unknown as { btdCanvas: { host: { design(): { routes: { name?: string }[] } } } }).btdCanvas.host.design().routes.some((r) => r.name === 'Section branch'), null, { timeout: 15_000 }).catch(() => {});
    check(/Section branch/.test(await isKit()), `[${tag}] the compact kit opens (${await isKit()})`);
    await page.waitForFunction(() => !!document.getElementById('track')!.dataset.jointcuts && document.getElementById('buildstatus')!.hidden, null, { timeout: 60_000 }).catch(() => {});
    await tapOn('#mode-select'); await tapOn('#fit'); await sleep(400);
    const jc = await page.evaluate(() => { const el = document.getElementById('track')!, r = el.getBoundingClientRect(); return (JSON.parse(el.dataset.jointcuts ?? '[]') as { x: number; y: number; made: boolean }[]).map((q) => ({ ...q, x: q.x + r.left, y: q.y + r.top })); });
    check(jc.length === 1 && jc[0].made, `[${tag}] the kit's cut where its tracks join is drawn on the plan (${JSON.stringify(jc)})`);
    check(await page.locator('#legend-jointcuts').evaluate((e: HTMLElement) => !e.hidden), `[${tag}] and the legend has it`);
    if (jc.length) {
      await f.tap([jc[0].x, jc[0].y]);
      const said = await page.locator('#hint').innerText();
      check(/Cut where two tracks join here/.test(said), `[${tag}] a tap on it says what it is (${said.slice(0, 80)})`);
      await shot('jointcut');
    }
    // (its points thrown by a finger: a tap on them in the 3D view, there and back; the touch bar's Throw with their track tapped)
    at = `${tag}: throwing a switch by touch`;
    type TW = { btdThrow: { sets(): { key: string; places: number; at: number; moving: boolean; setFor?: string; routes: string[] }[]; tapAt(key: string): [number, number] | undefined; part(name: string): number[] | undefined } };
    const sets = () => page.evaluate(() => (window as unknown as TW).btdThrow.sets()), settled = async () => { await page.waitForFunction(() => (window as unknown as TW).btdThrow.sets().every((q) => !q.moving), null, { timeout: 5_000 }).catch(() => {}); await sleep(150); };
    // (a selected item's card is a sheet over the foot of the 3D view: Done puts it away first)
    if (await page.locator('#itemcard').isVisible()) { await tapOn('#itemcard .idone'); await sleep(200); }
    const s0 = await sets();
    check(s0.length >= 1 && s0[0].at === 0, `[${tag}] the kit's points can be thrown (${JSON.stringify(s0)})`);
    if (s0.length) {
      const xy = (await page.evaluate((k) => (window as unknown as TW).btdThrow.tapAt(k), s0[0].key))!;
      await f.tap(xy); await settled();
      check((await sets())[0].at === 1, `[${tag}] a tap on the points in the 3D view throws them (${JSON.stringify(await sets())})`);
      await f.tap([xy[0] + 12, xy[1] + 8]); await settled();
      check((await sets())[0].at === 0, `[${tag}] a tap a finger's width off them throws them back`);
      await f.drag(xy, [xy[0] + 70, xy[1] + 25]); await sleep(300);
      check((await sets())[0].at === 0, `[${tag}] a finger dragged over them turns the view and throws nothing`);
      await shot('thrown');
    }
  }
  // (the expert tools by touch: the legend's By hand only pressed by a finger; a rail gap tapped, dragged
  // along its track by a finger, taken out with the bar's Delete)
  if (tag === 'landscape') {
    at = `${tag}: the expert tools by touch`;
    await page.evaluate(() => { localStorage.setItem('btd-expert', '1'); localStorage.setItem('btd-pick', 'rail'); localStorage.removeItem('btd-dim-plain');
      localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [
        { name: 'Main', x: 0, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 48 }], railEdits: { gaps: [{ at: 16, side: 'both' }] } },
        { name: 'Far', x: 0, y: 24, heading: -90, segs: [{ kind: 'straight', studs: 48 }] }] })); });
    await page.reload(); await page.waitForSelector('#track'); await tapOn('#mode-select'); await tapOn('#fit'); await sleep(400);
    const scr = (wx: number, wy: number) => page.evaluate(([x, y]) => { const c = (window as unknown as { btdCanvas: { view(): { scale: number; ox: number; oy: number } } }).btdCanvas, v = c.view(), r = document.getElementById('track')!.getBoundingClientRect(); return [r.left + v.ox + x * v.scale, r.top + v.oy - y * v.scale] as [number, number]; }, [wx, wy]);
    const gaps = () => page.evaluate(() => JSON.stringify((window as unknown as { btdCanvas: { host: { design(): { routes: { railEdits?: { gaps?: unknown[] } }[] } } } }).btdCanvas.host.design().routes[0].railEdits?.gaps ?? []));
    const dim = (await page.locator('#dim-plain').boundingBox())!;
    check(dim.height >= 36 && dim.width >= 36, `[${tag}] the legend's By hand only button is finger-sized (${Math.round(dim.width)}x${Math.round(dim.height)})`);
    await tapOn('#dim-plain'); await sleep(200);
    check(await page.locator('#track').getAttribute('data-dimmed') === '1', `[${tag}] a tap presses it: the track with nothing by hand is faint (${await page.locator('#track').getAttribute('data-dimmed')})`);
    await tapOn('#dim-plain'); await sleep(200);
    check(await page.locator('#track').getAttribute('data-dimmed') === null, `[${tag}] and a tap lets it go`);
    const g = await scr(16, 0.3);
    await f.tap(g); await sleep(250);
    check(/^Gap in both rails, 16 studs/.test(await page.locator('#sel-count').innerText()), `[${tag}] a tap on a rail gap selects it (${await page.locator('#sel-count').innerText()})`);
    await f.drag(g, await scr(22.1, 0.3), { steps: 8 }); await sleep(250);
    check(await gaps() === '[{"at":22,"side":"both"}]', `[${tag}] a finger drags it along its track (${await gaps()})`);
    const del = (await page.locator('#sel-item-del').boundingBox())!;
    check(del.height >= 36, `[${tag}] the bar's Delete is finger-sized (${Math.round(del.width)}x${Math.round(del.height)})`);
    const barBox = (await page.locator('#selbar').boundingBox())!;
    check(del.x + del.width <= barBox.x + barBox.width + 1, `[${tag}] and in sight on the bar, not scrolled off its end (${Math.round(del.x + del.width)} of ${Math.round(barBox.x + barBox.width)})`);
    await tapOn('#sel-item-del'); await sleep(250);
    check(await gaps() === '[]', `[${tag}] and Delete on the bar takes it out (${await gaps()})`);
    await shot('expert');
    // (several cuts at once by touch: a finger held on empty ground, then dragged, boxes them; a finger held on a cut adds it;
    // one dragged takes them all; the bar's Delete takes them out)
    at = `${tag}: several cuts at once by touch`;
    await page.evaluate(() => { localStorage.setItem('btd-pick', 'cut');
      localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, options: { splitTrack: 'lengths' }, routes: [
        { name: 'A', x: 0, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 48 }], cuts: [12, 24, 40] },
        { name: 'B', x: 0, y: 24, heading: -90, segs: [{ kind: 'straight', studs: 48 }], cuts: [12] }] })); });
    await page.reload(); await page.waitForSelector('#track'); await tapOn('#mode-select'); await tapOn('#fit'); await sleep(400);
    const cuts = () => page.evaluate(() => JSON.stringify((window as unknown as { btdCanvas: { host: { design(): { routes: { cuts?: number[] }[] } } } }).btdCanvas.host.design().routes.map((r) => r.cuts ?? [])));
    const bar = () => page.locator('#sel-count').innerText();
    // (the two tracks run to the right, B above A; the box from the empty ground between them down over A's cuts at 12 and 24)
    await f.drag(await scr(8, 12), await scr(28, -3), { steps: 10, holdFirst: 600 }); await sleep(250);
    check(await bar() === '2 cuts selected', `[${tag}] a finger held on empty ground, then dragged, boxes the cuts (${await bar()})`);
    await f.hold(await scr(40, 0.4)); await sleep(250);
    check(await bar() === '3 cuts selected', `[${tag}] a finger held on another cut adds it (${await bar()})`);
    await f.hold(await scr(40, 0.4)); await sleep(250);
    check(await bar() === '2 cuts selected', `[${tag}] and held on it again takes it out (${await bar()})`);
    await f.drag(await scr(12, 0.4), await scr(15.2, 0.4), { steps: 8 }); await sleep(250);
    check(await cuts() === '[[15,27,40],[12]]' && await bar() === '2 cuts selected', `[${tag}] a finger drags them all along their track (${await cuts()}; ${await bar()})`);
    const del2 = (await page.locator('#itemcard button.danger').boundingBox()), sdel = (await page.locator('#sel-item-del').boundingBox())!;
    check(sdel.height >= 36 && (!del2 || del2.height >= 36), `[${tag}] Delete is finger-sized on the bar and the card (${Math.round(sdel.height)}, ${del2 ? Math.round(del2.height) : 'card not shown'})`);
    await tapOn('#sel-item-del'); await sleep(250);
    check(await cuts() === '[[40],[12]]', `[${tag}] and Delete on the bar takes them all out (${await cuts()})`);
    // (Cut into print parts: No, set by touch in Settings: the cuts stay in the design, and are drawn grey with a note by the first)
    await tapOn('#settings-open'); await sleep(300);
    const cpField = page.locator('#options label.field', { has: page.locator('span', { hasText: /^Cut into print parts/ }) });
    await cpField.evaluate((e) => { for (let d = e.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true; e.scrollIntoView({ block: 'center' }); }); await sleep(200);
    const cpSel = cpField.locator('select'), cpBox = (await cpSel.boundingBox())!;
    check(cpBox.height >= 36, `[${tag}] Cut into print parts is finger-sized (${Math.round(cpBox.height)})`);
    await cpSel.selectOption('no'); await sleep(300);
    await tapOn('#settings-close');
    await page.waitForFunction(() => document.getElementById('track')!.dataset.uncut === '1', null, { timeout: 20_000 }).catch(() => {});
    check(await page.evaluate(() => document.getElementById('track')!.dataset.uncut) === '1' && await cuts() === '[[40],[12]]', `[${tag}] Cut into print parts: No greys the cuts on the plan and keeps them in the design (${await cuts()})`);
    await shot('uncut');
    // (a finger's reach on a marker: 22 px while the Pick list is on its own layer; with Everything a tap that near a cut
    // still takes the track under it. The touch bar moves a selected cut and takes it out)
    at = `${tag}: a finger's reach on markers`;
    await page.evaluate(() => { localStorage.setItem('btd-pick', 'cut');
      localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, options: { splitTrack: 'lengths' }, routes: [
        { name: 'A', x: 0, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 48 }], cuts: [24] }] })); });
    await page.reload(); await page.waitForSelector('#track'); await tapOn('#mode-select'); await tapOn('#fit'); await sleep(400);
    const pxStud = await page.evaluate(() => (window as unknown as { btdCanvas: { view(): { scale: number } } }).btdCanvas.view().scale);
    const beside = await scr(24 + 17 / pxStud, 0);
    await f.tap(beside); await sleep(250);
    check(/^Cut across/.test(await bar()), `[${tag}] Cuts picked: a tap 17 px from a cut takes the cut (${await bar()})`);
    const right = page.locator('#sel-item-right'), rb = await right.boundingBox();
    check(!!rb && rb.height >= 44 && rb.width >= 44, `[${tag}] the bar's arrow is 44 px (${rb ? `${Math.round(rb.width)}x${Math.round(rb.height)}` : 'not shown'})`);
    await tapOn('#sel-item-right'); await sleep(150); const moved = await cuts(); await tapOn('#sel-item-left'); await sleep(150);
    check(moved !== '[[24]]' && await cuts() === '[[24]]', `[${tag}] the bar's arrows move it a stud and back (${moved}, ${await cuts()})`);
    // (the inspector: a sheet at the foot, its number with − and +, Done)
    const sheet = (await page.locator('#itemcard').boundingBox())!, plan = (await page.locator('#plan').boundingBox())!;
    check(sheet.y > plan.y + plan.height - 20, `[${tag}] the inspector is a sheet below the plan, not over it (${Math.round(sheet.y)} vs the plan's foot ${Math.round(plan.y + plan.height)})`);
    const plus = page.locator('#itemcard .stepper button').nth(1), pb = (await plus.boundingBox())!;
    check(pb.height >= 44 && pb.width >= 44, `[${tag}] the inspector's + is 44 px (${Math.round(pb.width)}x${Math.round(pb.height)})`);
    await tapOn('#itemcard .stepper button >> nth=1'); await sleep(200); const stepped = await cuts();
    await tapOn('#itemcard .stepper button >> nth=0'); await sleep(200);
    check(stepped === '[[25]]' && await cuts() === '[[24]]', `[${tag}] its + and − move the cut a stud and back (${stepped}, ${await cuts()})`);
    check(/^Made by hand/.test(await page.locator('#itemcard .istatus').innerText()), `[${tag}] the inspector says it's made by hand`);
    await tapOn('#sel-item-done'); await sleep(200);
    check(!/^Cut across/.test(await bar()), `[${tag}] Done lets go of it (${await bar()})`);
    const chip = (await page.locator('#layers button[data-pick="all"]').boundingBox())!;
    check(chip.height >= 44, `[${tag}] the layer chips are 44 px (${Math.round(chip.height)})`);
    await tapOn('#layers button[data-pick="all"]'); await sleep(200);
    check(await page.evaluate(() => (window as unknown as { btdCanvas: { pick: string } }).btdCanvas.pick) === 'all', `[${tag}] a tap on the Everything chip picks everything`);
    await f.tap(beside); await sleep(250);
    check(/^A selected|^1 selected/.test(await bar()) || await sel() === '0', `[${tag}] Everything: a tap 17 px from a cut takes the track (${await bar()}; ${await sel()})`);
    await page.evaluate(() => localStorage.setItem('btd-pick', 'cut'));
    // (the app's trackwork by touch: points tapped open their card under the plan, Take out takes them out, Undo puts them
    // back; a check rail tapped anywhere along it is selected)
    at = `${tag}: trackwork by touch`;
    await page.evaluate(() => { localStorage.setItem('btd-pick', 'mark');
      localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [
        { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'S', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }] }] })); });
    await page.reload(); await page.waitForSelector('#track'); await tapOn('#mode-select'); await tapOn('#fit'); await sleep(400);
    type Ov = { overlay?: { items?: { kind: string; key: string; at: [number, number]; pts: [number, number][]; off?: boolean; cand?: unknown }[] }; pointsState(k: string): { state: string }; toScreen(x: number, y: number): [number, number] };
    const twAt = (kind: string) => page.evaluate((kind) => {
      const c = (window as unknown as { btdCanvas: Ov }).btdCanvas, r = document.getElementById('track')!.getBoundingClientRect();
      const it = c.overlay?.items?.find((i) => i.kind === kind && !i.off && !i.cand); if (!it) return undefined;
      const p = kind === 'check' ? it.pts[Math.floor(it.pts.length / 2)] : it.at, [x, y] = c.toScreen(p[0] / 8, p[1] / 8);
      return { key: it.key, xy: [r.left + x, r.top + y] as [number, number] };
    }, kind);
    let toe = await twAt('points');
    for (let k = 0; k < 100 && !toe; k++) { await sleep(200); toe = await twAt('points'); }
    check(!!toe, `[${tag}] the points are on the plan`);
    if (toe) {
      const state = () => page.evaluate((k) => (window as unknown as { btdCanvas: Ov }).btdCanvas.pointsState(k).state, toe!.key);
      await f.tap(toe.xy); await sleep(300);
      const card = page.locator('#itemcard');
      check(await card.isVisible() && /^Points/.test(await card.locator(':scope > b').innerText()) && /Worked out by the app/.test(await card.locator('.istatus').innerText()), `[${tag}] a tap on points opens their card under the plan, said to be the app's (${await card.isVisible() ? await card.innerText() : 'no card'})`);
      check(await state() === 'built', `[${tag}] and leaves them built (a tap no longer takes them out)`);
      await tapOn('#itemcard button.danger'); for (let k = 0; k < 30 && await state() !== 'off'; k++) await sleep(100);
      check(await state() === 'off', `[${tag}] the card's Take out takes them out (${await state()})`);
      await tapOn('#undo'); for (let k = 0; k < 30 && await state() !== 'built'; k++) await sleep(100);
      check(await state() === 'built', `[${tag}] and Undo puts them back (${await state()})`);
      await shot('points-card');
    }
    // (a crossover with its check rails, frogs and levers: each tapped along it or on it opens its card; a check rail is
    // taken out by the card and Undo puts it back; a frog made open, a lever moved out, each undone; a frog or a lever
    // can't be taken out, and Delete says why)
    at = `${tag}: check rails, frogs and levers by touch`;
    await tapOn('#templates-open'); await page.fill('#tpl-search', 'Crossover with points of their own'); await sleep(300);
    await tapOn('#tpl-body .tcard[data-template="Crossover with points of their own"] .tpick');
    await page.waitForSelector('#ask-dlg[open]', { timeout: 3_000 }).catch(() => undefined);
    if (await page.locator('#ask-dlg').evaluate((d: HTMLDialogElement) => d.open)) await tapOn('#ask-yes');
    await tapOn('#mode-select'); await tapOn('#fit'); await sleep(300);
    await tapOn('#layers button[data-pick="mark"]'); await sleep(200);
    const twFull = (kind: string) => page.evaluate((kind) => {
      const c = (window as unknown as { btdCanvas: Ov }).btdCanvas, r = document.getElementById('track')!.getBoundingClientRect();
      const it = c.overlay?.items?.find((i) => i.kind === kind && !i.off && !i.cand && (kind === 'throw' || i.pts.length > 1)); if (!it) return undefined;
      const p = kind === 'throw' ? it.at : it.pts.length > 2 ? it.pts[Math.floor(it.pts.length / 2)] : [(it.pts[0][0] + it.pts[1][0]) / 2, (it.pts[0][1] + it.pts[1][1]) / 2], [x, y] = c.toScreen(p[0] / 8, p[1] / 8);
      return { key: it.key, xy: [r.left + x, r.top + y] as [number, number] };
    }, kind);
    let ck = await twFull('check');
    for (let k = 0; k < 150 && !ck; k++) { await sleep(200); ck = await twFull('check'); }
    const tw = (kind: string, key: string) => page.evaluate(([kind, key]) => JSON.stringify(((window as unknown as { btdCanvas: { host: { design(): { trackwork?: Record<string, Record<string, unknown>> } } } }).btdCanvas.host.design().trackwork?.[kind] ?? {})[key] ?? {}), [kind, key]);
    const cardTitle = () => page.locator('#itemcard > b').innerText().catch(() => '');
    check(!!ck, `[${tag}] the crossover's check rails are on the plan`);
    if (ck) {
      await f.tap(ck.xy); await sleep(300);
      check(/^Check rail/.test(await cardTitle()), `[${tag}] a tap along a check rail opens its card (${await cardTitle()})`);
      await shot('check-card');
      await tapOn('#itemcard button.danger'); await sleep(300);
      check(/"off":true/.test(await tw('check', ck.key)), `[${tag}] its card's Take out takes it out (${await tw('check', ck.key)})`);
      await tapOn('#undo'); await sleep(300);
      check(await tw('check', ck.key) === '{}', `[${tag}] and Undo puts it back (${await tw('check', ck.key)})`);
      await tapOn('#itemcard .idone').catch(() => {}); await sleep(200);
    }
    const fr = await twFull('groove');
    check(!!fr, `[${tag}] the crossover's frogs are on the plan`);
    if (fr) {
      await f.tap(fr.xy); await sleep(300);
      check(/^Frog/.test(await cardTitle()), `[${tag}] a tap along a frog's flangeway cut opens its card (${await cardTitle()})`);
      check(await page.locator('#sel-item-del').isHidden(), `[${tag}] a frog has no Delete: it is where two rails cross`);
      const open = page.locator('#itemcard label', { hasText: 'Open frog' }).locator('input');
      if (await open.count()) { await open.scrollIntoViewIfNeeded(); await sleep(150); const bx = (await open.boundingBox())!; await f.tap([bx.x + bx.width / 2, bx.y + bx.height / 2]); await sleep(300); }
      check(/"open":true/.test(await tw('groove', fr.key)), `[${tag}] its card makes it an open frog (${await tw('groove', fr.key)})`);
      await tapOn('#undo'); await sleep(300);
      check(await tw('groove', fr.key) === '{}', `[${tag}] and Undo makes it as it was (${await tw('groove', fr.key)})`);
      await tapOn('#itemcard .idone').catch(() => {}); await sleep(200);
    }
    const lv = await twFull('throw');
    check(!!lv, `[${tag}] the crossover's levers are on the plan`);
    if (lv) {
      const was = await tw('throw', lv.key);
      await f.tap(lv.xy); await sleep(300);
      check(/^Lever/.test(await cardTitle()), `[${tag}] a tap on a lever opens its card (${await cardTitle()})`);
      const out = page.locator('#itemcard label', { hasText: 'Out past the track' }).locator('.stepper button').nth(1);
      if (await out.count()) { await out.scrollIntoViewIfNeeded(); await sleep(150); const ob = (await out.boundingBox())!; await f.tap([ob.x + ob.width / 2, ob.y + ob.height / 2]); await sleep(300); }
      check(/leverOffset/.test(await tw('throw', lv.key)) && await tw('throw', lv.key) !== was, `[${tag}] its card's + moves the lever out (${await tw('throw', lv.key)})`);
      await shot('lever-card');
      await tapOn('#undo'); await sleep(300);
      check(await tw('throw', lv.key) === was, `[${tag}] and Undo puts it back (${await tw('throw', lv.key)})`);
      await tapOn('#itemcard .idone').catch(() => {}); await sleep(200);
    }
    // (stage 3: one running rail at a time by touch: the Rails chip, a tap on the left rail selects it alone; its round
    // end dragged in shortens it; its card cuts a stretch out of it and deletes a piece; Undo; Reset the left rail)
    at = `${tag}: one rail at a time by touch`;
    await page.evaluate(() => { localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'Main', x: 0, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 32 }] }] })); });
    await page.reload(); await page.waitForSelector('#track'); await tapOn('#mode-select'); await tapOn('#fit'); await sleep(300);
    await tapOn('#layers button[data-pick="rail"]'); await sleep(200);
    const outs = () => page.evaluate(() => JSON.stringify((window as unknown as { btdCanvas: { host: { design(): { routes: { railEdits?: { out?: unknown[] } }[] } } } }).btdCanvas.host.design().routes[0].railEdits?.out ?? []));
    // (the track runs to the right, x studs along; its left rail 2.5 studs up from its centre line)
    await f.tap(await scr(16, 2.5)); await sleep(300);
    check(/^The left rail of Main, 0 to 32 studs/.test(await page.locator('#sel-count').innerText()), `[${tag}] a tap on the left rail selects it alone (${await page.locator('#sel-count').innerText()})`);
    check(/Laid by the app/.test(await page.locator('#itemcard .istatus').innerText()), `[${tag}] its card says the app laid it`);
    const run = JSON.parse(await page.locator('#track').getAttribute('data-run') ?? '{"ends":[]}') as { ends: [number, number][] };
    if (run.ends.length === 2) {
      const tb = (await page.locator('#track').boundingBox())!, e0: [number, number] = [tb.x + run.ends[0][0], tb.y + run.ends[0][1]];
      await f.drag(e0, await scr(4.2, 2.5), { steps: 10 }); await sleep(300);
    }
    check(await outs() === '[{"side":"left","from":0,"to":4}]', `[${tag}] its round end dragged in shortens it 4 studs (${await outs()})`);
    check(/Edited by hand/.test(await page.locator('#itemcard .istatus').innerText()), `[${tag}] and its card says it's edited by hand`);
    await tapOn('#itemcard button:has-text("Cut 2 studs out")'); await sleep(300);
    check(await outs() === '[{"side":"left","from":0,"to":4},{"side":"left","from":17,"to":19}]', `[${tag}] its card cuts 2 studs out of the middle (${await outs()})`);
    await tapOn('#itemcard button.danger'); await sleep(300);
    check(await outs() === '[{"side":"left","from":0,"to":19}]', `[${tag}] Delete takes that piece out (${await outs()})`);
    await tapOn('#undo'); await sleep(300);
    check(await outs() === '[{"side":"left","from":0,"to":4},{"side":"left","from":17,"to":19}]', `[${tag}] Undo puts it back (${await outs()})`);
    await f.tap(await scr(10, 2.5)); await sleep(300);
    await tapOn('#itemcard button:has-text("Reset the left rail")'); await sleep(300);
    check(await outs() === '[]', `[${tag}] Reset the left rail: as the app lays it (${await outs()})`);
    check(/^The right rail/.test(await (async () => { await f.tap(await scr(16, -2.5)); await sleep(300); return page.locator('#sel-count').innerText(); })()), `[${tag}] a tap on the right rail selects that one`);
    await shot('one-rail');
    await tapOn('#itemcard .idone').catch(() => {});
    // (stage 4: rails and sleepers laid by hand, by touch: + Rail, a finger drawn from where it starts to where it ends;
    // dragged along; + Sleeper, a tap; Delete on its card; Undo)
    at = `${tag}: rails and sleepers laid by hand by touch`;
    await page.evaluate(() => { localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'Main', x: 0, y: 0, heading: -90, segs: [{ kind: 'straight', studs: 24 }] }] })); });
    await page.reload(); await page.waitForSelector('#track'); await tapOn('#mode-select'); await tapOn('#fit'); await sleep(300);
    const free = () => page.evaluate(() => JSON.stringify((window as unknown as { btdCanvas: { host: { design(): { expert?: { free?: unknown[] } } } } }).btdCanvas.host.design().expert?.free ?? []));
    await tapOn('#layers button[data-add="rail"]'); await sleep(200);
    await f.drag(await scr(4, -6), await scr(16, -6), { steps: 10 }); await sleep(300);
    check(await free() === '[{"id":"f1","kind":"rail","a":[4,-6],"b":[16,-6]}]', `[${tag}] + Rail, a finger drawn from end to end, lays a rail (${await free()})`);
    check(/^Rail laid by hand/.test(await page.locator('#itemcard > b').innerText().catch(() => '')) && /Made by hand/.test(await page.locator('#itemcard .istatus').innerText()), `[${tag}] and its card opens`);
    await f.drag(await scr(10, -6), await scr(10, -8.1), { steps: 8 }); await sleep(300);
    check(await free() === '[{"id":"f1","kind":"rail","a":[4,-8],"b":[16,-8]}]', `[${tag}] dragged, it moves by whole studs (${await free()})`);
    // (a rail where the selection bar sits once it's selected: pressed through the bar beside its buttons, and dragged)
    type CW = { btdCanvas: { toWorld(x: number, y: number): [number, number]; toScreen(x: number, y: number): [number, number]; draw(): void; host: { design(): { expert?: { free?: unknown[] } }; changed(r: boolean): void } } };
    const yu = await (async () => { const bar0 = (await page.locator('#selbar').boundingBox())!; const tb = (await page.locator('#track').boundingBox())!; return page.evaluate(([y, top]) => Math.round((window as unknown as CW).btdCanvas.toWorld(40, y - top)[1]), [bar0.y + bar0.height / 2, tb.y] as [number, number]); })();
    await page.evaluate((y) => { const c = (window as unknown as CW).btdCanvas, d = c.host.design(); (d.expert ??= {}).free = [...(d.expert.free ?? []), { id: 'f9', kind: 'rail', a: [-8, y], b: [30, y] }]; c.host.changed(true); c.draw(); }, yu);
    await sleep(300);
    // (a point of it on the plan that the bar's box is over, but not one of its buttons)
    const through = () => page.evaluate((yy) => {
      const c = (window as unknown as CW).btdCanvas, el = document.getElementById('track')!, r = el.getBoundingClientRect(), bar = document.getElementById('selbar')!, bb = bar.getBoundingClientRect();
      for (let k = 0; k <= 76; k++) { const x = 11 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.25, [sx, sy] = c.toScreen(x, yy), px = r.left + sx, py = r.top + sy; if (px > bb.left && px < bb.right && py > bb.top && py < bb.bottom && document.elementFromPoint(px, py) === el) return [px, py] as [number, number]; }
      return undefined;
    }, yu);
    let pt = await through();
    check(!!pt, `[${tag}] a rail lies where the selection bar sits (y ${yu} studs)`);
    if (pt) {
      await f.tap(pt); await sleep(300);
      check(/^Rail laid by hand/.test(await page.locator('#sel-count').innerText()), `[${tag}] a tap on it through the bar, beside its buttons, selects it (${await page.locator('#sel-count').innerText()})`);
      pt = (await through()) ?? pt;
      const rail9 = () => page.evaluate(() => JSON.stringify(((window as unknown as CW).btdCanvas.host.design().expert?.free ?? []).find((q) => (q as { id: string }).id === 'f9')));
      const before = await rail9();
      await f.drag(pt, [pt[0], pt[1] + 50], { steps: 8 }); await sleep(300);
      check(await rail9() !== before, `[${tag}] and dragged from there (${await rail9()})`);
    }
    await tapOn('#layers button[data-add="sleeper"]'); await sleep(200);
    await f.tap(await scr(22, -5)); await sleep(300);
    check(/"kind":"sleeper","at":\[22,-5\]/.test(await free()), `[${tag}] + Sleeper, a tap, lays a sleeper (${await free()})`);
    await tapOn('#itemcard button.danger'); await sleep(300);
    check(!/sleeper/.test(await free()), `[${tag}] Delete on its card takes it away (${await free()})`);
    await tapOn('#undo'); await sleep(300);
    check(/sleeper/.test(await free()), `[${tag}] and Undo brings it back`);
    await shot('laid-by-hand');
    await tapOn('#itemcard .idone').catch(() => {});
    // (stage 5: one blade of the points by touch: the Points chip, a tap along a blade selects it alone; + on its card makes
    // it longer; its round heel end dragged on makes it longer still; Reset this blade; the other blade's as it was)
    at = `${tag}: one blade at a time by touch`;
    await page.evaluate(() => { localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }] }, { name: 'S', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }] }] })); });
    await page.reload(); await page.waitForSelector('#track'); await tapOn('#mode-select'); await tapOn('#fit'); await sleep(300);
    await tapOn('#layers button[data-pick="mark"]'); await sleep(200);
    type BW = { btdCanvas: { overlay?: { items?: { kind: string; key: string; blades?: [number, number][][] }[] }; toScreen(x: number, y: number): [number, number]; host: { design(): { trackwork?: { points?: Record<string, { bladeHeel?: number[] }> } } } } };
    const heels = () => page.evaluate(() => JSON.stringify(Object.values((window as unknown as BW).btdCanvas.host.design().trackwork?.points ?? {}).map((e) => e.bladeHeel ?? null)));
    let mid: [number, number] | undefined;
    for (let k = 0; k < 100 && !mid; k++) {
      mid = await page.evaluate(() => { const c = (window as unknown as BW).btdCanvas, r = document.getElementById('track')!.getBoundingClientRect(), l = c.overlay?.items?.find((q) => q.kind === 'points')?.blades?.[0]; if (!l) return undefined; const q = l[Math.floor(l.length * 0.8)], [x, y] = c.toScreen(q[0] / 8, q[1] / 8); return [r.left + x, r.top + y] as [number, number]; });
      if (!mid) await sleep(200);
    }
    check(!!mid, `[${tag}] the points' blades are on the plan`);
    if (mid) {
      await f.tap(mid); await sleep(300);
      check(await page.locator('#sel-item-del').isHidden(), `[${tag}] a blade has no Delete on the bar (its points do)`);
      check(/^Blade a of the points/.test(await page.locator('#itemcard > b').innerText().catch(() => '')), `[${tag}] a tap along a blade selects it alone (${await page.locator('#itemcard > b').innerText().catch(() => 'no card')})`);
      await tapOn('#itemcard .stepper button >> nth=1'); await sleep(300);
      check(await heels() === '[[2,0]]', `[${tag}] + on its card makes it a quarter stud longer (${await heels()})`);
      const bl = JSON.parse(await page.locator('#track').getAttribute('data-blade') ?? '{}') as { heel?: [number, number] };
      // (on along the blade, the way it runs at its heel, 30 px)
      const way = await page.evaluate(() => { const c = (window as unknown as BW).btdCanvas, l = c.overlay?.items?.find((q) => q.kind === 'points')?.blades?.[0]; if (!l) return [0, -1]; const a2 = c.toScreen(l[l.length - 2][0] / 8, l[l.length - 2][1] / 8), b2 = c.toScreen(l[l.length - 1][0] / 8, l[l.length - 1][1] / 8), n = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) || 1; return [(b2[0] - a2[0]) / n, (b2[1] - a2[1]) / n]; });
      if (bl.heel) { const tb = (await page.locator('#track').boundingBox())!, h: [number, number] = [tb.x + bl.heel[0], tb.y + bl.heel[1]]; await f.drag(h, [h[0] + way[0] * 30, h[1] + way[1] * 30], { steps: 8 }); await sleep(300); }
      const after = JSON.parse(await heels()) as (number[] | null)[];
      check(!!after[0] && after[0][0] > 2 && after[0][1] === 0, `[${tag}] its round heel end dragged on makes it longer, the other blade as it was (${JSON.stringify(after)})`);
      await shot('one-blade');
      await tapOn('#itemcard button:has-text("Reset this blade")'); await sleep(300);
      check(await heels() === '[]' || await heels() === '[null]', `[${tag}] Reset this blade: as worked out (${await heels()})`);
      await tapOn('#itemcard .idone').catch(() => {});
    }
    // (stage 6: end connectors and labels by touch: the Connectors chip, a tap on a joined end sets its kind (both tracks'
    // ends there); the app's joint dragged along (the track's joints made its own, D6), deleted, + Joint; then a flat
    // underside: the Labels chip, the app's label dragged (one placed by hand now), + Label)
    at = `${tag}: connectors and labels by touch`;
    await page.evaluate(() => { localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print', pieceLengthStuds: 16 }, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'B', x: 0, y: 32, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }] })); });
    await page.reload(); await page.waitForSelector('#track'); await tapOn('#mode-select'); await tapOn('#fit'); await sleep(300);
    await tapOn('#layers button[data-pick="conn"]'); await sleep(200);
    type SW = { btdCanvas: { host: { design(): { routes: { cuts?: number[]; cutsLocked?: boolean; startEnd?: string; endEnd?: string }[]; expert?: { labels?: unknown[] } } } } };
    const routesNow = () => page.evaluate(() => JSON.stringify((window as unknown as SW).btdCanvas.host.design().routes.map((r) => [r.cuts ?? null, r.cutsLocked ?? null, r.startEnd ?? null, r.endEnd ?? null])));
    const spot = async (attr: string, id: string) => {
      for (let k = 0; k < 150; k++) {
        const v = JSON.parse(await page.locator('#track').getAttribute(attr) ?? '[]') as [number, number, string][], q = v.find((e) => e[2] === id);
        if (q) { const tb = (await page.locator('#track').boundingBox())!; return [tb.x + q[0], tb.y + q[1]] as [number, number]; }
        await sleep(200);
      }
      return undefined;
    };
    const joinedEnd = await spot('data-conns', '0:end');
    check(!!joinedEnd, `[${tag}] the connectors are on the plan (${await page.locator('#track').getAttribute('data-conns')})`);
    if (joinedEnd) {
      await f.tap(joinedEnd); await sleep(300);
      check(/^End of A/.test(await page.locator('#itemcard > b').innerText().catch(() => '')), `[${tag}] a tap on a joined end selects it (${await page.locator('#itemcard > b').innerText().catch(() => 'no card')})`);
      check(await page.locator('#sel-item-del').isHidden() || await page.locator('#sel-item-del').isDisabled(), `[${tag}] a track's end has nothing to delete on the bar`);
      await page.locator('#itemcard select').selectOption('nopeg'); await sleep(300);
      check(/^\[\[null,null,null,"nopeg"\],\[null,null,"nopeg",null\]\]$/.test(await routesNow()), `[${tag}] rail tongues only: set on both tracks' ends there (${await routesNow()})`);
      await shot('connector-end');
    }
    const app = await spot('data-conns', '0@16a');
    check(!!app, `[${tag}] the app's joint is on the plan, dashed`);
    if (app) {
      await f.tap(app); await sleep(300);
      check(/^Joint 16 studs along A/.test(await page.locator('#itemcard > b').innerText().catch(() => '')) && /Worked out by the app/.test(await page.locator('#itemcard .istatus').innerText().catch(() => '')), `[${tag}] a tap selects the app's joint, the app's (${await page.locator('#itemcard > b').innerText().catch(() => 'no card')})`);
      const sc = await page.evaluate(() => { const c = (window as unknown as { btdCanvas: { view(): { scale: number } } }).btdCanvas; return c.view().scale; });
      await f.drag(app, [app[0], app[1] - sc * 3], { steps: 10 }); await sleep(300);
      check(/^\[\[\[19\],true,/.test(await routesNow()), `[${tag}] dragged 3 studs along: a hand cut there, the track's joints its own (${await routesNow()})`);
      await shot('connector-joint');
      await tapOn('#itemcard button.danger'); await sleep(300);
      check(/^\[\[null,true,/.test(await routesNow()), `[${tag}] Delete on its card takes it out, the 32 studs one part on the bed (${await routesNow()})`);
      await tapOn('#layers button[data-add="conn"]'); await sleep(200);
      await f.tap(await scr(0, 10)); await sleep(300);
      check(/^\[\[\[10\],true,/.test(await routesNow()), `[${tag}] + Joint, a tap on the track, adds one there (${await routesNow()})`);
      await tapOn('#itemcard .idone').catch(() => {});
    }
    await page.evaluate(() => { localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print', pieceLengthStuds: 16, ballast: 'buddy', bottomStyle: 'float', labelText: 'YARD' }, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }] })); });
    await page.reload(); await page.waitForSelector('#track'); await tapOn('#mode-select'); await tapOn('#fit'); await sleep(300);
    await tapOn('#layers button[data-pick="label"]'); await sleep(200);
    const labelsNow = () => page.evaluate(() => JSON.stringify((window as unknown as SW).btdCanvas.host.design().expert?.labels ?? []));
    let lab: [number, number] | undefined;
    for (let k = 0; k < 300 && !lab; k++) {
      const v = JSON.parse(await page.locator('#track').getAttribute('data-labels') ?? '[]') as [number, number, string][], q = v.find((e) => e[2].startsWith('app:'));
      if (q) { const tb = (await page.locator('#track').boundingBox())!; lab = [tb.x + q[0], tb.y + q[1]]; } else await sleep(200);
    }
    check(!!lab, `[${tag}] the app's labels are on the plan, once built`);
    if (lab) {
      await f.tap(lab); await sleep(300);
      check(/^Label under /.test(await page.locator('#itemcard > b').innerText().catch(() => '')), `[${tag}] a tap on one selects it (${await page.locator('#itemcard > b').innerText().catch(() => 'no card')})`);
      await f.drag(lab, [lab[0] + 1, lab[1] - 40], { steps: 10 }); await sleep(300);
      check(/^\[\{"id":"l1","at":\[/.test(await labelsNow()), `[${tag}] dragged, it's one placed by hand (${await labelsNow()})`);
      await shot('label');
      await tapOn('#itemcard .idone').catch(() => {});
      await tapOn('#layers button[data-add="label"]'); await sleep(200);
      await f.tap(await scr(0, 24)); await sleep(300);
      check(/"id":"l2"/.test(await labelsNow()), `[${tag}] + Label, a tap on the track, adds one there (${await labelsNow()})`);
      await tapOn('#itemcard .idone').catch(() => {});
    }
    // (stage 7: ballast edges and stud-off areas by touch: the Ballast chip, a tap on the right edge, dragged out 2 studs
    // (the track's own, D6), + on its card, over a stretch only, Reset; the Studs chip, + Studs off, a tap adds one,
    // a corner dragged out on whole studs, Delete; a switch's own area can't be deleted, its card adds one round it)
    at = `${tag}: ballast edges and stud-off areas by touch`;
    await page.evaluate(() => { localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print', pieceLengthStuds: 16, ballast: 'ballast' }, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }] })); });
    await page.reload(); await page.waitForSelector('#track'); await tapOn('#mode-select'); await tapOn('#fit'); await sleep(300);
    await tapOn('#layers button[data-pick="ballast"]'); await sleep(200);
    type S7 = { btdCanvas: { view(): { scale: number }; toScreen(x: number, y: number): [number, number]; host: { design(): { routes: { own?: Record<string, unknown>; stretches?: { from: number; to: number; own: Record<string, unknown> }[] }[]; expert?: { studsOff?: { id: string; x0: number; y0: number; x1: number; y1: number }[] } } } } };
    const edgesNow = () => page.evaluate(() => { const r = (window as unknown as S7).btdCanvas.host.design().routes[0]; return JSON.stringify([r.own ?? null, r.stretches ?? null]); });
    const edgeR = await spot('data-edges', '0:right');
    check(!!edgeR, `[${tag}] the ballast edges are on the plan (${await page.locator('#track').getAttribute('data-edges')})`);
    if (edgeR) {
      await f.tap(edgeR); await sleep(300);
      check(/^Right ballast edge of A/.test(await page.locator('#itemcard > b').innerText().catch(() => '')) && /As the track has it/.test(await page.locator('#itemcard .istatus').innerText().catch(() => '')), `[${tag}] a tap on the right edge selects it (${await page.locator('#itemcard > b').innerText().catch(() => 'no card')})`);
      const sc = await page.evaluate(() => (window as unknown as S7).btdCanvas.view().scale);
      await f.drag(edgeR, [edgeR[0] + sc * 2, edgeR[1]], { steps: 10 }); await sleep(300);
      check(await edgesNow() === '[{"ballastRightStuds":3},null]', `[${tag}] dragged out 2 studs: 3 past the sleepers, the track's own (${await edgesNow()})`);
      await shot('ballast-edge');
      await tapOn('#itemcard .stepper button:last-of-type'); await sleep(300);
      check(await edgesNow() === '[{"ballastRightStuds":4},null]', `[${tag}] + on its card: a stud more (${await edgesNow()})`);
      await tapOn('#itemcard button:has-text("Change it over a stretch only")'); await sleep(300);
      check(/^\[\{"ballastRightStuds":4\},\[\{"from":\d+,"to":\d+,"own":\{"ballastRightStuds":4\}\}\]\]$/.test(await edgesNow()) && /Over the stretch/.test(await page.locator('#itemcard').innerText().catch(() => '')), `[${tag}] over a stretch only: one made where it was tapped, the edge on it selected (${await edgesNow()})`);
      await tapOn('#itemcard button:has-text("Reset this edge")'); await sleep(300);
      check(await edgesNow() === '[{"ballastRightStuds":4},null]', `[${tag}] Reset this edge: the stretch had nothing else, so it's gone (${await edgesNow()})`);
      await tapOn('#itemcard .idone').catch(() => {});
    }
    await tapOn('#layers button[data-pick="studs"]'); await sleep(200);
    const areasNow = () => page.evaluate(() => JSON.stringify((window as unknown as S7).btdCanvas.host.design().expert?.studsOff ?? []));
    await tapOn('#layers button[data-add="studsoff"]'); await sleep(200);
    await f.tap(await scr(10.2, 10.3)); await sleep(300);
    check(await areasNow() === '[{"id":"s1","x0":9,"y0":9,"x1":11,"y1":11}]', `[${tag}] + Studs off, a tap: an area 2 by 2 there, on whole studs (${await areasNow()})`);
    {
      const c0 = await scr(11, 11), c1 = await scr(13.2, 12.9);
      await f.drag(c0, c1, { steps: 10 }); await sleep(300);
      check(await areasNow() === '[{"id":"s1","x0":9,"y0":9,"x1":13,"y1":13}]', `[${tag}] its corner dragged: to the whole stud nearest (${await areasNow()})`);
      await shot('studs-off');
      await tapOn('#itemcard button.danger'); await sleep(300);
      check(await areasNow() === '[]', `[${tag}] Delete on its card takes it away (${await areasNow()})`);
    }
    await page.evaluate(() => { localStorage.setItem('btd-design', JSON.stringify({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print' }, routes: [{ name: 'Straight', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }, { name: 'Branch', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 33.75 }], throwSide: 'left' }] })); });
    await page.reload(); await page.waitForSelector('#track'); await tapOn('#mode-select'); await tapOn('#fit'); await sleep(300);
    await tapOn('#layers button[data-pick="studs"]'); await sleep(200);
    let appA: [number, number] | undefined;
    for (let k = 0; k < 300 && !appA; k++) {
      const v = JSON.parse(await page.locator('#track').getAttribute('data-areas') ?? '[]') as [number, number, string][], q = v.find((e) => e[2].startsWith('app:'));
      if (q) { const tb = (await page.locator('#track').boundingBox())!; appA = [tb.x + q[0], tb.y + q[1]]; } else await sleep(200);
    }
    check(!!appA, `[${tag}] the points' own stud-off area is on the plan, once worked out`);
    if (appA) {
      // (its toe: inside the blades' band, a little on along the straight)
      const inA = await scr(0, 4);
      await f.tap(inA); await sleep(300);
      check(/The app's/.test(await page.locator('#itemcard .istatus').innerText().catch(() => '')) && await page.locator('#sel-item-del').isHidden(), `[${tag}] a tap on it selects the app's, nothing to delete (${await page.locator('#itemcard > b').innerText().catch(() => 'no card')})`);
      await shot('studs-off-app');
      await tapOn('#itemcard button:has-text("Clear more round it")'); await sleep(300);
      check(/^\[\{"id":"s1",/.test(await areasNow()), `[${tag}] Clear more round it: an area of your own over it (${await areasNow()})`);
      await tapOn('#itemcard .idone').catch(() => {});
    }
    await page.evaluate(() => localStorage.setItem('btd-pick', 'all'));
    await shot('several');
  }
  await pageStill('everything');
  check(errors.length === 0, `[${tag}] no errors on the page${errors.length ? `: ${errors.join(' | ').slice(0, 400)}` : ''}`);
  await ctx.close();
}
try {
  if (process.env.ONLY !== 'portrait') await tablet(1180, 820, 'landscape');
  await tablet(820, 1180, 'portrait');
} catch (err) {
  fails.push(`${at}: ${err instanceof Error ? err.message : err}`);
} finally { await browser.close(); stopPreview(); clearTimeout(limit); }
if (fails.length) { console.error(`::error::touch smoke test failed: ${fails.join('; ').slice(0, 900)}`); process.exit(1); }
console.log('touch smoke test passed');
