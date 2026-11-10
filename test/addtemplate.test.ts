import { describe, expect, it } from 'vitest';
import { addTemplate, openEnds, placeTemplate, transformed } from '../src/app/addtemplate';
import { type Design, readDesign, TEMPLATES } from '../src/app/design';
import { follow } from '../src/app/planner';

const empty = (): Design => ({ version: 1, gaugeStuds: 4, routes: [] });
const straight = (): Design => ({ version: 1, gaugeStuds: 4, routes: [{ name: 'R1', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] }] });
const norm180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const names = (d: Design) => d.routes.map((r) => r.name);

describe('every template can be added', () => {
  for (const [name, t] of Object.entries(TEMPLATES)) {
    it(`${name}`, () => {
      for (const base of [empty(), straight()]) {
        const d = structuredClone(base), n0 = d.routes.length, tn0 = d.tables?.length ?? 0;
        const res = addTemplate(d, t, { turn: 0, dx: 5, dy: -7, mirror: false });
        expect(res.routes).toEqual(t.routes.map((_, k) => n0 + k));
        expect(d.routes.length).toBe(n0 + t.routes.length);
        expect((d.tables?.length ?? 0) - tn0).toBe(t.tables?.length ?? 0);
        // (names differ, the pieces are the template's, and the whole is a design the editor reads as it is)
        expect(new Set(names(d)).size).toBe(d.routes.length);
        const a = d.routes[n0 + 0];
        if (a) {
          // (the routes keep their places relative to the first one, shifted as one)
          t.routes.forEach((r, k) => {
            const q = d.routes[n0 + k];
            expect(q.segs).toEqual(r.segs);
            expect(q.x - a.x).toBeCloseTo(r.x - t.routes[0].x, 2); expect(q.y - a.y).toBeCloseTo(r.y - t.routes[0].y, 2);
            expect(norm180(q.heading - r.heading)).toBeCloseTo(0, 2);
          });
        }
        expect(readDesign(structuredClone(d))).toEqual(d);
      }
    });
  }
});

describe('turned and mirrored as a group', () => {
  const t = TEMPLATES['Left switch (LEGO)'];
  it('keeps the routes relative to each other when turned', () => {
    const tt = transformed(t, { turn: 90, dx: 0, dy: 0, mirror: false });
    expect(Math.hypot(tt.routes[1].x - tt.routes[0].x, tt.routes[1].y - tt.routes[0].y)).toBeCloseTo(Math.hypot(t.routes[1].x - t.routes[0].x, t.routes[1].y - t.routes[0].y), 2);
    expect(norm180(tt.routes[0].heading - t.routes[0].heading)).toBeCloseTo(90, 3);
  });
  it('a mirrored left switch is a right one (its curve the other way)', () => {
    const tt = transformed(t, { turn: 0, dx: 0, dy: 0, mirror: true });
    const curve = (d: Design) => d.routes.flatMap((r) => r.segs).find((s) => s.kind === 'curve') as { angle: number };
    expect(Math.sign(curve(tt).angle)).toBe(-Math.sign(curve(t).angle));
  });
  it('the name is kept when free, made fresh when taken', () => {
    const d = structuredClone(t); const before = names(d);
    addTemplate(d, t, { turn: 0, dx: 0, dy: 20, mirror: false });
    expect(names(d).slice(0, before.length)).toEqual(before);
    expect(new Set(names(d)).size).toBe(d.routes.length);
  });
});

describe('snapping onto open ends', () => {
  it("a switch's toe onto a straight's end: the ends coincide, the headings are opposite", () => {
    const t = TEMPLATES['Left switch (LEGO)'], d = straight(), end = follow(d.routes[0], d.routes[0].segs);
    // (the pointer near the straight's far end, the group turned any way)
    const res = placeTemplate(d, t, [end.x + 0.6, end.y + 0.4], 45, false, 3);
    expect(res.snapped).toBeDefined();
    const tt = transformed(t, res.placement), ends = openEnds(tt.routes);
    const e = ends.find((x) => x.route === res.snapped!.template.route && x.end === res.snapped!.template.end)!;
    expect(e.pose.x).toBeCloseTo(end.x, 2); expect(e.pose.y).toBeCloseTo(end.y, 2);
    expect(Math.abs(norm180(e.pose.heading - (end.heading + 180)))).toBeLessThan(0.01);
    // (one of the straight's ends it was meant for)
    expect(res.snapped!.design.route).toBe('R1');
  });
  it('with nothing near it lands on the stud grid, unturned by the snap', () => {
    const t = TEMPLATES['Left switch (LEGO)'], res = placeTemplate(straight(), t, [40.3, 22.6], 22.5, false, 3);
    expect(res.snapped).toBeUndefined();
    const tt = transformed(t, res.placement);
    expect(tt.routes[0].x).toBe(40); expect(tt.routes[0].y).toBe(23); expect(res.placement.turn).toBe(22.5);
  });
  it("starts on a given end ('onto') whatever the pointer", () => {
    const t = TEMPLATES['Left switch (LEGO)'], d = straight(), onto = openEnds(d.routes).find((e) => e.end === 'end')!;
    const res = placeTemplate(d, t, [100, 100], 0, false, 3, onto);
    expect(res.snapped?.design).toEqual(onto);
  });
  it("won't snap a narrow gauge onto standard track (and says why)", () => {
    const t: Design = { version: 1, gaugeStuds: 3, routes: [{ name: 'N', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }] }] };
    const d = straight(), end = follow(d.routes[0], d.routes[0].segs);
    const res = placeTemplate(d, t, [end.x, end.y], 0, false, 3);
    expect(res.snapped).toBeUndefined(); expect(res.why).toMatch(/gauge/);
    // (added, it keeps its own gauge)
    addTemplate(d, t, res.placement);
    expect(d.routes[1].gaugeStuds).toBe(3);
  });
  it("does not offer an end that joins something, nor a branch's start on its main line", () => {
    const sw = TEMPLATES['Left switch (LEGO)'], ends = openEnds(sw.routes);
    expect(ends.length).toBe(3);
  });
});

describe('what comes along', () => {
  it('says which of the template’s settings differ from the design’s', () => {
    const d = straight(), t: Design = { ...straight(), options: { bottomStyle: 'grid' as never, ballast: 'ballast' } };
    const res = addTemplate(d, t, { turn: 0, dx: 0, dy: 10, mirror: false });
    expect(res.differing.sort()).toEqual(['ballast', 'bottomStyle']);
    expect(d.options).toBeUndefined();
  });
  it('brings hand edits and settings on routes with it', () => {
    const t: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, guardRails: true, segs: [{ kind: 'straight', studs: 10 }] }],
      trackwork: { throw: { '40,80': { on: ['A', 's', 80, 0], side: 'left' } as never } } as never };
    const d = straight(); d.routes[0].name = 'A';
    addTemplate(d, t, { turn: 0, dx: 20, dy: 0, mirror: false });
    expect(d.routes[1].name).not.toBe('A'); expect(d.routes[1].guardRails).toBe(true);
    const tw = d.trackwork as unknown as { throw: Record<string, { on: [string, string, number, number] }> };
    expect(Object.values(tw.throw)[0].on[0]).toBe(d.routes[1].name);
  });
});
