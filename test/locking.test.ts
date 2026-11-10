import { describe, expect, it } from 'vitest';
import { type Design, readDesign } from '../src/app/design';
import { lockedOf, lockedWhy, setLocked } from '../src/app/lock';
import { parallelRoute } from '../src/app/parallelroute';

const d = (): Design => ({ version: 1, gaugeStuds: 4, routes: [
  { name: 'R3', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 20 }], locked: true },
  { name: 'R4', x: 8, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 20 }] },
], tables: [{ shape: 'rect', x: 0, y: 0, w: 10, h: 10, locked: true }, { shape: 'rect', x: 20, y: 0, w: 10, h: 10, name: 'Yard' }] });

describe('what a lock says', () => {
  it('names the locked ones: "R3 is locked"', () => {
    expect(lockedWhy(d(), [0])).toBe('R3 is locked');
    expect(lockedWhy(d(), [1])).toBeUndefined();
    expect(lockedWhy(d(), [0, 1])).toBe('R3 is locked');
    expect(lockedWhy(d(), [], [0])).toBe('Table 1 is locked');
    expect(lockedWhy(d(), [0], [0, 1])).toBe('R3 and Table 1 are locked');
    expect(lockedWhy(d(), [1], [1])).toBeUndefined();
  });
  it('lists many briefly', () => {
    const x = d(); x.routes.push({ name: 'R5', x: 0, y: 5, heading: 0, segs: [], locked: true }, { name: 'R6', x: 0, y: 6, heading: 0, segs: [], locked: true });
    expect(lockedOf(x, [0, 2, 3])).toEqual(['R3', 'R5', 'R6']);
    expect(lockedWhy(x, [0, 2, 3], [0])).toBe('R3, R5 and 2 more are locked');
  });
  it('is turned on and off, off leaving nothing in the design', () => {
    const r = d().routes[1]; setLocked(r, true); expect(r.locked).toBe(true); setLocked(r, false); expect('locked' in r).toBe(false);
  });
});

describe('a design with locks', () => {
  it('keeps them through reading and saving; an older design reads as unlocked', () => {
    const back = readDesign(JSON.parse(JSON.stringify(d())));
    expect(back.routes[0].locked).toBe(true); expect(back.routes[1].locked).toBeUndefined();
    expect(back.tables![0].locked).toBe(true); expect(back.tables![1].locked).toBeUndefined();
    const old = readDesign({ version: 1, gaugeStuds: 4, routes: [{ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 4 }] }] });
    expect(old.routes[0].locked).toBeUndefined();
  });
  it('drops a lock that is not a plain true', () => {
    const x = JSON.parse(JSON.stringify(d())); x.routes[0].locked = 'yes'; x.routes[1].locked = false; x.tables[0].locked = 1;
    const back = readDesign(x);
    expect(back.routes.map((r) => r.locked)).toEqual([undefined, undefined]);
    expect(back.tables![0].locked).toBeUndefined();
  });
});

describe('what a lock is not copied into', () => {
  it('a parallel track is not locked', () => {
    const x = d(), res = parallelRoute(x, x.routes[0], 'left', 16);
    expect('route' in res && res.route.locked).toBeFalsy();
  });
});
