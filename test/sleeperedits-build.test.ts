// (expert, stage 5a) Sleepers edited by hand, sleepers shared across tracks and the ballast's width each side, built:
// each edit is where it says in the printed part, an edit taken off again builds byte-identical files, and a design
// with none of it is built as it always was.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache } from '../src/app/build';
import type { Design, DRoute } from '../src/app/design';

type Built = ReturnType<typeof buildDesign>;
const hashes = (b: Built) => b.pieces.map((p) => createHash('sha1').update(p.stl ?? new Uint8Array()).digest('hex')).sort();
/** Is there printed material at x, y, z (mm)? A ray straight up from there crosses the parts' surfaces an odd number of times. */
function solidAt(b: Built, x: number, y: number, z: number): boolean {
  let n = 0;
  for (const p of b.pieces) {
    const v = p.positions;
    for (let i = 0; i < v.length; i += 9) {
      const ax = v[i] - x, ay = v[i + 1] - y, bx = v[i + 3] - x, by = v[i + 4] - y, cx = v[i + 6] - x, cy = v[i + 7] - y;
      const d0 = ax * by - ay * bx, d1 = bx * cy - by * cx, d2 = cx * ay - cy * ax;
      if (!((d0 > 0 && d1 > 0 && d2 > 0) || (d0 < 0 && d1 < 0 && d2 < 0))) continue;
      const t = d0 + d1 + d2, zz = (d1 * v[i + 2] + d2 * v[i + 5] + d0 * v[i + 8]) / t;
      if (zz > z) n++;
    }
  }
  return n % 2 === 1;
}
const box = (b: Built) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (const p of b.pieces) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.positions[i + k]); mx[k] = Math.max(mx[k], p.positions[i + k]); } return { mn, mx }; };
const straight = (more: Partial<DRoute> = {}, studs = 32): DRoute => ({ name: 'Main', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs }], ...more });
const onSleepers = (routes: DRoute[], more: Partial<Design> = {}): Design => ({ version: 1, gaugeStuds: 4, options: { sleepers: 'sleepers', legoTrack: 'print', splitTrack: 'bed', printBedX: 400, printBedY: 400 }, routes, ...more });
// (off the centre line a hair, and off the studs: between the rails, in the sleeper's roof over its hollow)
const X = 0.7, Z = 2.6;

describe('sleepers edited by hand, built', { timeout: 600000 }, () => {
  it('a 32-stud straight has its sleepers every 4 studs from 4; taken out, moved, added and lengthened ones are where they say', async () => {
    const w = await kernel();
    clearBuildCache();
    const plain = buildDesign(w, onSleepers([straight()]));
    for (const at of [4, 8, 12, 16, 20, 24, 28]) expect(solidAt(plain, X, at * 8 + 0.9, Z), `sleeper at ${at}`).toBe(true);
    for (const at of [6, 10, 14, 18]) expect(solidAt(plain, X, at * 8 + 0.9, Z), `gap at ${at}`).toBe(false);
    const b = buildDesign(w, onSleepers([straight({ sleeperEdits: [{ at: 8, off: true }, { at: 12, move: -1 }, { at: 22, add: true }, { at: 28, right: 2, left: 1 }] })]));
    expect(b.info.warnings).toEqual([]);
    expect(solidAt(b, X, 8 * 8 + 0.9, Z), 'taken out at 8').toBe(false);
    expect(solidAt(b, X, 12.5 * 8 + 0.9, Z), 'moved back from 12').toBe(false);
    expect(solidAt(b, X, 10.5 * 8 + 0.9, Z), 'now at 11').toBe(true);
    expect(solidAt(b, X, 22 * 8 + 0.9, Z), 'added at 22').toBe(true);
    // (the sleeper's end is 4 studs from the middle: 2 studs longer on the right, 1 on the left)
    expect(solidAt(b, 32 + 12.7, 28 * 8 + 0.9, Z), 'longer on the right').toBe(true);
    expect(solidAt(b, 32 + 17, 28 * 8 + 0.9, Z)).toBe(false);
    expect(solidAt(b, -(32 + 4.7), 28 * 8 + 0.9, Z), 'longer on the left').toBe(true);
    expect(solidAt(b, -(32 + 9), 28 * 8 + 0.9, Z)).toBe(false);
    expect(solidAt(plain, 32 + 4.7, 28 * 8 + 0.9, Z)).toBe(false);
    expect(b.pieces.length).toBe(plain.pieces.length);
    // (reset: the edits taken off again, byte for byte the automatic result; and an edit that says nothing is none)
    expect(hashes(buildDesign(w, onSleepers([straight()])))).toEqual(hashes(plain));
    clearBuildCache();
    expect(hashes(buildDesign(w, onSleepers([straight({ sleeperEdits: [] })])))).toEqual(hashes(plain));
    // (made twice is made once)
    const again = buildDesign(w, onSleepers([straight({ sleeperEdits: [{ at: 8, off: true }, { at: 12, move: -1 }, { at: 22, add: true }, { at: 28, right: 2, left: 1 }] })]));
    expect(hashes(again)).toEqual(hashes(b));
  });
  it('the track turned end for end is built with its edits where they were; a sleeper without studs has none', async () => {
    const w = await kernel();
    const fwd = buildDesign(w, onSleepers([straight({ sleeperEdits: [{ at: 8, off: true }, { at: 20, right: 2 }, { at: 12, studs: false }] })]));
    // (the same track drawn from its other end: 8 from the start is 24 from the new one, its right the left)
    const back = buildDesign(w, onSleepers([straight({ x: 0, y: 32, heading: 180, sleeperEdits: [{ at: 24, off: true }, { at: 12, left: 2 }, { at: 20, studs: false }] })]));
    for (const b of [fwd, back]) {
      expect(solidAt(b, X, 8 * 8 + 0.9, Z)).toBe(false);
      expect(solidAt(b, 32 + 12.7, 20 * 8 + 0.9, Z)).toBe(true);
      expect(solidAt(b, -(32 + 4.7), 20 * 8 + 0.9, Z)).toBe(false);
      // (a stud stands 4 mm off the sleeper's middle each way, its top at 5 mm: none on the bare one, one on the next)
      expect(solidAt(b, 4.6, 12 * 8 + 4.7, 4.2), 'bare').toBe(false);
      expect(solidAt(b, 4.6, 16 * 8 + 4.7, 4.2), 'studded').toBe(true);
    }
  });
  it('edits on a track cut into lengths are each made once, in the length they lie on', async () => {
    const w = await kernel();
    const d = onSleepers([straight({ sleeperEdits: [{ at: 20, off: true }, { at: 40, right: 3 }] }, 64)], { options: { sleepers: 'sleepers', legoTrack: 'print', splitTrack: 'lengths', pieceLengthStuds: 16 } });
    const b = buildDesign(w, d), plain = buildDesign(w, { ...d, routes: [straight({}, 64)] });
    expect(b.pieces.length).toBe(4);
    expect(b.info.warnings).toEqual([]);
    // (three of the four lengths are the files they were)
    const same = hashes(b).filter((h) => hashes(plain).includes(h));
    expect(same.length).toBe(2);
    expect(solidAt(b, 32 + 19.3, 40 * 8 + 0.9, Z)).toBe(true);
  });
  it('a sleeper square to the grid on a curve lies along the grid; the others fan round', async () => {
    const w = await kernel();
    const curve: DRoute = { name: 'Curve', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 45 }] };
    const plain = buildDesign(w, onSleepers([curve])), b = buildDesign(w, onSleepers([{ ...curve, sleeperEdits: [{ at: 15.7, turn: 'square' }] }]));
    expect(b.info.warnings).toEqual([]);
    expect(Math.abs(b.info.volume - plain.info.volume)).toBeLessThan(plain.info.volume * 0.05);
    expect(hashes(b)).not.toEqual(hashes(plain));
  });
  it('what can\'t be made is said: edits on ballast, an edit with no sleeper near, a span too long', async () => {
    const w = await kernel();
    const bal = buildDesign(w, onSleepers([straight({ sleeperEdits: [{ at: 8, off: true }] })], { options: { ballast: 'ballast', legoTrack: 'print', splitTrack: 'bed', printBedX: 400, printBedY: 400 } }));
    expect(bal.info.warnings.join('\n')).toMatch(/Main's sleepers edited by hand aren't made: it's on ballast/);
    const far = buildDesign(w, onSleepers([straight({ sleeperEdits: [{ at: 8, off: true }, { at: 12, off: true }] })]));
    expect(far.info.warnings.join('\n')).toMatch(/the rails would span 10 studs here: 6 at most/);
  });
});

describe('sleepers shared across tracks, built', { timeout: 600000 }, () => {
  it('two tracks 16 studs apart: one part, the first track\'s sleepers carried under both from 8 to 24', async () => {
    const w = await kernel();
    const two = [straight({ name: 'A' }), straight({ name: 'B', x: 16 })];
    const opt = { options: { sleepers: 'sleepers' as const, legoTrack: 'print' as const, splitTrack: 'lengths' as const, pieceLengthStuds: 32, printBedX: 400, printBedY: 400 } };
    const plain = buildDesign(w, onSleepers(two, opt)), b = buildDesign(w, onSleepers(two, { ...opt, expert: { shared: [{ routes: ['A', 'B'], from: 8, to: 24 }] } }));
    expect(b.info.warnings).toEqual([]);
    expect(plain.pieces.length).toBe(2);
    expect(b.pieces.length).toBe(1);
    // (between the tracks, 8 studs from each: a tie at 12, 16 and 20 along; none at 4 or 28, nor in the gaps)
    for (const at of [8, 12, 16, 20, 24]) expect(solidAt(b, 64.7, at * 8 + 0.9, Z), `shared at ${at}`).toBe(true);
    for (const at of [4, 28, 10, 14]) expect(solidAt(b, 64.7, at * 8 + 0.9, Z), `none at ${at}`).toBe(false);
    for (const at of [4, 12, 28]) expect(solidAt(b, 128.7, at * 8 + 0.9, Z), `B's at ${at}`).toBe(true);
    expect(solidAt(plain, 64.7, 12 * 8 + 0.9, Z)).toBe(false);
    // (taken off again: the two parts they were)
    expect(hashes(buildDesign(w, onSleepers(two, opt)))).toEqual(hashes(plain));
  });
});

describe('the ballast\'s width each side, and its ends, built', { timeout: 600000 }, () => {
  it('3 studs past the sleepers on the left, none on the right; turned end for end the same part', async () => {
    const w = await kernel(), opt = { ballast: 'ballast' as const, legoTrack: 'print' as const, splitTrack: 'bed' as const, printBedX: 400, printBedY: 400 };
    const plain = buildDesign(w, { version: 1, gaugeStuds: 4, options: opt, routes: [straight()] });
    expect([box(plain).mn[0], box(plain).mx[0]].map(Math.round)).toEqual([-40, 40]);
    const wide = buildDesign(w, { version: 1, gaugeStuds: 4, options: { ...opt, ballastLeftStuds: 3, ballastRightStuds: 0 }, routes: [straight()] });
    expect(wide.info.warnings).toEqual([]);
    expect([box(wide).mn[0], box(wide).mx[0]].map(Math.round)).toEqual([-56, 32]);
    // (a track's own, over the design's: the same part; and the track drawn from its other end, its sides swapped)
    const own = buildDesign(w, { version: 1, gaugeStuds: 4, options: opt, routes: [straight({ own: { ballastLeftStuds: 3, ballastRightStuds: 0 } })] });
    expect([box(own).mn[0], box(own).mx[0]].map(Math.round)).toEqual([-56, 32]);
    const back = buildDesign(w, { version: 1, gaugeStuds: 4, options: opt, routes: [straight({ y: 32, heading: 180, own: { ballastLeftStuds: 0, ballastRightStuds: 3 } })] });
    expect([box(back).mn[0], box(back).mx[0]].map(Math.round)).toEqual([-56, 32]);
    // (the design's own value said again is none: byte for byte)
    clearBuildCache();
    expect(hashes(buildDesign(w, { version: 1, gaugeStuds: 4, options: { ...opt, ballastLeftStuds: 1, ballastRightStuds: 1 }, routes: [straight()] }))).toEqual(hashes(plain));
  });
  it('stepped round a buffer stop\'s end: a stud longer there, two with the buddy layer', async () => {
    const w = await kernel(), opt = { ballast: 'buddy' as const, legoTrack: 'print' as const, splitTrack: 'bed' as const, printBedX: 400, printBedY: 400 };
    const sq = buildDesign(w, { version: 1, gaugeStuds: 4, options: opt, routes: [straight({ endEnd: 'buffer' })] });
    const st = buildDesign(w, { version: 1, gaugeStuds: 4, options: { ...opt, ballastEnds: 'stepped' }, routes: [straight({ endEnd: 'buffer' })] });
    expect(Math.round(box(sq).mx[1])).toBe(256);
    expect(Math.round(box(st).mx[1])).toBe(272);
    expect(st.info.warnings).toEqual([]);
  });
});
