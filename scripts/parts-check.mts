// Each moving part of a design: how many pieces it is, and how much of it is in the track as assembled.
// npx tsx scripts/parts-check.mts <design.json | template name> [options JSON]
import { readFileSync } from 'node:fs';
const R = new URL('../src/', import.meta.url).pathname;
const { kernel } = await import(R + 'geom/kernel.ts');
const { buildDesign } = await import(R + 'app/build.ts');
const { TEMPLATES } = await import(R + 'app/design.ts');
const w = await kernel();
const arg = process.argv[2], d = arg.endsWith('.json') ? JSON.parse(readFileSync(arg, 'utf8')) : TEMPLATES[arg];
if (process.argv[3]) d.options = { ...(d.options ?? {}), ...JSON.parse(process.argv[3]) };
d.options = { printBedX: 2000, printBedY: 2000, ...(d.options ?? {}) };
const b = buildDesign(w, d);
const man = (p: any) => { const P = p.positions, mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
const track = w.Manifold.union(b.pieces.filter((p: any) => !/points|throw|lever|bracket|lid/.test(p.name)).map(man));
for (const p of b.pieces.filter((p: any) => /points|throw|lever/.test(p.name))) {
  const m = man(p), parts = m.decompose(), x = m.intersect(track), q = x.boundingBox();
  console.log(p.name, 'pieces', parts.map((z: any) => z.volume().toFixed(1)).join('/'), 'clash', x.volume().toFixed(1), x.volume() > 0.5 ? JSON.stringify([q.min.map((v: number) => +v.toFixed(1)), q.max.map((v: number) => +v.toFixed(1))]) : '');
}
