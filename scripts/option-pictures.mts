// The settings' example pictures (public/options/<key>-<value>.webp, on a clear background): each choice of the settings that change what's
// built, rendered from the app's own geometry with a fixed camera. Run with the dev server up:
//   npx vite --port 5204 &   npx tsx scripts/option-pictures.mts [key filter]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
const root = new URL('../', import.meta.url).pathname;
const { kernel } = await import(`${root}src/geom/kernel.ts`);
const { buildDesign } = await import(`${root}src/app/build.ts`);
const { TEMPLATES } = await import(`${root}src/app/design.ts`);
const PORT = process.env.PORT ?? '5204', only = process.argv[2];
type P = { name: string; positions: Float32Array };
type Cam = { dir: string; r: number; at?: (ps: P[]) => [number, number, number] };
const st = (studs: number, more = {}) => ({ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }], ...more });
const curve = [{ name: 'C', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 45 }] }];
const D = (routes: unknown[], options: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({ version: 1, gaugeStuds: 4, routes, options: { printBedX: 500, printBedY: 500, ...options }, ...more });
const box = (ps: P[]) => { const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (const p of ps) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], p.positions[i + k]); b[k + 3] = Math.max(b[k + 3], p.positions[i + k]); } return b; };
// (a part's cut face, where it starts: its joint)
const faceOf = (ps: P[]): [number, number, number] => { const b = box(ps); return [0, b[1] + 4, 3]; };
const sw = TEMPLATES['Left switch (LEGO)'].routes;
const toe: Cam = { dir: '1,-0.7,1.1', r: 190, at: () => [4, 44, 6] }, throwCam: Cam = { dir: '1.2,-0.6,1', r: 120, at: () => [34, 28, 8] };
const iso: Cam = { dir: '1,-0.9,0.8', r: 260 }, under: Cam = { dir: '0.6,-0.7,-1', r: 250 };
/** explode: each part after the first moved this far along y (mm), so the joints between them show */
const specs: { key: string; values: string[]; design: (v: string) => unknown; pick?: RegExp; cam: Cam; explode?: number }[] = [
  { key: 'joint', values: ['lego', 'dovetail', 'butt', 'axle'], design: (v) => D([st(32)], { ballast: 'ballast', printBedX: 160, printBedY: 160, joint: v }), pick: /^track2$/, cam: { dir: '0.4,-1,0.55', r: 88, at: faceOf } },
  { key: 'cutRails', values: ['tongues', 'flat'], design: (v) => D([st(32)], { printBedX: 160, printBedY: 160, cutRails: v }), pick: /^track2$/, cam: { dir: '0.45,-1,0.55', r: 100, at: faceOf } },
  { key: 'sleepers', values: ['bed', 'sleepers'], design: (v) => D([st(16)], { sleepers: v }), cam: iso },
  { key: 'curveStuds', values: ['grid', 'follow'], design: (v) => D(curve, { curveStuds: v }), cam: { dir: '0.2,-0.5,1', r: 300 } },
  { key: 'ballast', values: ['none', 'ballast', 'buddy'], design: (v) => D([st(16)], { ballast: v }), cam: { dir: '1,-1.2,0.6', r: 250 } },
  { key: 'bottomStyle', values: ['antistud', 'float'], design: (v) => D([st(16)], { ballast: 'ballast', bottomStyle: v }), cam: under },
  { key: 'grip', values: ['edges', 'all'], design: (v) => D([st(16)], {}, { grip: v }), cam: under },
  { key: 'undersideGrid', values: ['baseplate', 'track'], design: (v) => D([{ ...curve[0], heading: 17 }], { undersideGrid: v }), cam: { dir: '0.3,-0.5,-1', r: 320 } },
  { key: 'splitTrack', values: ['bed', 'lengths'], design: (v) => D([st(48), st(48, { name: 'B', x: 16 })], { printBedX: 200, printBedY: 200, splitTrack: v }), cam: { dir: '0.3,-0.5,1', r: 700 } },
  { key: 'mechStyle', values: ['plates', 'tines'], design: (v) => D(sw, { mechStyle: v }), cam: toe },
  { key: 'bladeHold', values: ['lip', 'bracket'], design: (v) => D(sw, { bladeHold: v }), cam: toe },
  { key: 'bladeStyle', values: ['simple', 'prototype'], design: (v) => D(sw, { bladeStyle: v }), cam: toe },
  { key: 'throwStyle', values: ['built-in', 'bracket', 'stand'], design: (v) => D(sw, { throwStyle: v }), cam: throwCam },
  { key: 'bufferStyle', values: ['frame', 'blocks'], design: (v) => D([st(16, { endEnd: 'buffer' })], { ballast: 'ballast', bufferStyle: v }), cam: { dir: '0.9,-1,0.7', r: 150, at: () => [0, 116, 12] } },
  { key: 'monoEndStuds', values: ['side', 'top', 'none'], design: (v) => D([st(8, { system: 'monorail' })], { monoEndStuds: v }), cam: { dir: '1,-1,0.8', r: 100, at: () => [0, 4, 7] } },
];
const w = await kernel();
mkdirSync(`${root}public/options`, { recursive: true }); mkdirSync(`${root}public/_opt`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 420 } });
if (process.env.DEBUG) page.on('console', (m) => console.log(m.text()));
for (const sp of specs) {
  if (only && sp.key !== only) continue;
  for (const v of sp.values) {
    const b = buildDesign(w, sp.design(v));
    const ps: P[] = b.pieces.filter((p: P) => !sp.pick || sp.pick.test(p.name));
    const urls = ps.map((p, k) => {
      const P = Float32Array.from(p.positions); if (sp.explode && k > 0) for (let i = 1; i < P.length; i += 3) P[i] += sp.explode * k;
      const n = P.length / 9, buf = Buffer.alloc(84 + n * 50); buf.writeUInt32LE(n, 80);
      for (let t = 0; t < n; t++) for (let i = 0; i < 9; i++) buf.writeFloatLE(P[t * 9 + i], 84 + t * 50 + 12 + i * 4);
      writeFileSync(`${root}public/_opt/${k}.stl`, buf); return `/_opt/${k}.stl`;
    });
    const at = sp.cam.at?.(ps);
    await page.goto(`http://localhost:${PORT}/scripts/option-shot.html?w=640&h=420&stl=${urls.join(',')}&dir=${sp.cam.dir}&r=${sp.cam.r}${at ? `&at=${at.join(',')}` : ''}&n=${Date.now()}`);
    await page.waitForFunction(() => document.title === 'done', null, { timeout: 60000 });
    // (a PNG with a clear background, then a small WebP with its transparency: the picture on the page's own background)
    const png = `${root}public/_opt/shot.png`;
    await page.screenshot({ path: png, omitBackground: true });
    execFileSync('python3', ['-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], "WEBP", quality=82, method=6)', png, `${root}public/options/${sp.key}-${v}.webp`]);
    console.log(`${sp.key}-${v}`, b.info.warnings.length ? b.info.warnings : '');
  }
}
await browser.close();
