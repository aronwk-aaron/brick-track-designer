// Snapping a part's end onto the design's feels as in the layout designer: the same cases its two apps run
// (test/fixtures/snap-vectors.json, copied from it; BTD has no Snap strength setting, so only its "gentle" reach cases).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addTemplate, openEnds, placeTemplate, transformed } from '../src/app/addtemplate';
import type { Design } from '../src/app/design';
import { partDesign } from '../src/app/palette';
import { follow } from '../src/app/planner';
import { type Candidate, pick, reachStuds, SnapSession, SpeedMeter } from '../src/app/snapfeel';

interface VC { m: string; t: string; d: number; c: number; u?: number }
const V = JSON.parse(readFileSync(new URL('./fixtures/snap-vectors.json', import.meta.url), 'utf8')) as {
  reach: { name: string; pxPerStud: number; strength: string; coarse?: boolean; reach: number }[];
  pick: { name: string; reach: number; lock: string | null; candidates: VC[]; expect: string | null; fast?: boolean; bypass?: boolean }[];
  speed: { name: string; samples: [number, number, number][]; speed: number; fast: boolean }[];
  session: { name: string; reach: number; frames: { samples?: [number, number, number][]; candidates: VC[]; expect: string | null; final?: boolean; bypass?: boolean }[] }[];
};
const cands = (cs: VC[]): Candidate[] => cs.map((c) => ({ movingKey: c.m, targetKey: c.t, dist: c.d, mouseDist: c.c, turn: Math.abs(c.u ?? 0) }));
const said = (cs: Candidate[], i: number) => (i < 0 ? null : `${cs[i].movingKey}>${cs[i].targetKey}`);
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

describe('the layout designer\'s snap cases', () => {
  for (const c of V.reach.filter((q) => q.strength === 'gentle')) it(`reach: ${c.name}`, () => expect(reachStuds(c.pxPerStud, !!c.coarse)).toBeCloseTo(c.reach, 9));
  for (const c of V.pick) it(`pick: ${c.name}`, () => {
    const cs = cands(c.candidates), [m, t] = c.lock?.split('>') ?? [];
    expect(said(cs, pick(cs, c.lock ? { movingKey: m, targetKey: t } : undefined, c.reach, !!c.fast, !!c.bypass))).toBe(c.expect);
  });
  for (const c of V.speed) it(`speed: ${c.name}`, () => {
    const s = new SpeedMeter();
    for (const [x, y, t] of c.samples) s.sample(x, y, t);
    expect(s.speed()).toBeCloseTo(c.speed, 6); expect(s.isFast()).toBe(c.fast);
  });
  for (const c of V.session) it(`session: ${c.name}`, () => {
    const s = new SnapSession();
    for (const f of c.frames) {
      for (const [x, y, t] of f.samples ?? []) s.meter.sample(x, y, t);
      const cs = cands(f.candidates);
      expect(said(cs, s.step(cs, c.reach, !!f.bypass, !!f.final))).toBe(f.expect);
    }
  });
});

describe('a part from the palette placed near an open end', () => {
  const straight = (): Design => ({ version: 1, gaugeStuds: 4, routes: [{ name: 'R1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }] });
  it('an R40 curve: its end exactly on the straight\'s, heading on along it, whichever way it was turned', () => {
    const d = straight(), end = follow(d.routes[0], d.routes[0].segs);
    for (const turn of [0, 30, -100, 170]) {
      const t = partDesign(d, 'lego-r40', 1), res = placeTemplate(d, t, [end.x + 0.4, end.y + 0.3], turn, false, 1.75);
      expect(res.snapped?.design.route).toBe('R1');
      addTemplate(d, t, res.placement);
      const r = d.routes[d.routes.length - 1], at = res.snapped!.template.end === 'start' ? { x: r.x, y: r.y, heading: r.heading } : (() => { const e = follow(r, r.segs); return { ...e, heading: e.heading + 180 }; })();
      expect(Math.abs(at.x - end.x)).toBeLessThan(6e-4); expect(Math.abs(at.y - end.y)).toBeLessThan(6e-4);
      expect(Math.abs(norm180(at.heading - end.heading))).toBeLessThan(6e-4);
      d.routes.pop();
    }
  });
  it('of a part\'s two ends, the one that turns least joins (a straight laid either way round)', () => {
    const d = straight(), end = follow(d.routes[0], d.routes[0].segs), t = partDesign(d, 'bt-s08');
    // (turned half round, its far end is the one at the pointer: that one joins, no turn needed)
    const a = placeTemplate(d, t, [end.x, end.y], 0, false, 1.75), b = placeTemplate(d, t, [end.x, end.y + 8], 180, false, 1.75);
    expect(a.snapped?.template.end).toBe('start'); expect(b.snapped?.template.end).toBe('end');
    expect(Math.abs(b.placement.turn)).toBe(180);
  });
  it('of two open ends in reach, the nearer one; a held one kept until clearly beaten', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [
      { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }, { name: 'B', x: 2, y: 30, heading: 180, segs: [{ kind: 'straight', studs: 13 }] }] };
    const ends = openEnds(d.routes), aEnd = ends.find((e) => e.route === 'A' && e.end === 'end')!, t = partDesign(d, 'lego-r40', 1), s = new SnapSession();
    const near = placeTemplate(d, t, [0, 16.4], 0, false, 3, undefined, ends, { session: s });
    expect(near.snapped?.design).toEqual(aEnd);
    // (B's end at (2, 17): a little nearer now, not clearly: held on A)
    const held = placeTemplate(d, t, [1, 16.6], 0, false, 3, undefined, ends, { session: s });
    expect(held.snapped?.design.route).toBe('A');
    const moved = placeTemplate(d, t, [2, 17], 0, false, 3, undefined, ends, { session: s });
    expect(moved.snapped?.design.route).toBe('B');
  });
  it('onto an angled end (a curve\'s): the next curve carries on at exactly its heading', () => {
    const d: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'C', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: 22.5 }] }] };
    const end = follow(d.routes[0], d.routes[0].segs), t = partDesign(d, 'lego-r40', 1);
    const res = placeTemplate(d, t, [end.x + 0.3, end.y - 0.2], 0, false, 1.75);
    expect(res.snapped?.design.route).toBe('C');
    addTemplate(d, t, res.placement);
    const r = d.routes[1];
    // (a placed group's starts are kept to a thousandth of a stud: transformed())
    expect(Math.abs(r.x - end.x)).toBeLessThan(6e-4); expect(Math.abs(r.y - end.y)).toBeLessThan(6e-4); expect(Math.abs(norm180(r.heading - end.heading))).toBeLessThan(6e-4);
    expect(Math.abs(norm180(follow(r, r.segs).heading - 45))).toBeLessThan(6e-4);
  });
  it('a switch part comes as its two tracks from one toe', () => {
    const t = partDesign(straightD(), 'lego-switch-l');
    expect(t.routes.length).toBe(2); expect(openEnds(transformed(t, { turn: 0, dx: 0, dy: 0, mirror: false }).routes).length).toBe(3);
  });
});
function straightD(): Design { return { version: 1, gaugeStuds: 4, routes: [] }; }
