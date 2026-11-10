import { chromium } from 'playwright-core';
import { readFileSync, copyFileSync, writeFileSync } from 'node:fs';
const D = '/tmp/claude-1000/-home-aronwk-Documents-openscad/15314535-b478-4283-bdb1-482d43fbab7c/scratchpad/templates-browser';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const errs: string[] = [];
const mk = async (w: number, h: number, design?: unknown) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => { void d.accept(); });
  await p.goto('http://localhost:5194/'); await p.waitForSelector('#track');
  await p.evaluate((d) => { localStorage.clear(); if (d) localStorage.setItem('btd-design', JSON.stringify(d)); }, design);
  await p.reload(); await p.waitForSelector('#track');
  return p;
};
const built = (p: any, re: RegExp) => p.waitForFunction((s: string) => new RegExp(s).test(document.getElementById('info')!.textContent!) && document.getElementById('buildstatus')!.hidden, re.source, { timeout: 240000 });
const saved = (p: any) => p.evaluate(() => JSON.parse(localStorage.getItem('btd-design')!));
const info = (p: any) => p.evaluate(() => document.getElementById('info')!.textContent + ' | ' + document.getElementById('error')!.textContent);

// 3. ballast colours; fold a selected card; palette still lays on it
let p = await mk(1400, 900, { version: 1, gaugeStuds: 4, options: { ballast: 'buddy' }, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 40, angle: 22.5 }] }] });
await built(p, /built in/);
console.log('colours:', await p.locator('#legend3d-rows').innerText());
await p.locator('#routes details.route >> nth=0 >> summary >> nth=0').click(); await p.waitForTimeout(300);
console.log('open after select', await p.evaluate(() => document.querySelector('#routes details.route')!.hasAttribute('open')));
await p.locator('#routes details.route >> nth=0 >> summary >> nth=0').click(); await p.waitForTimeout(300);
console.log('open after 2nd click', await p.evaluate(() => document.querySelector('#routes details.route')!.hasAttribute('open')), 'selected', await p.evaluate(() => !!document.querySelector('#routes details.route.selected')));
await p.click('#palette > summary');
await p.locator('#palette-body button', { hasText: /^Straight$/ }).first().click(); await p.waitForTimeout(400);
const d = await saved(p); console.log('routes', d.routes.length, 'segs of A', d.routes[0].segs.length);
await p.screenshot({ path: D + '/fix-fold-palette-desktop.png' });
await p.close();

// 4. phone toolbar
p = await mk(390, 844);
const arrow = (q: any) => q.evaluate(() => [getComputedStyle(document.querySelector('header')!, '::after').content, getComputedStyle(document.querySelector('header')!, '::before').content, document.querySelector('header')!.className]);
console.log('phone start', await arrow(p));
await p.screenshot({ path: D + '/fix-toolbar-phone-start.png', clip: { x: 0, y: 0, width: 390, height: 70 } });
await p.evaluate(() => { const h = document.querySelector('header')!; h.scrollLeft = h.scrollWidth; });
await p.waitForTimeout(300);
console.log('phone end', await arrow(p));
await p.screenshot({ path: D + '/fix-toolbar-phone-end.png', clip: { x: 0, y: 0, width: 390, height: 70 } });
await p.close();
for (const w of [1040, 1200, 1360]) { p = await mk(w, 700); await p.screenshot({ path: D + '/fix-toolbar-' + w + '.png', clip: { x: 0, y: 0, width: w, height: 70 } }); await p.close(); }
console.log('errors', errs);
await b.close();
