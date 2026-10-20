// The 3MF export: every part an object, welded (each edge shared by two
// triangles), on the bed, none overlapping another.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { stlBytes } from '../src/geom/stl';
import { threeMF } from '../src/geom/threemf';

/** The stored files of a zip (as zip.ts writes them). */
function unzip(b: Uint8Array) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out = new Map<string, string>();
  for (let o = 0; dv.getUint32(o, true) === 0x04034b50;) {
    const size = dv.getUint32(o + 18, true), nl = dv.getUint16(o + 26, true), xl = dv.getUint16(o + 28, true);
    const name = new TextDecoder().decode(b.subarray(o + 30, o + 30 + nl)), start = o + 30 + nl + xl;
    out.set(name, new TextDecoder().decode(b.subarray(start, start + size)));
    o = start + size;
  }
  return out;
}

describe('3MF export', () => {
  it('lays every part out on the bed as its own welded object', async () => {
    const w = await kernel();
    const parts = [w.Manifold.cube([100, 60, 10]), w.Manifold.cylinder(20, 15), w.Manifold.cube([200, 150, 5]), w.Manifold.sphere(8, 24)]
      .map((m, i) => ({ name: `part${i} <&>`, stl: stlBytes(m.getMesh()) }));
    const files = unzip(threeMF(parts, 256, 256));
    expect([...files.keys()]).toEqual(['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model']);
    const model = files.get('3D/3dmodel.model')!;
    const objs = [...model.matchAll(/<object id="(\d+)" name="([^"]*)"[^>]*><mesh><vertices>(.*?)<\/vertices><triangles>(.*?)<\/triangles>/g)];
    expect(objs.map((o) => o[2])).toEqual(parts.map((_, i) => `part${i} &lt;&amp;>`));
    const boxes = objs.map((o, i) => {
      const vs = [...o[3].matchAll(/x="([-\d.e]+)" y="([-\d.e]+)" z="([-\d.e]+)"/g)].map((m) => [+m[1], +m[2], +m[3]]);
      const edges = new Map<string, number>();
      for (const t of o[4].matchAll(/v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) {
        const v = [+t[1], +t[2], +t[3]];
        for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`; edges.set(key, (edges.get(key) ?? 0) + 1); }
      }
      expect([...edges.values()].every((n) => n === 2)).toBe(true);
      expect(Math.min(...vs.map((v) => v[2]))).toBeCloseTo(0, 3);
      const tr = model.match(new RegExp(`<item objectid="${i + 1}" transform="1 0 0 0 1 0 0 0 1 ([-\\d.e]+) ([-\\d.e]+) 0"`))!;
      const xs = vs.map((v) => v[0] + +tr[1]), ys = vs.map((v) => v[1] + +tr[2]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    });
    for (let i = 0; i < boxes.length; i++) {
      // (on a bed: within one bed's square, the beds 20 apart along x)
      const bed = Math.floor(boxes[i][0] / 276), bx = boxes[i][0] - bed * 276;
      expect(bx).toBeGreaterThanOrEqual(0); expect(boxes[i][2] - bed * 276).toBeLessThanOrEqual(256); expect(boxes[i][1]).toBeGreaterThanOrEqual(0); expect(boxes[i][3]).toBeLessThanOrEqual(256);
      for (let j = 0; j < i; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        expect(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]).toBe(true);
      }
    }
  });
});
