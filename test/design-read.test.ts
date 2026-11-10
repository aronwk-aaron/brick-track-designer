// Opening a design (a file, or the one kept in the browser): what isn't a design is turned away saying why, before
// the editor takes it; what's only partly wrong keeps its track.
import { describe, expect, it } from 'vitest';
import { type Design, readDesign, TEMPLATES } from '../src/app/design';

const ok: Design = { version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 40, angle: 22.5 }] }] };
const but = (patch: object) => ({ ...structuredClone(ok), ...patch });
const route = (patch: object) => ({ ...structuredClone(ok), routes: [{ ...structuredClone(ok.routes[0]), ...patch }] });

describe('opening a design', () => {
  it('takes a design as it is', () => {
    expect(readDesign(structuredClone(ok))).toEqual(ok);
    for (const [name, t] of Object.entries(TEMPLATES)) expect(readDesign(structuredClone(t)), name).toEqual(t);
  });
  it("turns away what isn't a design", () => {
    for (const v of [null, 5, 'text', [], {}, { routes: 'none' }, { version: 1, routes: {} }]) expect(() => readDesign(v)).toThrow(/isn't a track design/);
    expect(() => readDesign(but({ version: 2 }))).toThrow(/newer version/);
  });
  it('says which route is wrong, and how', () => {
    expect(() => readDesign(but({ routes: [ok.routes[0], null] }))).toThrow(/route 2 isn't a route/);
    expect(() => readDesign(route({ x: '0' }))).toThrow(/route 1 \(A\) has no start x/);
    expect(() => readDesign(route({ heading: null }))).toThrow(/has no heading/); // (a NaN, saved as JSON)
    expect(() => readDesign(route({ segs: undefined }))).toThrow(/has no pieces/);
    expect(() => readDesign(route({ segs: [{ kind: 'straight', studs: 16 }, { kind: 'spiral' }] }))).toThrow(/piece 2 is neither/);
    expect(() => readDesign(route({ segs: [{ kind: 'curve', radius: 0, angle: 10 }] }))).toThrow(/piece 1 is neither/);
    expect(() => readDesign(route({ segs: [{ kind: 'straight' }] }))).toThrow(/piece 1 is neither/);
  });
  it('leaves out the rest where it is not what it should be, and keeps the track', () => {
    const d = readDesign({ ...route({ name: 7 }), gaugeStuds: 'four', name: 12, options: 'none', trackwork: { points: 'x', check: { '1,2': { off: true }, '3,4': 5 } },
      tables: [{ shape: 'rect', x: 0, y: 0, w: 32, h: 64 }, { shape: 'rect', x: 0 }, { shape: 'blob' }, { shape: 'poly', pts: [[0, 0], [1, 'a'], [2, 2]] }, null] });
    expect(d.gaugeStuds).toBe(4);
    // (each setting by itself: the ones that are what they should be are kept)
    const o = readDesign(but({ options: { ballast: 5, joint: {}, printBedX: 'wide', sleepers: null, pointThrow: 2.5, grip: 'all', endSupports: false, raisedOn: 'lego', flangeway: null } })).options;
    expect(o).toEqual({ pointThrow: 2.5, grip: 'all', endSupports: false, raisedOn: 'lego' });
    expect(d.name).toBeUndefined();
    expect(d.options).toBeUndefined();
    expect(d.trackwork).toEqual({ check: { '1,2': { off: true } } });
    expect(d.tables).toEqual([{ shape: 'rect', x: 0, y: 0, w: 32, h: 64 }]);
    expect(d.routes[0].name).toBe('');
    expect(d.routes[0].segs).toEqual(ok.routes[0].segs);
  });
  it('brings an old design up to date, as before', () => {
    const d = readDesign({ version: 1, gaugeStuds: 4, routes: ok.routes, grip: 'all', options: { joint: 'ends', throwAction: 'springback' } });
    expect(d.options).toMatchObject({ grip: 'all', splitTrack: 'lengths', throwAction: 'detent', bladeStyle: 'sprung' });
    expect((d.options as { joint?: string }).joint).toBeUndefined();
    // (a design from before there were versions, gauges or names: the track is all there was)
    expect(readDesign({ routes: ok.routes })).toEqual(ok);
  });
});
