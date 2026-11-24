// (expert, stage 7) Stud-off areas and ballast edges, built: an area by hand takes off every stud whose middle is in
// it, each whole (the part loses that many studs' worth, no more: none is cut), the part beside it byte for byte as it
// was, and the area taken away gives the parts back byte for byte; one over a switch keeps its studs off too (built
// as a network piece). A ballast edge made wider on its card is that much wider in the part, over a stretch only
// there, and reset gives the parts back byte for byte.
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, type DRoute, OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import type { StudsOffArea } from '../src/app/studsoff';
import { edgeStretch, resetEdge, setEdge } from '../src/app/ballastedges';

/** (built as the app builds: its defaults, not the OpenSCAD files' the other tests start from) */
const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const saved = { ...OPTION_DEFAULTS };

type Built = ReturnType<typeof buildDesign>;
type Part = Built['pieces'][number];
const sha = (p: Part) => createHash('sha1').update(p.stl ?? new Uint8Array()).digest('hex');
const byName = (b: Built) => Object.fromEntries(b.pieces.map((p) => [p.name, p]));
const volOf = (p: Part) => {
  const v = p.positions; let t = 0;
  for (let i = 0; i < v.length; i += 9) t += (v[i] * (v[i + 4] * v[i + 8] - v[i + 5] * v[i + 7]) - v[i + 1] * (v[i + 3] * v[i + 8] - v[i + 5] * v[i + 6]) + v[i + 2] * (v[i + 3] * v[i + 7] - v[i + 4] * v[i + 6])) / 6;
  return Math.abs(t);
};
const maxX = (p: Part) => { let m = -Infinity; for (let i = 0; i < p.positions.length; i += 3) m = Math.max(m, p.positions[i]); return m; };
/** Is (x, y, z) inside a part (a ray up through its triangles, odd: inside)? */
function inside(p: Part, x: number, y: number, z: number): boolean {
  let n = 0;
  const v = p.positions;
  for (let i = 0; i < v.length; i += 9) {
    const ax = v[i] - x, ay = v[i + 1] - y, bx = v[i + 3] - x, by = v[i + 4] - y, cx = v[i + 6] - x, cy = v[i + 7] - y;
    const d0 = ax * by - ay * bx, d1 = bx * cy - by * cx, d2 = cx * ay - cy * ax;
    if (!((d0 > 0 && d1 > 0 && d2 > 0) || (d0 < 0 && d1 < 0 && d2 < 0))) continue;
    const t = d0 + d1 + d2, zz = (d1 * v[i + 2] + d2 * v[i + 5] + d0 * v[i + 8]) / t;
    if (zz > z) n++;
  }
  return n % 2 === 1;
}
/** (half way up a stud: the bed's top is at 3.2, a stud's at 5) */
const STUD_Z = 4.3;
/** (a stud is hollow: looked for in its wall, 2.05 mm off its middle) */
const studAt = (b: Built, x: number, y: number) => b.pieces.some((p) => inside(p, x + 2.05, y, STUD_Z));
const track = (more: Partial<DRoute> = {}): DRoute => ({ name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }], ...more });
const one = (r: DRoute, options: Partial<PieceOptions> = {}, studsOff?: StudsOffArea[]): Design => ({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print', pieceLengthStuds: 16, ballast: 'none', sleepers: 'bed', ...options }, routes: [r], ...(studsOff && { expert: { studsOff } }) });

describe('stud-off areas and ballast edges, built', { timeout: 900000 }, () => {
  beforeAll(() => { Object.assign(OPTION_DEFAULTS, APP); });
  afterAll(() => { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); });
  it('an area takes off every stud in it, whole; the other part and the area taken away byte for byte', async () => {
    const w = await kernel();
    clearBuildCache();
    const base = buildDesign(w, one(track())), b0 = byName(base), names = base.pieces.map((p) => p.name).sort();
    expect(names.length).toBe(2);
    // (the studs between the rails, 4 across, 4 along, in the first part)
    const cells = [-12, -4, 4, 12].flatMap((x) => [36, 44, 52, 60].map((y) => [x, y] as const));
    for (const [x, y] of cells) expect(studAt(base, x, y), `stud at ${x}, ${y} before`).toBe(true);
    const area = buildDesign(w, one(track(), {}, [{ id: 's1', x0: -2, y0: 4, x1: 2, y1: 8 }])), a = byName(area);
    expect(area.info.warnings).toEqual(base.info.warnings);
    for (const [x, y] of cells) expect(studAt(area, x, y), `stud at ${x}, ${y} after`).toBe(false);
    for (const [x, y] of [[4, 28], [4, 68], [28, 44]] as const) expect(studAt(area, x, y), `stud at ${x}, ${y}, outside the area`).toBe(studAt(base, x, y));
    const part = names.find((n) => sha(a[n]) !== sha(b0[n]))!, other = names.find((n) => n !== part)!;
    expect(sha(a[other])).toBe(sha(b0[other]));
    // (whole studs only: 16 of them take off 16 times what one does)
    const single = byName(buildDesign(w, one(track(), {}, [{ id: 's1', x0: 0, y0: 5, x1: 1, y1: 6 }])));
    const s1 = volOf(b0[part]) - volOf(single[part]), s16 = volOf(b0[part]) - volOf(a[part]);
    expect(s1).toBeGreaterThan(20);
    expect(s16 / s1).toBeCloseTo(16, 1);
    // (taken away: as at first)
    const back = byName(buildDesign(w, one(track())));
    for (const n of names) expect(sha(back[n]), n).toBe(sha(b0[n]));
  });
  it('an area over a switch: its studs off there too (a network piece), the rest of it built', async () => {
    const w = await kernel();
    const sw = structuredClone(TEMPLATES['Switch R40 left']!) as Design;
    sw.options = { ...sw.options, ballast: 'none', sleepers: 'bed' };
    const base = buildDesign(w, sw);
    // (a stud of the switch's on its straight's far side, past the points)
    const spot = Array.from({ length: 24 }, (_, j) => [28, 12, -12, -28].map((x) => [x, 68 + 8 * j] as const)).flat().find(([x, y]) => studAt(base, x, y));
    expect(spot, 'a stud on the switch to keep off').toBeDefined();
    const [x, y] = spot!, cell = { id: 's1', x0: Math.floor(x / 8), y0: Math.floor(y / 8), x1: Math.floor(x / 8) + 1, y1: Math.floor(y / 8) + 1 };
    const off = buildDesign(w, { ...sw, expert: { studsOff: [cell] } });
    expect(studAt(off, x, y)).toBe(false);
    expect(off.pieces.length).toBeGreaterThan(0);
    expect(off.info.warnings.filter((q) => !base.info.warnings.includes(q))).toEqual([]);
  });
  it('a ballast edge wider: that much wider in the part (over a stretch, there only); reset: byte for byte', async () => {
    const w = await kernel();
    const o: Partial<PieceOptions> = { ballast: 'ballast' };
    const d0 = one(track(), o), base = buildDesign(w, d0), b0 = byName(base), names = base.pieces.map((p) => p.name).sort();
    const wide = structuredClone(d0);
    expect(setEdge(wide, { route: 0, side: 'right' }, 3)).toBeUndefined();
    const bw = byName(buildDesign(w, wide));
    for (const n of names) expect(maxX(bw[n]) - maxX(b0[n]), n).toBeCloseTo(16, 1);
    resetEdge(wide, { route: 0, side: 'right' });
    expect(wide).toEqual(d0);
    const back = byName(buildDesign(w, wide));
    for (const n of names) expect(sha(back[n]), n).toBe(sha(b0[n]));
    // (over a stretch only: that piece wider, the others as wide as they were)
    const st = structuredClone(d0), got = edgeStretch(st.routes[0], 8);
    expect(got).toEqual({ k: 0 });
    setEdge(st, { route: 0, side: 'right', k: 0 }, 3);
    const bs = buildDesign(w, st);
    const wider = bs.pieces.filter((p) => maxX(p) > maxX(b0[names[0]]) + 8);
    expect(wider.length).toBe(1);
    expect(bs.pieces.filter((p) => Math.abs(maxX(p) - maxX(b0[names[0]])) < 0.5).length).toBe(bs.pieces.length - 1);
  });
});
