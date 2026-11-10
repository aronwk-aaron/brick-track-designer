// Binary STL from a manifold-3d mesh.
interface MeshLike {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

/**
 * onBed: moved to lie on the bed (its lowest point at z 0), centred over the origin, as a part's file to print.
 * turn: turned that many degrees first (anticlockwise seen from above), a part that fits the bed only on the slant
 * (geom/bedfit.ts): its file lies as it prints.
 */
export function stlBytes(mesh0: MeshLike, onBed = false, turn = 0): Uint8Array {
  let mesh = mesh0;
  if (turn) {
    const v0 = mesh0.vertProperties, np0 = mesh0.numProp, v = new Float32Array(v0), c = Math.cos((turn * Math.PI) / 180), s = Math.sin((turn * Math.PI) / 180);
    for (let i = 0; i < v.length; i += np0) { v[i] = v0[i] * c - v0[i + 1] * s; v[i + 1] = v0[i] * s + v0[i + 1] * c; }
    mesh = { numProp: np0, vertProperties: v, triVerts: mesh0.triVerts };
  }
  const n = mesh.triVerts.length / 3, vp = mesh.vertProperties, np = mesh.numProp, off = [0, 0, 0];
  if (onBed && vp.length) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vp.length; i += np) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], vp[i + c]); mx[c] = Math.max(mx[c], vp[i + c]); }
    off[0] = -(mn[0] + mx[0]) / 2; off[1] = -(mn[1] + mx[1]) / 2; off[2] = -mn[2];
  }
  // (each corner as the file has it, moved and in single precision: a sliver triangle's corners a hair apart can come
  // out the same point, and that triangle, with no area, is left out (its other two sides are each other's
  // reverse, so the surface stays closed))
  const at = (v: number, c: number) => Math.fround(vp[v * np + c] + off[c]);
  const same = (a: number, b: number) => at(a, 0) === at(b, 0) && at(a, 1) === at(b, 1) && at(a, 2) === at(b, 2);
  const keep: number[] = [];
  for (let t = 0; t < n; t++) { const [a, b, c] = [mesh.triVerts[3 * t], mesh.triVerts[3 * t + 1], mesh.triVerts[3 * t + 2]]; if (!same(a, b) && !same(b, c) && !same(c, a)) keep.push(t); }
  const buf = new ArrayBuffer(84 + keep.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, keep.length, true);
  keep.forEach((t, i) => {
    const o = 84 + i * 50 + 12; // normal left zero: slicers recompute it
    for (let k = 0; k < 3; k++) {
      const v = mesh.triVerts[t * 3 + k];
      for (let c = 0; c < 3; c++) dv.setFloat32(o + k * 12 + c * 4, at(v, c), true);
    }
  });
  return new Uint8Array(buf);
}
