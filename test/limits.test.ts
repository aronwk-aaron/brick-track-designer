// The numbers' ranges: a design from a file is held to them, and no template is outside them.
import { describe, expect, it } from 'vitest';
import { type Design, readDesign, TEMPLATES } from '../src/app/design';
import { clamp, clampDesign, LIMITS, radiusRange, rangeText } from '../src/app/limits';

describe('the numbers\' ranges', () => {
  it('each default is in its range, and said plainly', () => {
    for (const [name, r] of Object.entries(LIMITS)) { expect(r[0], name).toBeLessThan(r[1]); expect(clamp(r[2], r), name).toBe(r[2]); }
    expect(rangeText(LIMITS.straight)).toBe('Range 0 to 2000, default 16.');
  });
  it('no template is outside them', () => {
    for (const [name, t] of Object.entries(TEMPLATES)) expect(clampDesign(structuredClone(t)), name).toEqual(t);
  });
  it('a design opened is held to them', () => {
    const d = readDesign({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 1e9, y: -1e9, heading: 720, monoHeight: -4, monoHeightEnd: 999,
      segs: [{ kind: 'straight', studs: 1e7 }, { kind: 'straight', studs: -5 }, { kind: 'curve', radius: 3, angle: 5000 }, { kind: 'curve', radius: 1e6, angle: -5000 }] }],
    tables: [{ shape: 'rect', x: 1e8, y: 0, w: -3, h: 1e6 }, { shape: 'arc', cx: 0, cy: 0, r0: -1, r1: 1e5, a0: -999, a1: 999 }, { shape: 'poly', pts: [[0, 0], [1e7, 0], [0, -1e7]] }] }) as Design;
    expect(d.routes[0]).toMatchObject({ x: 10000, y: -10000, heading: 360, monoHeight: 0, monoHeightEnd: 250 });
    expect(d.routes[0].segs).toEqual([{ kind: 'straight', studs: 2000 }, { kind: 'straight', studs: 0 }, { kind: 'curve', radius: 24, angle: 360 }, { kind: 'curve', radius: 1000, angle: -360 }]);
    expect(d.tables).toEqual([{ shape: 'rect', x: 10000, y: 0, w: 1, h: 2000 }, { shape: 'arc', cx: 0, cy: 0, r0: 0, r1: 2000, a0: -360, a1: 360 }, { shape: 'poly', pts: [[0, 0], [10000, 0], [0, -10000]] }]);
  });
});

describe('a route\'s radius range', () => {
  it('a monorail route takes R4 and up (as a design read from a file does), a train route R24 and up', () => {
    expect(radiusRange({ system: 'monorail' })).toBe(LIMITS.monoRadius);
    expect(radiusRange({ system: 'train' })).toBe(LIMITS.radius);
    expect(radiusRange({})).toBe(LIMITS.radius);
    expect(radiusRange({ system: 'monorail' })[0]).toBe(4);
  });
});
