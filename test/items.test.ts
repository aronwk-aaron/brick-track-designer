// The plan's typed selection (expert mode), the pure part (items.ts): the hit test that knows each kind's shape (a cut
// across a track, a cut path, a stretch, a joint), what each is called, where a dragged stretch may go and why it
// stops, what a card says while the expert tools are hidden, and what the Pick list lets a click take.
import { describe, expect, it } from 'vitest';
import type { Design, DRoute, DSeg } from '../src/app/design';
import { joints } from '../src/app/connections';
import { stretchProblem } from '../src/app/stretches';
import { alongBeyond, byHand, byHandNote, designByHandNote, dragStretchEnd, dragStretchWhole, EXPERT_SECTIONS, hitItems, type HitCtx, isPick, itemLabel, jointsOf, jointWhere, layerOf, newStretchAt, PICKS, picks, placeAlong, sameItem, takesFirst, withStretch } from '../src/app/items';
import { cardSections } from '../src/app/cardsections';

const st = (studs: number): DSeg => ({ kind: 'straight', studs });
const cv = (radius: number, angle: number): DSeg => ({ kind: 'curve', radius, angle });
const r = (name: string, x: number, y: number, heading: number, segs: DSeg[], extra: Partial<DRoute> = {}): DRoute => ({ name, x, y, heading, segs, ...extra });
const d = (routes: DRoute[], extra: Partial<Design> = {}): Design => ({ version: 1, gaugeStuds: 4, routes, ...extra });
const ALL = ['cut', 'cutpath', 'stretch', 'joint'] as const;
const ctx = (des: Design, more: Partial<HitCtx> = {}): HitCtx => ({ near: 1, point: 1.25, kinds: ALL, paths: des.expert?.cutPaths ?? [], joints: joints(des), stretchesOf: des.routes.map((_, i) => i), ...more });
const what = (des: Design, w: [number, number], more: Partial<HitCtx> = {}) => hitItems(des, w, ctx(des, more)).map((h) => `${h.item.kind}${'k' in h.item ? h.item.k : ''}:${h.part}${h.corner ?? ''}`);

/** Main runs up the plan from 0, 0 for 48 studs: a cut at 12, a stretch from 20 to 32; On carries on from its end; a cut path crosses at y = 40. */
const plan = () => d([
  r('Main', 0, 0, 0, [st(48)], { cuts: [12], stretches: [{ from: 20, to: 32, own: { sleepers: 'bed' } }] }),
  r('On', 0, 48, 0, [st(16)]),
], { expert: { cutPaths: [{ id: 'c1', pts: [[-6, 40], [6, 40], [6, 44]] }] } });

describe('the hit test', () => {
  it('finds each kind by its shape', () => {
    const des = plan();
    expect(what(des, [0.5, 12.3])).toEqual(['cut0:body']);          // a line across the track
    expect(what(des, [3.9, 12.3])).toEqual(['cut0:body']);          // out to a little past the rails
    expect(what(des, [6, 12])).toEqual([]);                         // not beside the track
    expect(what(des, [-3, 40.4])).toEqual(['cutpath:body']);        // along a path's run
    expect(what(des, [6.3, 42])).toEqual(['cutpath:body']);         // and its second run
    expect(what(des, [1, 26])).toEqual(['stretch0:body']);          // on the stretch's band
    expect(what(des, [5, 26])).toEqual([]);                         // not off the band
    expect(what(des, [0, 20.4])).toEqual(['stretch0:from']);        // its ends
    expect(what(des, [-2, 31.5])).toEqual(['stretch0:to']);
    expect(what(des, [0.4, 48.3])).toEqual(['joint:body']);         // where Main and On meet
    expect(what(des, [0, 5])).toEqual([]);                          // plain track: nothing of these
  });
  it('only the kinds asked for, and only the given tracks\' stretches', () => {
    const des = plan();
    expect(what(des, [0, 12], { kinds: ['stretch'] })).toEqual([]);
    expect(what(des, [0, 26], { kinds: ['cut', 'cutpath'] })).toEqual([]);
    expect(what(des, [0, 26], { stretchesOf: [1] })).toEqual([]);
    expect(what(des, [0, 26], { stretchesOf: [0] })).toEqual(['stretch0:body']);
  });
  it('the smaller thing first: a cut on a stretch, a path over a stretch, the selected path\'s corner over its run', () => {
    const des = d([r('Main', 0, 0, 0, [st(48)], { cuts: [26], stretches: [{ from: 20, to: 32, own: {} }] })], { expert: { cutPaths: [{ id: 'c1', pts: [[-6, 30], [6, 30]] }] } });
    expect(what(des, [0, 26.2])).toEqual(['cut0:body', 'stretch0:body']);
    expect(what(des, [0, 30.1])).toEqual(['cutpath:body', 'stretch0:body']);
    expect(what(des, [-5.8, 30], { selected: { kind: 'cutpath', id: 'c1' } })).toEqual(['cutpath:corner0', 'cutpath:body']);
    expect(what(des, [-5.8, 30])).toEqual(['cutpath:body']);       // (corners are the selected path's only)
  });
  it('the selected stretch\'s ends come before everything else there, and a press takes them before a track\'s end', () => {
    const des = d([r('Main', 0, 0, 0, [st(48)], { cuts: [20], stretches: [{ from: 20, to: 48, own: {} }] })]);
    const hits = hitItems(des, [0, 20.2], ctx(des, { selected: { kind: 'stretch', route: 0, k: 0 } }));
    expect(hits.map((h) => `${h.item.kind}:${h.part}`)).toEqual(['stretch:from', 'cut:body']);
    expect(takesFirst(hits[0])).toBe(true);
    expect(takesFirst(hitItems(des, [0, 20.2], ctx(des))[0])).toBe(false);
    // (its far end is the track's end: still its own, selected)
    expect(takesFirst(hitItems(des, [0, 47.8], ctx(des, { selected: { kind: 'stretch', route: 0, k: 0 } }))[0])).toBe(true);
  });
  it('of two of one kind the nearer first', () => {
    const des = d([r('Main', 0, 0, 0, [st(48)], { cuts: [20, 22] })]);
    expect(hitItems(des, [0, 21.3], ctx(des, { near: 1.5 })).map((h) => (h.item as { k: number }).k)).toEqual([1, 0]);
  });
  it('follows a curve, and leaves a locked track\'s cuts and stretches alone', () => {
    const des = d([r('Bend', 0, 0, 0, [st(8), cv(40, 90)], { cuts: [40], stretches: [{ from: 50, to: 60, own: {} }] })]);
    const at = placeAlong(des.routes[0], 40), mid = placeAlong(des.routes[0], 55);
    expect(what(des, [at.x, at.y])).toEqual(['cut0:body']);
    expect(what(des, [mid.x, mid.y])).toEqual(['stretch0:body']);
    des.routes[0].locked = true;
    expect(what(des, [at.x, at.y])).toEqual([]);
    expect(what(des, [mid.x, mid.y])).toEqual([]);
  });
  it('a cut past the end of its track (the track was shortened) is not there to pick', () => {
    const des = d([r('Short', 0, 0, 0, [st(10)], { cuts: [30] })]);
    expect(what(des, [0, 30])).toEqual([]);
  });
});

describe('what an item is called', () => {
  const des = plan(), js = joints(des);
  it('each kind by what it is and where', () => {
    expect(itemLabel(des, { kind: 'route', route: 1 })).toBe('On');
    expect(itemLabel(des, { kind: 'cut', route: 0, k: 0 })).toBe('Cut across Main, 12 studs from its start');
    expect(itemLabel(des, { kind: 'cutpath', id: 'c1' })).toBe('Cut path 1');
    expect(itemLabel(des, { kind: 'stretch', route: 0, k: 0 })).toBe('Stretch 1 of Main, 20 to 32 studs');
    expect(itemLabel(des, { kind: 'joint', route: 0, end: 'end' }, js)).toBe('Joint between Main and On');
    expect(itemLabel(des, { kind: 'joint', route: 0, other: 1 }, js)).toBe('Joint between Main and On');
  });
  it('one that is gone has no name', () => {
    expect(itemLabel(des, { kind: 'cut', route: 0, k: 3 })).toBeUndefined();
    expect(itemLabel(des, { kind: 'cut', route: 7, k: 0 })).toBeUndefined();
    expect(itemLabel(des, { kind: 'cutpath', id: 'nope' })).toBeUndefined();
    expect(itemLabel(des, { kind: 'stretch', route: 1, k: 0 })).toBeUndefined();
    expect(itemLabel(des, { kind: 'joint', route: 0, end: 'start' }, js)).toBeUndefined();
  });
  it('a joint: by a track\'s end or by its two tracks, where it is, and taken apart', () => {
    const y = d([r('A', 0, 0, 0, [st(32)]), r('B', 0, 12, 0, [cv(40, 30)])], { expert: { apart: [['A', 'B']] } }), yj = joints(y);
    expect(jointsOf({ kind: 'joint', route: 0, other: 1 }, yj)).toHaveLength(1);
    expect(jointsOf({ kind: 'joint', route: 1, end: 'start' }, yj)).toHaveLength(1);
    expect(jointsOf({ kind: 'joint', route: 1, end: 'end' }, yj)).toHaveLength(0);
    expect(jointsOf({ kind: 'cut', route: 0, k: 0 }, yj)).toHaveLength(0);
    expect(jointWhere(y, yj[0])).toBe('B\'s start on A\'s side, 12 studs along');
    expect(itemLabel(y, { kind: 'joint', route: 0, other: 1 }, yj)).toBe('Joint between B and A, taken apart');
    expect(jointWhere(des, js[0])).toMatch(/^(Main's end on On's start|On's start on Main's end)$/);
  });
  it('items are the same by what they point at', () => {
    expect(sameItem({ kind: 'cut', route: 0, k: 1 }, { kind: 'cut', route: 0, k: 1 })).toBe(true);
    expect(sameItem({ kind: 'cut', route: 0, k: 1 }, { kind: 'cut', route: 0, k: 2 })).toBe(false);
    expect(sameItem(undefined, undefined)).toBe(true);
    expect(sameItem(undefined, { kind: 'cutpath', id: 'c1' })).toBe(false);
  });
});

describe('a stretch dragged along its track', () => {
  /** 48 studs; stretches 8 to 16, 20 to 30, 40 to 46. */
  const three = (): DRoute => r('T', 0, 0, 0, [st(48)], { stretches: [{ from: 8, to: 16, own: {} }, { from: 20, to: 30, own: { sleepers: 'bed' } }, { from: 40, to: 46, own: {} }] });
  it('an end goes to the whole stud nearest the pointer', () => {
    expect(dragStretchEnd(three(), 1, 'from', 17.4)).toEqual({ from: 17, to: 30 });
    expect(dragStretchEnd(three(), 1, 'to', 35.6)).toEqual({ from: 20, to: 36 });
  });
  it('never into the stretch beside it, and says which', () => {
    expect(dragStretchEnd(three(), 1, 'from', 11)).toEqual({ from: 16, to: 30, why: 'Stretch 1 ends at 16: stretches can\'t run over each other' });
    expect(dragStretchEnd(three(), 1, 'to', 44)).toEqual({ from: 20, to: 40, why: 'Stretch 3 starts at 40: stretches can\'t run over each other' });
  });
  it('never past the track\'s ends, and says so', () => {
    expect(dragStretchEnd(three(), 0, 'from', -5)).toEqual({ from: 0, to: 16, why: 'The track starts here' });
    expect(dragStretchEnd(three(), 2, 'to', 60)).toEqual({ from: 40, to: 48, why: 'The track ends here (48 studs long)' });
  });
  it('never under two studs long', () => {
    expect(dragStretchEnd(three(), 1, 'from', 29.4)).toEqual({ from: 28, to: 30, why: 'A stretch is at least 2 studs long' });
    expect(dragStretchEnd(three(), 1, 'to', 12)).toEqual({ from: 20, to: 22, why: 'A stretch is at least 2 studs long' });
  });
  it('the whole stretch moves as long as it was, held at its neighbours and the track\'s ends', () => {
    expect(dragStretchWhole(three(), 1, 3.4)).toEqual({ from: 23, to: 33 });
    expect(dragStretchWhole(three(), 1, -2)).toEqual({ from: 18, to: 28 });
    expect(dragStretchWhole(three(), 1, -9)).toEqual({ from: 16, to: 26, why: 'Stretch 1 ends at 16: stretches can\'t run over each other' });
    expect(dragStretchWhole(three(), 1, 30)).toEqual({ from: 30, to: 40, why: 'Stretch 3 starts at 40: stretches can\'t run over each other' });
    expect(dragStretchWhole(three(), 0, -20)).toEqual({ from: 0, to: 8, why: 'The track starts here' });
    expect(dragStretchWhole(three(), 2, 20)).toEqual({ from: 42, to: 48, why: 'The track ends here (48 studs long)' });
    expect(dragStretchWhole(three(), 1, 0.3)).toEqual({ from: 20, to: 30 });
  });
  it('wherever it is put is a place the card would take too (stretchProblem)', () => {
    for (let k = 0; k < 3; k++) for (let s = -6; s <= 56; s += 0.7) {
      for (const end of ['from', 'to'] as const) { const t = three(), p = dragStretchEnd(t, k, end, s); expect(stretchProblem(t, p.from, p.to, k), `${k} ${end} ${s}`).toBeUndefined(); }
      const t = three(), p = dragStretchWhole(t, k, s - 20); expect(stretchProblem(t, p.from, p.to, k), `${k} whole ${s}`).toBeUndefined();
      expect(p.to - p.from).toBe(t.stretches![k].to - t.stretches![k].from);
    }
  });
  it('on a track that isn\'t a whole number of studs long, the end may go to the stud past it (built to the track\'s end)', () => {
    const t = r('C', 0, 0, 0, [cv(40, 54)], { stretches: [{ from: 10, to: 20, own: {} }] });   // 37.7 studs
    expect(dragStretchEnd(t, 0, 'to', 50)).toEqual({ from: 10, to: 38, why: 'The track ends here (37.7 studs long)' });
    expect(dragStretchWhole(t, 0, 50)).toMatchObject({ from: 28, to: 38 });
    const far = dragStretchEnd({ ...t, stretches: [{ from: 10, to: 38, own: {} }] }, 0, 'from', 37);
    expect(far).toEqual({ from: 35, to: 38, why: 'The track is 37.7 studs long: a stretch starts at 35 at most' });
  });
});

describe('how far along a track the pointer is', () => {
  it('on the track: its studs from the start; past an end: further than the track is long, or less than nothing', () => {
    const t = r('T', 0, 0, 0, [st(48)]);
    expect(alongBeyond(t, [1, 20])).toBeCloseTo(20);
    expect(alongBeyond(t, [1, 60])).toBeCloseTo(60);
    expect(alongBeyond(t, [-2, -5])).toBeCloseTo(-5);
    expect(alongBeyond(t, [3, 48])).toBeCloseTo(48);
    const bend = r('B', 0, 0, 0, [cv(40, 90)]), L = (Math.PI * 40) / 2;   // (ends at -40, 40, heading left)
    expect(alongBeyond(bend, [-50, 41])).toBeCloseTo(L + 10);
    expect(alongBeyond(bend, [-30, 41])).toBeLessThan(L);
  });
  it('so an end dragged past the track\'s end says the track ends there', () => {
    const t = r('T', 0, 0, 0, [st(48)], { stretches: [{ from: 20, to: 32, own: {} }] });
    expect(dragStretchEnd(t, 0, 'to', alongBeyond(t, [0, 47.8]))).toEqual({ from: 20, to: 48 });
    expect(dragStretchEnd(t, 0, 'to', alongBeyond(t, [0, 60]))).toEqual({ from: 20, to: 48, why: 'The track ends here (48 studs long)' });
    expect(dragStretchEnd(t, 0, 'from', alongBeyond(t, [0, -9]))).toEqual({ from: 0, to: 32, why: 'The track starts here' });
  });
});

describe('a stretch dragged out (Add a stretch)', () => {
  const t = (): DRoute => r('T', 0, 0, 0, [st(48)], { stretches: [{ from: 8, to: 16, own: {} }, { from: 30, to: 40, own: {} }] });
  it('runs from the press to where it is let go, either way round, on whole studs', () => {
    expect(newStretchAt(r('T', 0, 0, 0, [st(48)]), 10.3, 21.6)).toEqual({ from: 10, to: 22 });
    expect(newStretchAt(r('T', 0, 0, 0, [st(48)]), 21.6, 10.3)).toEqual({ from: 10, to: 22 });
  });
  it('stays in the room between the stretches there are, and says what held it', () => {
    expect(newStretchAt(t(), 20, 36)).toEqual({ from: 20, to: 30, why: 'Stretch 2 starts at 30: stretches can\'t run over each other' });
    expect(newStretchAt(t(), 26, 10)).toEqual({ from: 16, to: 26, why: 'Stretch 1 ends at 16: stretches can\'t run over each other' });
    expect(newStretchAt(t(), 4, -3)).toEqual({ from: 0, to: 4, why: 'The track starts here' });
    expect(newStretchAt(t(), 42, 70)).toEqual({ from: 42, to: 48, why: 'The track ends here (48 studs long)' });
  });
  it('from the stud where a stretch ends: beside it, the way the drag goes', () => {
    expect(newStretchAt(t(), 16, 22)).toEqual({ from: 16, to: 22 });
    expect(newStretchAt(t(), 30, 24)).toEqual({ from: 24, to: 30 });
  });
  it('is refused, with why, on a stretch, too short, or with no room', () => {
    expect(newStretchAt(t(), 12, 20)).toEqual({ problem: 'Stretch 1 is here already: drag its ends, or start beside it' });
    expect(newStretchAt(t(), 20, 21)).toEqual({ problem: 'Drag further along the track: a stretch is at least 2 studs long' });
    expect(newStretchAt(t(), 20, 20)).toEqual({ problem: 'Drag further along the track: a stretch is at least 2 studs long' });
    const tight = r('T', 0, 0, 0, [st(48)], { stretches: [{ from: 8, to: 16, own: {} }, { from: 17, to: 40, own: {} }] });
    expect(newStretchAt(tight, 16.4, 17)).toEqual({ problem: 'No room for a stretch here: under 2 studs beside the stretches there are' });
    expect(newStretchAt(r('T', 0, 0, 0, [st(1.5)]), 0, 1.5)).toEqual({ problem: 'No room for a stretch here: under 2 studs of track' });
  });
  it('what it gives is a stretch the track takes, put in order', () => {
    for (let a = -3; a <= 52; a += 1.3) for (let b = -3; b <= 52; b += 1.7) {
      const tr = t(), p = newStretchAt(tr, a, b);
      if ('problem' in p) continue;
      expect(stretchProblem(tr, p.from, p.to), `${a} ${b}`).toBeUndefined();
    }
    const { list, k } = withStretch(t().stretches, 20, 26);
    expect(list.map((s) => s.from)).toEqual([8, 20, 30]);
    expect(k).toBe(1);
    expect(withStretch(undefined, 4, 9)).toEqual({ list: [{ from: 4, to: 9, own: {} }], k: 0 });
  });
});

describe('the Expert tools switch', () => {
  const des = d([
    r('Plain', 0, 0, 0, [st(32)]),
    r('Cut', 20, 0, 0, [st(32)], { cuts: [10, 20], cutsLocked: true }),
    r('Own', 40, 0, 0, [st(32)], { own: { ballast: 'ballast', sleepers: 'sleepers' }, stretches: [{ from: 4, to: 12, own: {} }] }),
    r('One', 60, 0, 0, [st(32)], { cutsLocked: true, cuts: undefined }),
  ], { options: { sleepers: 'sleepers' } });
  it('a track with nothing of its own has no note; one with something says what, in numbers', () => {
    expect(byHandNote(des, des.routes[0])).toBeUndefined();
    expect(byHandNote(des, des.routes[1])).toBe('Has 2 cuts by hand (only these)');
    expect(byHandNote(des, des.routes[2])).toBe('Has 1 setting of its own, 1 stretch');   // (sleepers: 'sleepers' is the design's: none of its own)
    expect(byHandNote(des, des.routes[3])).toBe('Has no cuts (one part, by hand)');
    expect(byHand(des, des.routes[1])).toEqual({ cuts: 2, only: true, own: 0, stretches: 0 });
  });
  it('a setting of its own that is the design\'s is none: no note', () => {
    const same = d([r('A', 0, 0, 0, [st(8)], { own: { ballast: 'ballast' } })], { options: { ballast: 'ballast' } });
    expect(byHandNote(same, same.routes[0])).toBeUndefined();
  });
  it('the design\'s cut paths are said too', () => {
    expect(designByHandNote(des)).toBeUndefined();
    expect(designByHandNote(plan())).toBe('This design has 1 cut path');
  });
  it('the sections it hides are sections a card has', () => {
    const ids = cardSections(des, des.routes[0], { branches: false }).map((s) => s.id as string);
    for (const id of EXPERT_SECTIONS) expect(ids).toContain(id);
  });
});

describe('the Pick list', () => {
  it('Everything takes every layer; another only its own', () => {
    for (const l of ['track', 'cut', 'stretch', 'joint', 'mark'] as const) {
      expect(picks('all', l, true)).toBe(true);
      for (const p of PICKS) if (p.id !== 'all') expect(picks(p.id, l, true)).toBe(p.id === l);
    }
  });
  it('with the expert tools hidden a click takes what it always did, whatever the list was left on', () => {
    for (const p of PICKS) {
      expect(picks(p.id, 'track', false)).toBe(true);
      expect(picks(p.id, 'mark', false)).toBe(true);
      expect(picks(p.id, 'joint', false)).toBe(true);
      expect(picks(p.id, 'cut', false)).toBe(false);
      expect(picks(p.id, 'stretch', false)).toBe(false);
    }
  });
  it('every kind of item is in a layer the list has, and each entry has a name and a tip', () => {
    const layers = PICKS.map((p) => p.id as string);
    for (const k of ['route', 'table', 'cut', 'cutpath', 'stretch', 'joint'] as const) expect(layers).toContain(layerOf(k));
    for (const p of PICKS) { expect(p.label.length).toBeGreaterThan(3); expect(p.tip.length).toBeGreaterThan(10); }
    expect(isPick('cut')).toBe(true);
    expect(isPick('sleepers')).toBe(false);
    expect(isPick(undefined)).toBe(false);
  });
});
