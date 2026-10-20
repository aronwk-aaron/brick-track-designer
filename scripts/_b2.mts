import { readFileSync } from 'node:fs';
import { kernel } from '../src/geom/kernel';
const w = await kernel();
for (let k = 0; k < 6; k++) {
  const d = readFileSync(`parity/out/bp-${k}.stl`); const n = d.readUInt32LE(80); const vp: number[] = [], tv: number[] = [];
  for (let t = 0; t < n; t++) for (let j = 0; j < 3; j++) { for (let c = 0; c < 3; c++) vp.push(d.readFloatLE(84 + t * 50 + 12 + j * 12 + c * 4)); tv.push(t * 3 + j); }
  const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(vp), triVerts: new Uint32Array(tv) }); mesh.merge();
  const m = new w.Manifold(mesh), b = m.boundingBox();
  console.log(k, m.volume().toFixed(0), 'bodies', m.decompose().length, b.min.map((x: number) => x.toFixed(0)).join(','), '..', b.max.map((x: number) => x.toFixed(0)).join(','));
}
