// Cross-sections across the track (a plane y = const, looking from the toe)
// through a design's parts, as assembled, drawn to PNG: for the comparison
// pictures (compare/). Uses playwright-core to draw the SVG.
// npx tsx scripts/compare-section.mts <out.png> <template name> <options JSON> <y> <x0> <x1> <z0> <z1> [title]
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { kernel } = await import(root + '/src/geom/kernel.ts');
const { buildDesign } = await import(root + '/src/app/build.ts');
const { TEMPLATES } = await import(root + '/src/app/design.ts');
const [out, tpl, opts, ys, ...rest] = process.argv.slice(2);
const [x0, x1, z0, z1] = rest.slice(0, 4).map(Number), title = rest[4] ?? '';
const w = await kernel();
const d = structuredClone(TEMPLATES[tpl]);
d.options = { printBedX: 2000, printBedY: 2000, ...JSON.parse(opts) };
const b = buildDesign(w, d);
const man = (p: { positions: Float32Array }) => {
  const P = p.positions, mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) });
  mesh.merge();
  return new w.Manifold(mesh);
};
const fill = (n: string) => (/spring/.test(n) ? '#c0392b' : /lever/.test(n) ? '#d4af37' : /throw/.test(n) ? '#e8892b' : /points/.test(n) ? '#4682b4' : '#9aa0a8');
const S = Math.min(60, 1800 / (x1 - x0)), W = (x1 - x0) * S, H = (z1 - z0) * S;
let paths = '';
for (const p of b.pieces) {
  // (y up to z: the slice at z = y is the section at y; x stays, the slice's y is -z)
  const cs = man(p).rotate([90, 0, 0]).slice(Number(ys));
  for (const poly of cs.toPolygons()) {
    const dd = poly.map(([x, y]: [number, number], i: number) => `${i ? 'L' : 'M'}${((x - x0) * S).toFixed(1)},${((z1 + y) * S).toFixed(1)}`).join('') + 'Z';
    paths += `<path d="${dd}" fill="${fill(p.name)}" stroke="#222" stroke-width="1" fill-rule="evenodd"/>`;
  }
}
// a 1 mm scale bar
paths += `<path d="M${W - 20 - S},${H - 20}h${S}" stroke="#000" stroke-width="3"/><text x="${W - 20 - S}" y="${H - 28}" font-size="16" font-family="sans-serif">1 mm</text>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#f4f4f2"/>${paths}<text x="12" y="26" font-size="18" font-family="sans-serif" fill="#333">${title}</text></svg>`;
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome` });
const page = await browser.newPage({ viewport: { width: Math.ceil(W), height: Math.ceil(H) } });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
writeFileSync(resolve(out), await page.screenshot());
await browser.close();
console.log(out);
