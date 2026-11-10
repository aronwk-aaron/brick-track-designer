import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1400, height: 300 } });
await p.goto('http://localhost:5194/'); await p.waitForSelector('#track');
for (const w of [780, 800, 900, 1000, 1040, 1100, 1219, 1220]) { await p.setViewportSize({ width: w, height: 300 }); await p.waitForTimeout(150); console.log(w, await p.evaluate(() => document.getElementById('theme')!.offsetTop < 30 ? 'one' : 'WRAPS')); }
await b.close();
