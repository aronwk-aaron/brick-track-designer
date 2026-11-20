// (expert, stage 5) One blade of the points at a time (Trackwork.points bladeHeel, switch/context.ts heels, base.ts
// heelOf): a blade made longer than worked out is that blade's part alone made longer, the other's as it was, each part
// one solid; reset, the files are byte for byte what they were. Where the set's machinery doesn't give a blade its own
// (both on one plate, narrow gauge; on spring tines, one pivot) it changes nothing.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, readDesign } from '../src/app/design';
import { solid } from './assembled.shared';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
type Built = ReturnType<typeof buildDesign>;
const hashes = (b: Built) => b.pieces.map((p) => createHash('sha1').update(p.stl ?? new Uint8Array()).digest('hex')).sort();
const vol = (w: Awaited<ReturnType<typeof kernel>>, b: Built, name: string) => { const p = b.pieces.find((q) => q.name === name); const m = p && solid(w, p.positions); const v = m?.volume() ?? 0; m?.delete(); return v; };
const bodies = (w: Awaited<ReturnType<typeof kernel>>, b: Built) => b.pieces.flatMap((p) => { const m = p.positions.length ? solid(w, p.positions) : undefined; if (!m) return []; const n = m.decompose().filter((q) => q.volume() > 0.01).length; m.delete(); return n > 1 ? [`${p.name}: ${n}`] : []; });
const sw = (bh?: [number, number], more: Partial<Design> = {}): Design => ({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 48 }] }, { name: 'S', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }] }], ...(bh && { trackwork: { points: { '0,64': { bladeHeel: bh } } } }), ...more });

describe('one blade of the points at a time', { timeout: 900000 }, () => {
  it('kept as it may be: 0 to 64 mm each, none both 0', () => {
    expect(readDesign(sw([-5, 99])).trackwork?.points?.['0,64']?.bladeHeel).toEqual([0, 64]);
    expect(readDesign(sw([0, 0])).trackwork?.points?.['0,64']?.bladeHeel).toBeUndefined();
  });
  it('blade a 2 studs longer: its part alone longer, blade b\'s as it was; one solid each; reset, as it was', async () => {
    const saved = { ...OPTION_DEFAULTS }; Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const plain = buildDesign(w, sw()), a = buildDesign(w, sw([16, 0])), b = buildDesign(w, sw([0, 16]));
      expect(a.info.warnings).toEqual([]);
      expect(vol(w, a, 'points-a')).toBeGreaterThan(vol(w, plain, 'points-a') + 100);
      expect(Math.abs(vol(w, a, 'points-b') - vol(w, plain, 'points-b'))).toBeLessThan(0.01);
      expect(vol(w, b, 'points-b')).toBeGreaterThan(vol(w, plain, 'points-b') + 100);
      expect(Math.abs(vol(w, b, 'points-a') - vol(w, plain, 'points-a'))).toBeLessThan(0.01);
      expect([...bodies(w, a), ...bodies(w, b)]).toEqual([]);
      // (the plan picks a blade by its line: there, each to its own heel)
      const it = a.overlay.items.find((q) => q.kind === 'points');
      expect(it?.blades?.length).toBe(2);
      expect(hashes(buildDesign(w, sw()))).toEqual(hashes(plain));
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
  it('narrow gauge, both blades on one plate: still two blades, a blade\'s own length not made (the same files)', async () => {
    const saved = { ...OPTION_DEFAULTS }; Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      const narrow = (bh?: [number, number]) => sw(bh, { gaugeStuds: 3 });
      const plain = buildDesign(w, narrow()), a = buildDesign(w, narrow([16, 0]));
      expect(hashes(a)).toEqual(hashes(plain));
      expect(a.overlay.items.find((q) => q.kind === 'points')?.joined).toBe(true);
      expect(a.overlay.items.find((q) => q.kind === 'points')?.key, 'the edit is on these points').toBe('0,64');
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
  it('on spring tines (one pivot): a blade\'s own length not made', async () => {
    const saved = { ...OPTION_DEFAULTS }; Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      const tines = (bh?: [number, number]) => sw(bh, { options: { mechStyle: 'tines' } as Design['options'] });
      const t = buildDesign(w, tines([16, 0]));
      expect(t.overlay.items.find((q) => q.kind === 'points')?.key, 'the edit is on these points').toBe('0,64');
      expect(hashes(t)).toEqual(hashes(buildDesign(w, tines())));
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
});
