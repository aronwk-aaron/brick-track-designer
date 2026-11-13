// The app on a tablet's touch screen (CI's smoke job, after browser-smoke): the built site served by vite preview, at a
// landscape and a portrait tablet size with a touch screen (no mouse), everything done with fingers: a template opened from
// the browser, the plan panned, pinched, a track tapped, double-tapped, held, box-selected, dragged and undone; a part from
// the palette placed with the touch bar; a track drawn; the menus, the settings, the 3D view turned. The page
// itself never scrolls or zooms. Any error on the page fails it. SMOKE_MINUTES (default 4) stops it.
//   pnpm build && npx tsx scripts/touch-smoke.mts      (CHROME: the browser to use; PORT: preview's; SHOTS: a folder for screenshots)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium, type CDPSession, type Page } from 'playwright-core';

const root = new URL('../', import.meta.url).pathname, port = process.env.PORT ?? '4734', shots = process.env.SHOTS;
const chrome = process.env.CHROME ?? ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const preview = spawn('npx', ['vite', 'preview', '--port', port, '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
const stopPreview = () => { try { process.kill(-preview.pid!, 'SIGTERM'); } catch { /* (gone already) */ } };
let at = 'starting';
const limit = setTimeout(() => { console.error(`::error::the touch smoke test ran past its time and was stopped (at: ${at})`); stopPreview(); process.exit(124); }, Number(process.env.SMOKE_MINUTES ?? 4) * 60_000);
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
  const centre = async (sel: string): Promise<[number, number]> => { const b = await page.locator(sel).first().boundingBox(); if (!b) throw new Error(`${sel} isn't shown`); return [b.x + b.width / 2, b.y + b.height / 2]; };
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
