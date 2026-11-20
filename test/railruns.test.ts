// (expert, stage 3) One running rail at a time (railedits.ts): a rail's pieces between the stretches taken out of it,
// a piece made longer, shorter or slid along, a stretch cut out of it, a piece deleted, the rail reset; and what
// follows the track when it's turned end for end, split or joined.
import { describe, expect, it } from 'vitest';
import type { DRoute } from '../src/app/design';
import { cleanRailEdits, cutOutOfPiece, deleteRailPiece, joinRailEdits, railPieces, resetRailSide, reverseRailEdits, setRailPiece, slideRailPiece, splitRailEdits } from '../src/app/railedits';

const tr = (railEdits?: DRoute['railEdits'], studs = 32): Pick<DRoute, 'segs' | 'railEdits'> => ({ segs: [{ kind: 'straight', studs }], railEdits });

describe('a rail\'s pieces', () => {
  it('a rail as laid is one piece end to end; a stretch taken out leaves two', () => {
    expect(railPieces(32, undefined, 'left')).toEqual([{ from: 0, to: 32 }]);
    const e = cleanRailEdits({ out: [{ side: 'left', from: 10, to: 14 }] });
    expect(railPieces(32, e, 'left')).toEqual([{ from: 0, to: 10 }, { from: 14, to: 32 }]);
    expect(railPieces(32, e, 'right')).toEqual([{ from: 0, to: 32 }]);
  });
  it('stretches that meet are one; under a stud long, none; out of order, sorted', () => {
    expect(cleanRailEdits({ out: [{ side: 'left', from: 14, to: 20 }, { side: 'left', from: 10, to: 14 }, { side: 'right', from: 3, to: 3.5 }] })).toEqual({ out: [{ side: 'left', from: 10, to: 20 }] });
  });
});

describe('one rail at a time', () => {
  it('shortened at its start, then lengthened back: as laid again (nothing kept)', () => {
    const a = setRailPiece(tr(), 'right', 0, 4, 32);
    expect(a.edits).toEqual({ out: [{ side: 'right', from: 0, to: 4 }] });
    expect(setRailPiece(tr(a.edits), 'right', 0, 0, 32).edits).toBeUndefined();
  });
  it('to whole studs, or the track\'s end itself; at least a stud long', () => {
    expect(setRailPiece(tr(undefined, 30.5), 'left', 0, 2.4, 30.3).edits).toEqual({ out: [{ side: 'left', from: 0, to: 2 }] });
    expect(setRailPiece(tr(), 'left', 0, 10, 10.4).why).toMatch(/1 stud long at least/);
  });
  it('slid along: as long as it was, held a stud from the next piece and at the track\'s ends', () => {
    const e = cutOutOfPiece(tr(), 'left', 0, 16, 2).edits!;
    expect(railPieces(32, e, 'left')).toEqual([{ from: 0, to: 15 }, { from: 17, to: 32 }]);
    const short = setRailPiece(tr(e), 'left', 1, 20, 28).edits!;
    expect(railPieces(32, slideRailPiece(tr(short), 'left', 1, 3).edits, 'left')).toEqual([{ from: 0, to: 15 }, { from: 23, to: 31 }]);
    expect(slideRailPiece(tr(short), 'left', 1, -5).why).toMatch(/rail before it/);
    expect(slideRailPiece(tr(short), 'left', 1, 5).why).toMatch(/track ends/);
  });
  it('a stretch cut out needs a stud of rail each side; a piece deleted is no rail there; reset puts that side back', () => {
    expect(cutOutOfPiece(tr(undefined, 3), 'left', 0).why).toMatch(/Too short/);
    const e = deleteRailPiece(tr(cleanRailEdits({ out: [{ side: 'left', from: 10, to: 12 }, { side: 'right', from: 4, to: 6 }] })), 'left', 1).edits;
    expect(railPieces(32, e, 'left')).toEqual([{ from: 0, to: 10 }]);
    expect(resetRailSide(e, 'left')).toEqual({ out: [{ side: 'right', from: 4, to: 6 }] });
    expect(railPieces(32, deleteRailPiece(tr(), 'right', 0).edits, 'right')).toEqual([]);
  });
});

describe('it follows the track', () => {
  const e = cleanRailEdits({ out: [{ side: 'left', from: 4, to: 10 }] })!;
  it('turned end for end: from the other end, on the other side', () => {
    expect(reverseRailEdits(e, 32)).toEqual({ out: [{ side: 'right', from: 22, to: 28 }] });
  });
  it('split across the stretch: each keeps its part; joined again: one stretch', () => {
    const [a, b] = splitRailEdits(e, 8);
    expect(a).toEqual({ out: [{ side: 'left', from: 4, to: 8 }] });
    expect(b).toEqual({ out: [{ side: 'left', from: 0, to: 2 }] });
    expect(joinRailEdits(a, b, 8)).toEqual(e);
  });
});
