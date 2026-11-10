import { chromium } from 'playwright-core';
import { copyFileSync } from 'node:fs';
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

// 1. two ready-made tables
let p = await mk(1400, 900, { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }] }] });
await p.click('#tables > summary');
for (let k = 0; k < 2; k++) { await p.locator('#tables-body select').first().selectOption('0'); await p.waitForTimeout(300); }
console.log('tables', JSON.stringify((await saved(p)).tables?.map((t: any) => [t.x, t.y, t.w, t.h])));
await p.keyboard.press('f'); await p.click('#fit'); await p.waitForTimeout(500);
await p.screenshot({ path: D + '/fix-tables-desktop.png' });
await p.close();

// 2. Top view on Yard ladder
p = await mk(1400, 900);
await p.click('#templates-open'); await p.fill('#tpl-search', 'yard ladder'); await p.click('button[data-template="Yard ladder (R40)"]');
await built(p, /built in/);
await p.click('#view-under'); await p.waitForTimeout(300); await p.click('#view-top'); await p.waitForTimeout(800);
await p.screenshot({ path: D + '/fix-top-yard-desktop.png' });
await p.close();
console.log('errors', errs);
await b.close();
