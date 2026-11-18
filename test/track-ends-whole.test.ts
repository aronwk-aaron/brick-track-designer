// Track pieces with ordinary ends are whole, one solid each, wherever they lie on the plan:
// - a piece's rails are one with its end connectors' rail-end tongues (crossing.ts rooted). Cut flush with a tongue's
//   root, on a piece ending part way round a curve the two faces only nearly met: the same curve's file came out
//   9894.98 mm3 at one place and 9880.69 at another, and at the first the next piece's tongue lay 11 mm3 in it;
// - a piece too short for a sleeper between its end connectors has a bed there: a 5.625-degree curve came out as two halves.
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import type { Design, DRoute } from '../src/app/design';
import { assembledProblems, drop, solid } from './assembled.shared';
import { OPTION_DEFAULTS } from '../src/app/design';

const OPTS: Design['options'] = { legoTrack: 'print', splitTrack: 'lengths', sleepers: 'sleepers' };
const curve = (y: number, angle: number, more: Partial<DRoute> = {}): Design => ({ version: 1, gaugeStuds: 4, options: OPTS, routes: [{ name: 'Curve', x: -11.715729, y, heading: 45, segs: [{ kind: 'curve', radius: 40, angle }], ...more }] });
/** A part's volume from its file's own triangles. */
const fileVolume = (P: Float32Array) => { let v = 0; for (let i = 0; i < P.length; i += 9) v += P[i] * (P[i + 4] * P[i + 8] - P[i + 5] * P[i + 7]) - P[i + 1] * (P[i + 3] * P[i + 8] - P[i + 5] * P[i + 6]) + P[i + 2] * (P[i + 3] * P[i + 7] - P[i + 4] * P[i + 6]); return v / 6; };

/** How many solids a part's file is (a film of no volume the kernel leaves isn't one). */
const bodies = (m: NonNullable<ReturnType<typeof solid>>) => m.decompose().filter((q) => q.volume() > 1).length;

describe('track pieces are whole wherever they lie', { timeout: 300000 }, () => {
  it('a curve cut part way round: the same two parts at either place, each file the solid it reads back as, neither in the other', async () => {
    const w = await kernel(), sizes: number[][] = [];
    for (const y of [28.284271, 60.284271]) {
      clearBuildCache();
      const d = curve(y, 22.5, { cuts: [10] }), b = buildDesign(w, structuredClone(d)), tracks = b.pieces.filter((p) => /^track/.test(p.name));
      expect(tracks.map((p) => p.name), `at y ${y}`).toEqual(['track1', 'track2']);
      expect(assembledProblems(w, b.pieces, { ...OPTION_DEFAULTS, ...d.options }), `at y ${y}`).toEqual([]);
      sizes.push(tracks.map((p) => { const m = solid(w, p.positions)!, v = m.volume(), f = fileVolume(p.positions); expect(bodies(m), `${p.name} at y ${y}: one solid`).toBe(1); drop(m); expect(Math.abs(v - f), `${p.name} at y ${y}: its file ${f.toFixed(2)} mm3, read back ${v.toFixed(2)}`).toBeLessThan(0.05); return v; }));
    }
    // (moved 32 studs up the plan, each part is the same part)
    sizes[0].forEach((v, k) => expect(Math.abs(v - sizes[1][k]), `part ${k + 1}: ${v.toFixed(2)} and ${sizes[1][k].toFixed(2)} mm3`).toBeLessThan(0.05));
    clearBuildCache();
  });
  it('a printed 5.625-degree R40 curve, too short for a sleeper between its end connectors, is one solid', async () => {
    const w = await kernel();
    clearBuildCache();
    const b = buildDesign(w, structuredClone(curve(28.284271, 5.625))), tracks = b.pieces.filter((p) => /^track/.test(p.name));
    expect(tracks).toHaveLength(1);
    const m = solid(w, tracks[0].positions)!;
    expect(bodies(m)).toBe(1);
    drop(m);
    clearBuildCache();
  });
});
