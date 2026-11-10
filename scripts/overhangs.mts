// Each part's overhangs as printed (its STL, in its print frame): the area of faces facing down (more than 45° from
// vertical) above the bed that nothing holds (its break-out supports, a slope of 45° or less, a bridge of 10 mm or
// less), and where. The meaning is scripts/printability.ts's: the tests (test/printable.*.test.ts) use it too.
// npx tsx scripts/overhangs.mts <design.json | template name> [options JSON]     (ALL=1: every printed part, not just the moving ones)
import { readFileSync } from 'node:fs';
import { boxText, hangingAt, stlSolid } from './printability';
const R = new URL('../src/', import.meta.url).pathname;
const { kernel } = await import(R + 'geom/kernel.ts');
const { buildDesign } = await import(R + 'app/build.ts');
const { TEMPLATES } = await import(R + 'app/design.ts');
const w = await kernel();
const arg = process.argv[2], d = arg.endsWith('.json') ? JSON.parse(readFileSync(arg, 'utf8')) : structuredClone(TEMPLATES[arg]);
d.options = { printBedX: 2000, printBedY: 2000, ...(d.options ?? {}), ...(process.argv[3] ? JSON.parse(process.argv[3]) : {}) };
const b = buildDesign(w, d);
for (const p of b.pieces.filter((q: any) => !q.lego && (process.env.ALL || /points|throw|lever|bracket|stand|spring/.test(q.name)))) {
  const m = stlSolid(w, p.stl);
  if (!m) { console.log(p.name, 'is not a closed solid'); continue; }
  const h = hangingAt(w, m);
  console.log(p.name, 'overhang', h.area.toFixed(1), 'mm2', boxText(h.where), [...h.byHeight].sort((a, b2) => b2[1] - a[1]).slice(0, 3).map(([z, a]) => `${a.toFixed(0)} at z ${z}`).join(', '));
}
