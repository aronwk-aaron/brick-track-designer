import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1400, height: 300 } });
await p.goto('http://localhost:5194/'); await p.waitForSelector('#track');
const out: string[] = [];
for (let w = 780; w <= 2100; w += 20) { await p.setViewportSize({ width: w, height: 300 }); await p.waitForTimeout(60); const wr = await p.evaluate(() => [...document.querySelector('header')!.children].some((c) => (c as HTMLElement).offsetWidth > 0 && (c as HTMLElement).offsetTop > 30)); if (wr) out.push(String(w)); }
console.log('wraps at', out.join(' '));
await b.close();
