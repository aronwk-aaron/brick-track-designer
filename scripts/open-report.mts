// Reproduce a problem report: open its zip (from Report a problem) in a headless browser at the window size it was made
// in, with its design and its 3D camera, wait for the build, and save fresh pictures of the plan and the 3D view next to
// the zip: <report>-replay-plan.png and <report>-replay-view3d.png. Also prints what the report says.
//   pnpm build && npx tsx scripts/open-report.mts path/to/btd-report-….zip       (CHROME: the browser to use; PORT: preview's)
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { unzip } from '../src/geom/unzip';

const zipPath = process.argv[2];
if (!zipPath || !existsSync(zipPath)) { console.error('usage: npx tsx scripts/open-report.mts <report.zip>'); process.exit(2); }
const files = unzip(new Uint8Array(readFileSync(zipPath)));
const report = JSON.parse(new TextDecoder().decode(files.get('report.json') ?? new TextEncoder().encode('{}')));
const note = new TextDecoder().decode(files.get('note.txt') ?? new Uint8Array()).trim();
console.log(`report from ${report.date ?? '?'}, app ${report.app?.version ?? '?'}${note ? `\nnote: ${note}` : ''}`);
console.log(`the build said: ${report.build?.status ?? '(nothing)'}`);
for (const w of report.build?.warnings ?? []) console.log(`  warning: ${w}`);
for (const i of report.build?.issues ?? []) console.log(`  ringed at ${i.at?.join(', ')} ${i.atUnit}: ${i.text}`);

const root = new URL('../', import.meta.url).pathname, port = process.env.PORT ?? '4734';
const chrome = process.env.CHROME ?? ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const preview = spawn('npx', ['vite', 'preview', '--port', port, '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-preview.pid!, 'SIGTERM'); } catch { /* gone */ } };
const url = `http://localhost:${port}/`;
for (let k = 0; ; k++) { try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ } if (k > 100) { stop(); throw new Error('vite preview did not start (build first: pnpm build)'); } await new Promise((r) => setTimeout(r, 200)); }
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const w = report.window ?? { width: 1400, height: 900 };
  const page = await browser.newPage({ viewport: { width: w.width, height: w.height } });
  page.on('dialog', (d) => { void d.accept(); });
  await page.goto(url); await page.waitForSelector('#track');
  await page.setInputFiles('#load-file', { name: basename(zipPath), mimeType: 'application/zip', buffer: Buffer.from(readFileSync(zipPath)) });
  await page.waitForFunction(() => document.getElementById('buildstatus')!.hidden && /built in|Can't build/.test(`${document.getElementById('info')!.textContent} ${document.getElementById('error')!.textContent}`), null, { timeout: 5 * 60_000 });
  await page.waitForTimeout(500);
  const stem = join(dirname(zipPath), basename(zipPath, '.zip'));
  writeFileSync(`${stem}-replay-plan.png`, await page.locator('#track').screenshot());
  writeFileSync(`${stem}-replay-view3d.png`, await page.locator('#view3d').screenshot());
  console.log(`now it says: ${await page.evaluate(() => `${document.getElementById('info')!.textContent} ${document.getElementById('error')!.textContent}`.trim())}`);
  console.log(`saved ${stem}-replay-plan.png and ${stem}-replay-view3d.png`);
} finally { await browser.close(); stop(); }
