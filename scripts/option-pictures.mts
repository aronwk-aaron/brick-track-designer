// The settings' example pictures (public/options/<key>-<value>.webp, on a clear background, and index.json, which there are): each value
// of every setting, rendered from the app's own geometry with a fixed camera. Run with the dev server up:
//   npx vite --port 5204 &   npx tsx scripts/option-pictures.mts [key,key,...]
// (the settings and their examples: scripts/option-specs.ts)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
const root = new URL('../', import.meta.url).pathname;
const { kernel } = await import(`${root}src/geom/kernel.ts`);
const { buildDesign } = await import(`${root}src/app/build.ts`);
const PORT = process.env.PORT ?? '5204', only = process.argv[2]; // (only: these settings' pictures, comma separated)
const { SPECS } = await import(`${root}scripts/option-specs.ts`);
const { optionForm } = await import(`${root}src/app/settings.ts`);
const { clearBuildCache } = await import(`${root}src/app/build.ts`);
type P = { name: string; positions: Float32Array; lego?: { shop?: string }[] };
// (the settings, to set each value as the settings panel does: a length set in studs kept in mm, a number choice a number)
let cur: Record<string, unknown> = {};
const fields = optionForm(() => cur).form.flatMap((sec: { fields: unknown[] }) => sec.fields) as { key: string; check?: boolean; choices?: unknown[]; numeric?: boolean; text?: boolean; set?: (v: unknown) => void }[];
const withValue = (key: string, base: unknown, v: string | number | boolean) => {
  const f = fields.find((x) => x.key === key)!;
  cur = structuredClone(base) as Record<string, unknown>;
  const val = f.check ? v === true || v === 'true' : f.choices ? (f.numeric ? Number(v) : String(v)) : f.text ? String(v) : Number(v);
  if (f.set) f.set(val); else cur.options = { ...(cur.options as object), [key]: val };
  return cur;
};
/** A value's picture's name: public/options/<key>-<this>.webp (an empty text: none). */
const fileVal = (v: unknown) => (String(v) === '' ? 'none' : String(v));
const FIT = `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox() or (0, 0, im.width, im.height)
x0, y0, x1, y1 = bb; m = int(0.06 * max(x1 - x0, y1 - y0))
im = im.crop((max(0, x0 - m), max(0, y0 - m), min(im.width, x1 + m), min(im.height, y1 + m)))
W, H = 640, 420; k = min(W / im.width, H / im.height)
im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
out = Image.new('RGBA', (W, H), (0, 0, 0, 0)); out.paste(im, ((W - im.width) // 2, (H - im.height) // 2), im)
out.save(sys.argv[2], 'WEBP', quality=82, method=6)
`;
const w = await kernel();
mkdirSync(`${root}public/options`, { recursive: true }); mkdirSync(`${root}public/_opt`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 840 } });
if (process.env.DEBUG) page.on('console', (m) => console.log(m.text()));
for (const sp of SPECS) {
  if (only && !only.split(',').includes(sp.key)) continue;
  for (const v of sp.values) {
    const d = withValue(sp.key, sp.base, v);
    // (what a value gives, where the example can't show it)
    if (sp.show?.[String(v)]) d.options = { ...(d.options as object), ...sp.show[String(v)] };
    const b = buildDesign(w, d);
    const ps: P[] = b.pieces.filter((p: P) => !sp.pick || sp.pick.test(p.name));
    const urls = ps.map((p, k) => {
      const P = Float32Array.from(p.positions);
      if (sp.explode && k > 0) for (let i = 1; i < P.length; i += 3) P[i] += sp.explode * k;
      if (sp.lift && k > 0) for (let i = 2; i < P.length; i += 3) P[i] += sp.lift * k;
      const n = P.length / 9, buf = Buffer.alloc(84 + n * 50); buf.writeUInt32LE(n, 80);
      for (let t = 0; t < n; t++) for (let i = 0; i < 9; i++) buf.writeFloatLE(P[t * 9 + i], 84 + t * 50 + 12 + i * 4);
      writeFileSync(`${root}public/_opt/${k}.stl`, buf); return `/_opt/${k}.stl`;
    });
    const at = sp.cam.at?.(ps);
    // (bought pieces in their colours, as the 3D view, wherever there are any)
    const tint = sp.tint ?? (ps.some((p) => p.lego) ? (p: P) => (!p.lego ? '6f7780' : p.lego.some((l) => l.shop) ? 'a070d8' : '4caf50') : undefined);
    await page.goto(`http://localhost:${PORT}/scripts/option-shot.html?w=1280&h=840&stl=${urls.join(',')}${tint ? `&col=${ps.map(tint).join(',')}` : ''}${sp.clip ? `&clip=${sp.clip(ps).join(',')}` : ''}${sp.zscale ? `&zs=${sp.zscale}` : ''}&dir=${sp.cam.dir}${sp.cam.r ? `&r=${sp.cam.r}` : `&dist=${sp.cam.dist ?? 1}`}${at ? `&at=${at.join(',')}` : ''}&n=${Date.now()}`);
    await page.waitForFunction(() => document.title === 'done', null, { timeout: 60000 });
    // (a PNG with a clear background, then a small WebP with its transparency: the picture on the page's own background)
    const png = `${root}public/_opt/shot.png`;
    await page.screenshot({ path: png, omitBackground: true });
    // (rendered at twice the size, cropped to the model with a little margin, and fitted to 640 x 420: no dead space round it)
    execFileSync('python3', ['-c', FIT, png, `${root}public/options/${sp.key}-${fileVal(v)}.webp`]);
    console.log(`${sp.key}-${fileVal(v)}`, b.info.warnings.length ? b.info.warnings : '');
    // (its solids let go: one kernel builds them all)
    clearBuildCache();
  }
}
// (the list of them, for the settings panel: each setting's values that have a picture)
const index = Object.fromEntries(SPECS.map((sp: { key: string; values: unknown[] }) => [sp.key, sp.values.map(fileVal)]));
writeFileSync(`${root}public/options/index.json`, `${JSON.stringify(index, null, 1)}\n`);
await browser.close();
