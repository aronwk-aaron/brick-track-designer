// What a slicer would trip over in a part as it's exported (the STL in its print frame, lying on the bed at z 0, the
// way up it prints). Shared by the tests (test/printable.shared.ts) and the scripts that print the numbers
// (scripts/overhangs.mts, scripts/islands.mts): one meaning of "overhang" and "floating island".
//
// 1. hanging: faces facing down, steeper than 45 degrees, above the bed, with nothing to hold them. Held is: something
//    within 0.45 mm below (the part's own break-out supports are in its file, so they hold), a slope of 45 degrees or
//    less, or a bridge (held both sides, 10 mm or less across). Area in mm2, and the box it's in.
// 2. islands: a bit of a layer (0.2 mm up from the one before) that touches nothing in the layer below, even grown by
//    0.3 mm for what a layer can lean out: it would print in mid-air. (Bits of the first layer are on the bed.)
import type { kernel } from '../src/geom/kernel';

type Wasm = Awaited<ReturnType<typeof kernel>>;
export type Man = InstanceType<Wasm['Manifold']>;

/** (mm) A layer's height (the project's: 0.2 mm layers). */
export const LAYER = 0.2;
/** (mm) How far a layer can lean out past the one below it. */
export const LEAN = 0.3;

/** A file's triangles, as corner positions: 9 numbers each. */
export function stlPositions(stl: Uint8Array) {
  const dv = new DataView(stl.buffer, stl.byteOffset), n = dv.getUint32(80, true), P = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) P[i * 9 + k * 3 + j] = dv.getFloat32(84 + i * 50 + 12 + k * 12 + j * 4, true);
  return P;
}

/** A solid from a file's triangles (merged as a slicer reads them); undefined where they don't close. */
export function stlSolid(w: Wasm, stl: Uint8Array): Man | undefined {
  const P = stlPositions(stl);
  if (!P.length) return undefined;
  try {
    const mesh = new w.Mesh({ numProp: 3, vertProperties: P, triVerts: new Uint32Array(P.length / 3).map((_, i) => i) });
    mesh.merge();
    const m = new w.Manifold(mesh);
    return m.status() === 'NoError' && m.volume() > 0 ? m : undefined;
  } catch { return undefined; }
}

/** Where something is on a part: x, y across the bed, z up from its bottom, each from..to (mm). */
export type Box = [number, number][];
const showBox = (b: Box | undefined) => (b ? b.map(([lo, hi]) => `${lo.toFixed(1)}..${hi.toFixed(1)}`).join(' ') : '');
export const boxText = showBox;

/**
 * How much of a solid, as printed (upright), hangs with nothing under it (mm2): faces facing down, steeper
 * than 45 degrees, above its bottom. Held: something within 0.45 below (break-out supports), a slope of 45
 * degrees or less, a bridge (held both sides, 10 or less across). Sampled over each face, not just its middle.
 * where: the box the unheld bits are in (z from the part's bottom).
 */
export function hangingAt(w: Wasm, solid: Man): { area: number; where?: Box; byHeight: Map<string, number> } {
  const mesh = solid.getMesh(), np = mesh.numProp, tv = mesh.triVerts, vp = mesh.vertProperties, n = tv.length / 3;
  const at = (i: number, k: number, j: number) => vp[tv[i * 3 + k] * np + j];
  let zmin = Infinity, area = 0;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) zmin = Math.min(zmin, at(i, k, 2));
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], byHeight = new Map<string, number>();
  const below = new Map<number, ReturnType<typeof solid.slice>>();
  // (a face's samples look only as far as a bridge reaches (5.1 mm either way): the slices cut to that window first, once
  // for the face, so each look is among a few edges, not the whole layer's: the same answers, far faster on a big part)
  let near = new Map<number, ReturnType<typeof solid.slice>>(), window: ReturnType<typeof solid.slice> | undefined;
  const has = (x: number, y: number, z: number) => {
    const key = Math.round(z * 20);
    if (!near.has(key)) { if (!below.has(key)) below.set(key, solid.slice(key / 20)); near.set(key, below.get(key)!.intersect(window!)); }
    return near.get(key)!.intersect(w.CrossSection.square([0.2, 0.2], true).translate([x, y])).area() > 0.001;
  };
  const D = [[1, 0], [0, 1], [0.7, 0.7], [0.7, -0.7]] as const, span = Array.from({ length: 10 }, (_, k) => 0.5 * (k + 1));
  const held = (x: number, y: number, z: number) => has(x, y, z - 0.45)
    || D.some(([dx, dy]) => [1, -1].some((sg) => [0.3, 0.5].some((d) => has(x + sg * dx * d, y + sg * dy * d, z - 0.3))))
    || D.some(([dx, dy]) => [1, -1].every((sg) => span.some((d) => has(x + sg * dx * d, y + sg * dy * d, z - 0.3))));
  const WT = [[1 / 3, 1 / 3, 1 / 3], [0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7], [0.45, 0.45, 0.1], [0.1, 0.45, 0.45], [0.45, 0.1, 0.45]];
  for (let i = 0; i < n; i++) {
    const u = [0, 1, 2].map((j) => at(i, 1, j) - at(i, 0, j)), v = [0, 1, 2].map((j) => at(i, 2, j) - at(i, 0, j));
    const nz = u[0] * v[1] - u[1] * v[0], L = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], nz);
    if (!(L > 1e-9 && nz / L < -0.75)) continue;
    const xs = [0, 1, 2].map((k) => at(i, k, 0)), ys = [0, 1, 2].map((k) => at(i, k, 1));
    near = new Map();
    window = w.CrossSection.square([Math.max(...xs) - Math.min(...xs) + 10.4, Math.max(...ys) - Math.min(...ys) + 10.4]).translate([Math.min(...xs) - 5.2, Math.min(...ys) - 5.2]);
    for (const wt of WT) {
      const c = [0, 1, 2].map((j) => wt[0] * at(i, 0, j) + wt[1] * at(i, 1, j) + wt[2] * at(i, 2, j));
      if (c[2] > zmin + 0.05 && !held(c[0], c[1], c[2])) { area += L / 2 / WT.length; const hk = (c[2] - zmin).toFixed(1); byHeight.set(hk, (byHeight.get(hk) ?? 0) + L / 2 / WT.length); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], c[k]); hi[k] = Math.max(hi[k], c[k]); } }
    }
  }
  return { area, where: area > 0 ? [0, 1, 2].map((k) => [lo[k] - (k === 2 ? zmin : 0), hi[k] - (k === 2 ? zmin : 0)] as [number, number]) : undefined, byHeight };
}
export const hanging = (w: Wasm, solid: Man) => hangingAt(w, solid).area;

/** A bit of a layer in mid-air: its height from the part's bottom, area (mm2) and where on the bed. */
export interface Island { z: number; area: number; x: number; y: number }
/** The floating islands of a solid, as printed: layer by layer, each piece of a layer that touches nothing below it (grown by LEAN). */
export function islandsOf(w: Wasm, m: Man): Island[] {
  const bb = m.boundingBox(), out: Island[] = [];
  let prev = m.slice(bb.min[2] + 0.1);
  for (let z = bb.min[2] + 0.3; z < bb.max[2]; z += LAYER) {
    const cur = m.slice(z);
    for (const part of cur.decompose()) if (part.intersect(prev.offset(LEAN, 'Round', 2, 16)).area() < 0.01 && part.area() > 0.05) {
      const q = part.bounds(); out.push({ z: z - bb.min[2], area: part.area(), x: q.min[0], y: q.min[1] });
    }
    prev = cur;
  }
  return out;
}
