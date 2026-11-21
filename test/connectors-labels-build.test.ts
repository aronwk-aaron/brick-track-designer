// (expert, stage 6) End connectors and labels as things of their own, built: an end or a joint set to rail tongues only
// has no peg and clip there (the part on the other side of it, and the far ends, as they were); the app's joints made
// hand cuts where they are (D6) build the same parts; a label moved by hand is engraved where it's put, one taken off
// isn't, and every other part is byte for byte as it was.
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import { type Design, type DRoute, OPTION_DEFAULTS, type PieceOptions } from '../src/app/design';

/** (built as the app builds: its defaults, not the OpenSCAD files' the other tests start from) */
const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
const saved = { ...OPTION_DEFAULTS };
import type { LabelItem } from '../src/app/labelitems';

type Built = ReturnType<typeof buildDesign>;
const sha = (p: Built['pieces'][number]) => createHash('sha1').update(p.stl ?? new Uint8Array()).digest('hex');
const byName = (b: Built) => Object.fromEntries(b.pieces.map((p) => [p.name, p]));
const volOf = (p: Built['pieces'][number]) => {
  // (a closed mesh's volume from its triangles: the divergence theorem)
  const v = p.positions; let t = 0;
  for (let i = 0; i < v.length; i += 9) t += (v[i] * (v[i + 4] * v[i + 8] - v[i + 5] * v[i + 7]) - v[i + 1] * (v[i + 3] * v[i + 8] - v[i + 5] * v[i + 6]) + v[i + 2] * (v[i + 3] * v[i + 7] - v[i + 4] * v[i + 6])) / 6;
  return Math.abs(t);
};
/** Is (x, y, z) inside a part (a ray up through its triangles, odd: inside)? */
function inside(p: Built['pieces'][number], x: number, y: number, z: number): boolean {
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
const track = (more: Partial<DRoute> = {}): DRoute => ({ name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 32 }], ...more });
const one = (r: DRoute, options: Partial<PieceOptions> = {}, labels?: LabelItem[]): Design => ({ version: 1, gaugeStuds: 4, options: { legoTrack: 'print', pieceLengthStuds: 16, ...options }, routes: [r], ...(labels && { expert: { labels } }) });

describe('end connectors and labels, built', { timeout: 900000 }, () => {
  beforeAll(() => { Object.assign(OPTION_DEFAULTS, APP); });
  afterAll(() => { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); });
  it('rail tongues only at an end or a joint: no peg and clip there, the rest as it was; the app\'s joints kept as hand cuts build the same', async () => {
    const w = await kernel();
    clearBuildCache();
    const base = buildDesign(w, one(track()));
    const names = base.pieces.map((p) => p.name).sort();
    expect(names.length).toBe(2);
    expect(base.overlay.joints?.map((q) => q.map(Math.round))).toEqual([[0, 128]]);
    const b0 = byName(base), [n1, n2] = names;
    // (its end set to rail tongues only: the part at that end smaller (no peg, no clip), the other the same)
    const end = byName(buildDesign(w, one(track({ endEnd: 'nopeg' }))));
    const atEnd = [n1, n2].find((n) => sha(end[n]) !== sha(b0[n]))!, other = [n1, n2].find((n) => n !== atEnd)!;
    expect(sha(end[other])).toBe(sha(b0[other]));
    expect(volOf(end[atEnd])).toBeLessThan(volOf(b0[atEnd]) - 5);
    // (the app's joint kept as a hand cut, Only these: the same parts, byte for byte)
    const kept = byName(buildDesign(w, one(track({ cuts: [16], cutsLocked: true }))));
    for (const n of names) expect(sha(kept[n]), n).toBe(sha(b0[n]));
    // (that joint rail tongues only: both parts smaller there)
    const cj = byName(buildDesign(w, one(track({ cuts: [16], cutsLocked: true, cutJoints: [{ at: 16, kind: 'nopeg' }] }))));
    for (const n of names) expect(volOf(cj[n]), n).toBeLessThan(volOf(b0[n]) - 5);
    // (square rail ends at that joint: no tongues, no supports under them, the rail heads butted flush at the joint, each
    // part's rail running on to it; the far ends as they were (their connectors, their supports))
    const sqB = buildDesign(w, one(track({ cuts: [16], cutsLocked: true, cutJoints: [{ at: 16, kind: 'square' }] }))), sq = byName(sqB);
    for (const n of names) {
      expect(sha(sq[n]), n).not.toBe(sha(b0[n]));
      expect((sq[n].supports?.length ?? 0), `${n}: fewer supports (none at the square end)`).toBeLessThan(b0[n].supports?.length ?? 0);
    }
    for (const x of [-20, 20]) for (const [y, n] of [[127.9, n1], [128.1, n2]] as const) expect(inside(sq[n], x + 0.37, y, 7.5), `rail head at x ${x}, y ${y} in ${n}`).toBe(true);
    // (and back: the same as at first)
    const back = byName(buildDesign(w, one(track())));
    for (const n of names) expect(sha(back[n])).toBe(sha(b0[n]));
  });
  it('a label moved by hand: engraved where it\'s put; taken off: none; the other part byte for byte', async () => {
    const w = await kernel();
    const o: Partial<PieceOptions> = { ballast: 'buddy', bottomStyle: 'float', labelText: 'YARD' };
    const base = buildDesign(w, one(track(), o)), b0 = byName(base);
    const ls = base.overlay.labels ?? [];
    expect(ls.length).toBe(2);
    expect(ls.every((l) => !!l.part && b0[l.part!] && l.text.includes('YARD'))).toBe(true);
    const first = ls[0], other = base.pieces.map((p) => p.name).find((n) => n !== first.part)!;
    const at: [number, number] = [first.at[0] / 8, first.at[1] / 8 + 2];
    const moved = buildDesign(w, one(track(), o, [{ id: 'l1', at, heading: first.heading }])), m = byName(moved);
    expect(moved.info.warnings).toEqual([]);
    expect(sha(m[first.part!])).not.toBe(sha(b0[first.part!]));
    expect(sha(m[other])).toBe(sha(b0[other]));
    expect(moved.overlay.labels?.find((l) => l.id === 'l1')).toMatchObject({ part: first.part });
    // (its own text, small)
    const own = byName(buildDesign(w, one(track(), o, [{ id: 'l1', at, heading: first.heading, text: 'A1', cap: 3 }])));
    expect(volOf(own[first.part!])).toBeGreaterThan(volOf(m[first.part!]));
    // (taken off: more of the part, none cut out)
    const off = byName(buildDesign(w, one(track(), o, [{ id: 'l1', at: [first.at[0] / 8, first.at[1] / 8], heading: first.heading, off: true }])));
    expect(volOf(off[first.part!])).toBeGreaterThan(volOf(b0[first.part!]) + 5);
    expect(sha(off[other])).toBe(sha(b0[other]));
    // (one that doesn't fit, across the track's end: not engraved, and said)
    const bad = buildDesign(w, one(track(), o, [{ id: 'l2', at: [0, 4], heading: 90, text: 'MUCH TOO LONG A LABEL', cap: 6 }]));
    expect(bad.info.warnings.some((x) => /label placed by hand .* isn't engraved/.test(x))).toBe(true);
  });
});
