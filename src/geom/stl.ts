// Binary STL from a manifold-3d mesh.
interface MeshLike {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

/** onBed: moved to lie on the bed (its lowest point at z 0), centred over the origin, as a part's file to print. */
export function stlBytes(mesh: MeshLike, onBed = false): Uint8Array {
  const n = mesh.triVerts.length / 3, vp = mesh.vertProperties, np = mesh.numProp, off = [0, 0, 0];
  if (onBed && vp.length) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vp.length; i += np) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], vp[i + c]); mx[c] = Math.max(mx[c], vp[i + c]); }
    off[0] = -(mn[0] + mx[0]) / 2; off[1] = -(mn[1] + mx[1]) / 2; off[2] = -mn[2];
  }
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12; // normal left zero: slicers recompute it
    for (let k = 0; k < 3; k++) {
      const v = mesh.triVerts[t * 3 + k];
      for (let c = 0; c < 3; c++) dv.setFloat32(o + k * 12 + c * 4, vp[v * np + c] + off[c], true);
    }
  }
  return new Uint8Array(buf);
}
