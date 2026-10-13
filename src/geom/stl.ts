// Binary STL from a manifold-3d mesh.
interface MeshLike {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

export function stlBytes(mesh: MeshLike): Uint8Array {
  const n = mesh.triVerts.length / 3;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12; // normal left zero: slicers recompute it
    for (let k = 0; k < 3; k++) {
      const v = mesh.triVerts[t * 3 + k];
      for (let c = 0; c < 3; c++) dv.setFloat32(o + k * 12 + c * 4, mesh.vertProperties[v * mesh.numProp + c], true);
    }
  }
  return new Uint8Array(buf);
}
