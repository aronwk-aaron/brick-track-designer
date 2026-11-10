import { describe, expect, it } from 'vitest';
import { buildDesign } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions } from '../src/app/design';
import { freeStart, PALETTE, placePart } from '../src/app/palette';
import { follow } from '../src/app/planner';
import { kernel } from '../src/geom/kernel';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;
type Built = ReturnType<typeof buildDesign>;
const count = (b: Built, part: string) => b.pieces.reduce((t, p) => t + (p.lego?.filter((l) => l.part === part).reduce((u, l) => u + l.qty, 0) ?? 0), 0);

describe('the parts palette', { timeout: 600000 }, () => {
  it('lays each part on the selected route\'s end, a switch\'s branch as a new route', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [] };
    let at = placePart(d, 'lego-straight', undefined).next;
    expect(d.routes.length).toBe(1);
    at = placePart(d, 'lego-switch-l', at).next;
    expect([d.routes.length, at, d.routes[0].segs.length]).toEqual([2, 0, 2]);
    // (the branch starts where the switch does: 16 studs on)
    expect([d.routes[1].x, d.routes[1].y, d.routes[1].heading]).toEqual([d.routes[0].x, d.routes[0].y + 16, 0]);
    placePart(d, 'lego-r40', 1, -1);
    expect(d.routes[1].segs.at(-1)).toEqual({ kind: 'curve', radius: 40, angle: -22.5 });
    for (const p of PALETTE) expect(p.segs(1).length).toBeGreaterThan(0);
  });
  it('built, what is laid is bought: LEGO\'s straights, switch and curves; BrickTracks\' switch, curves and straights', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      const lego: Design = { version: 1, gaugeStuds: 4, routes: [] };
      let at = placePart(lego, 'lego-straight', undefined).next;
      at = placePart(lego, 'lego-switch-r', at).next;
      placePart(lego, 'lego-straight', at);
      placePart(lego, 'lego-r40', 1, 1);
      const b = buildDesign(w, lego);
      expect([count(b, '53401'), count(b, '53404'), count(b, '53400'), b.pieces.filter((p) => !p.lego).length]).toEqual([2, 1, 1, 0]);

      const bt: Design = { version: 1, gaugeStuds: 4, routes: [] };
      at = placePart(bt, 'bt-s08', undefined).next;
      at = placePart(bt, 'bt-switch-l', at).next;
      placePart(bt, 'bt-s04', at);
      placePart(bt, 'bt-r104', 1, -1);
      const c = buildDesign(w, bt);
      expect([count(c, 'BrickTracks S08'), count(c, 'BrickTracks S04'), count(c, 'BrickTracks R104'), c.pieces.filter((p) => !p.lego).length]).toEqual([1, 1, 1, 0]);
      expect(c.pieces.some((p) => p.lego?.some((l) => /switch/i.test(l.name)))).toBe(true);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
});

describe('a new route by itself', () => {
  it('starts clear of the routes there are, not on one of them', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [] };
    expect(freeStart(d)).toEqual({ x: 0, y: 0, heading: 0 });
    // (+ Route twice: the second below the first, not the same track again)
    for (let k = 0; k < 3; k++) d.routes.push({ name: `R${k + 1}`, ...freeStart(d), segs: [{ kind: 'straight', studs: 16 }] });
    expect(d.routes.map((r) => [r.x, r.y])).toEqual([[0, 0], [0, -24], [0, -48]]);
  });
});

describe('a switch laid from one of its far ends', () => {
  // (exact: design.ts endOf rounds to a thousandth of a stud)
  const endOf = (d: Design, i: number) => follow({ x: d.routes[i].x, y: d.routes[i].y, heading: d.routes[i].heading }, d.routes[i].segs);
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.001);
  const angleNear = (a: number, b: number) => near(((((a - b) % 360) + 540) % 360) - 180, 0);
  const switches = PALETTE.filter((p) => p.branch);
  const base = (): Design => ({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 12, y: -20, heading: 30, segs: [{ kind: 'straight', studs: 24 }, { kind: 'curve', radius: 40, angle: 22.5 }] }] });
  for (const sw of switches) for (const from of ['straight', 'branch'] as const) {
    it(`${sw.id} from its ${from} end: all three ends are where the same switch laid from its toe has them`, () => {
      const d = base(), q = endOf(d, 0);
      const { next, added } = placePart(d, sw.id, 0, 1, from);
      expect(next).toBe(0);
      expect(added).toEqual([1]);
      // (the same switch laid from its toe, at the toe where this one has it)
      const toe = { x: d.routes[1].x, y: d.routes[1].y, heading: d.routes[1].heading };
      const ref: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'T', x: toe.x - 0, y: toe.y, heading: toe.heading, segs: [] }] };
      // (a route with no segments ends where it starts: the toe)
      placePart(ref, sw.id, 0, 1);
      const refStraight = endOf(ref, 0), refBranch = endOf(ref, 1);
      const here = { straight: endOf(d, from === 'straight' ? 0 : 1), branch: endOf(d, from === 'branch' ? 0 : 1) };
      // (the end it's laid by sits on the selected route's end, facing back along it)
      const laid = from === 'straight' ? refStraight : refBranch;
      near(laid.x, q.x); near(laid.y, q.y); angleNear(laid.heading, q.heading + 180);
      // (the far end of the route that goes on through is the toe; the other route's end is the switch's other end)
      const other = from === 'straight' ? refBranch : refStraight, through = endOf(d, 0), otherHere = endOf(d, 1);
      near(through.x, toe.x); near(through.y, toe.y); angleNear(through.heading, toe.heading + 180);
      near(otherHere.x, other.x); near(otherHere.y, other.y); angleNear(otherHere.heading, other.heading);
      expect(here).toBeTruthy();
    });
  }
  it('lays from the toe as before, and with nothing selected', () => {
    const d = base();
    const a = placePart(d, 'lego-switch-l', 0, 1, 'toe');
    expect(a.added).toEqual([1]);
    expect(d.routes[0].segs.at(-1)).toEqual({ kind: 'straight', studs: 32 });
    const e: Design = { version: 1, gaugeStuds: 4, routes: [] };
    expect(placePart(e, 'lego-switch-l', undefined, 1, 'straight').added.length).toBe(2);
  });
  it('a passing loop built from the palette alone: the far switch laid from its straight end, and both found as bought switches', async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const d: Design = { version: 1, gaugeStuds: 4, routes: [] };
      let at = placePart(d, 'lego-straight', undefined).next;
      at = placePart(d, 'lego-switch-l', at).next;                          // (the near switch: its branch is route 2)
      for (let i = 0; i < 6; i++) placePart(d, 'lego-straight', at);
      placePart(d, 'lego-switch-r', at, 1, 'straight');                      // (the far switch, by its straight end: its branch is route 3, running back)
      placePart(d, 'lego-r40', 1, -1);                                       // (the siding: out of the near switch, back parallel, 64 studs, in to the far one)
      for (let i = 0; i < 4; i++) placePart(d, 'lego-straight', 1);
      placePart(d, 'lego-r40', 1, -1);
      const w = await kernel(), b = buildDesign(w, d);
      expect([count(b, '53407'), count(b, '53404'), b.pieces.filter((p) => !p.lego).length]).toEqual([1, 1, 0]);
      expect(b.info.warnings).toEqual([]);
    } finally { Object.assign(OPTION_DEFAULTS, saved); }
  });
});
