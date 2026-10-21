// Islands as printed: for each moving part (its STL, as exported), bits of a
// layer that rest on nothing in the layer below (they'd print in mid-air).
// npx tsx scripts/islands.mts <design.json | template name> [options JSON]
import { readFileSync } from 'node:fs';
const R = new URL('../src/', import.meta.url).pathname;
const { kernel } = await import(R + 'geom/kernel.ts');
const { buildDesign } = await import(R + 'app/build.ts');
const { TEMPLATES } = await import(R + 'app/design.ts');
const w = await kernel();
const arg = process.argv[2], d = arg.endsWith('.json') ? JSON.parse(readFileSync(arg, 'utf8')) : structuredClone(TEMPLATES[arg]);
d.options = { printBedX: 2000, printBedY: 2000, ...(d.options ?? {}), ...(process.argv[3] ? JSON.parse(process.argv[3]) : {}) };
const b = buildDesign(w, d);
for (const p of b.pieces.filter((q: any) => /points|throw|lever|bracket|stand|spring/.test(q.name))) {
  const dv = new DataView(p.stl.buffer, p.stl.byteOffset), n = dv.getUint32(80, true), P = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) P[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
  const mesh = new w.Mesh({ numProp: 3, vertProperties: P, triVerts: new Uint32Array(n * 3).map((_, i) => i) }); mesh.merge();
  const m = new w.Manifold(mesh), bb = m.boundingBox(), out: string[] = [];
  let prev = m.slice(bb.min[2] + 0.1);
  for (let z = bb.min[2] + 0.3; z < bb.max[2]; z += 0.2) {
    const cur = m.slice(z);
    // (a piece of this layer that touches nothing below, grown 0.3 for what a layer can lean out)
    for (const part of cur.decompose()) if (part.intersect(prev.offset(0.3, 'Round', 2, 16)).area() < 0.01 && part.area() > 0.05) {
      const q = part.bounds(); out.push(`z ${(z - bb.min[2]).toFixed(1)}: ${part.area().toFixed(2)} mm2 at ${q.min[0].toFixed(1)},${q.min[1].toFixed(1)}`);
    }
    prev = cur;
  }
  console.log(p.name, out.length ? `${out.length} islands: ${out.slice(0, 6).join('; ')}` : 'no islands');
}
