// The snap clamp (snap-clamp.test.ts) on the templates, as built: a clamp at each set of points, clear of everything.
// (In files of their own: the kernel wears out after twenty builds in one worker.)
import { describe, expect, it } from 'vitest';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, TEMPLATES } from '../src/app/design';
import { kernel } from '../src/geom/kernel';

export const snapOpts = { bladeStyle: 'simple', throwAction: 'snap' } as const;
export const man = (w: Awaited<ReturnType<typeof kernel>>, P: Float32Array) => { const mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
export const stl = (w: Awaited<ReturnType<typeof kernel>>, bytes: Uint8Array) => { const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), n = dv.getUint32(80, true), P = new Float32Array(n * 9); for (let t = 0; t < n; t++) for (let i = 0; i < 9; i++) P[t * 9 + i] = dv.getFloat32(84 + t * 50 + 12 + i * 4, true); return man(w, P); };
export const built = async (d: Design, o: object) => {
  const w = await kernel();
  clearBuildCache();
  const b = buildDesign(w, { ...d, options: { ...d.options, ...o } as Design['options'] });
  const of = (re: RegExp) => b.pieces.filter((q) => re.test(q.name));
  return { w, b, springs: of(/-spring$/), throws: of(/-throw$/), blades: b.pieces.filter((q) => /points/.test(q.name) && !/spring/.test(q.name)), track: w.Manifold.union(b.pieces.filter((q) => !/points|throw|lever|bracket/.test(q.name)).map((q) => man(w, q.positions))) };
};
export { describe, expect, it, TEMPLATES };
