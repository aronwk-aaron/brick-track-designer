// Islands as printed: for each part (its STL, as exported), bits of a layer that rest on nothing in the layer below
// (they'd print in mid-air). The meaning is scripts/printability.ts's: the tests (test/printable.*.test.ts) use it too.
// npx tsx scripts/islands.mts <design.json | template name> [options JSON]     (ALL=1: every printed part, not just the moving ones)
import { readFileSync } from 'node:fs';
import { islandsOf, stlSolid } from './printability';
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
  const out = islandsOf(w, m).map((i) => `z ${i.z.toFixed(1)}: ${i.area.toFixed(2)} mm2 at ${i.x.toFixed(1)},${i.y.toFixed(1)}`);
  console.log(p.name, out.length ? `${out.length} islands: ${out.slice(0, 6).join('; ')}` : 'no islands');
}
