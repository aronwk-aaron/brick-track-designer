import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../src/app/design';
import { cardSections, dualSummary, guardSummary, lockedOptions } from '../src/app/cardsections';
import type { Design, DRoute } from '../src/app/design';

const d: Design = { version: 1, gaugeStuds: 4, routes: [] };
const route = (extra: Partial<DRoute> = {}): DRoute => ({ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 8 }], ...extra });
const ids = (r: DRoute, branches = false) => cardSections(d, r, { branches }).map((s) => s.id);

describe('which sections a route card shows', () => {
  const trains: [string, Partial<DRoute>][] = [['plain', {}], ['guard rails', { guardRails: true }], ['dual gauge', { dualGauge: true }], ['both', { guardRails: true, dualGauge: true }]];
  for (const [name, extra] of trains) {
    for (const branches of [false, true]) {
      it(`train track, ${name}${branches ? ', branching' : ''}: Guard rails and Dual gauge are sections of their own, in a fixed order`, () => {
        const got = ids(route(extra), branches);
        expect(got).toEqual(['shape', 'place', 'ends', 'guard', 'dual', 'bed', 'sleepers', 'rails', ...(branches ? ['levers'] : []), 'height', 'cuts']);
      });
    }
  }
  it('a monorail shows neither guard rails, dual gauge nor ends, whatever is left on the route', () => {
    expect(ids(route({ system: 'monorail', guardRails: true, dualGauge: true, startEnd: 'buffer' }))).toEqual(['shape', 'place', 'height']);
    expect(cardSections(d, route({ system: 'monorail' }), { branches: false }).at(-1)!.title).toBe('Height');
  });
  it('shows the lever section for a route with a lever side set, branching or not', () => {
    expect(ids(route({ throwSide: 'left' }))).toContain('levers');
    expect(ids(route({ throwSide: 'auto' }))).not.toContain('levers');
    expect(ids(route({ system: 'monorail', throwSide: 'right' }))).toContain('levers');
  });
  it('a section with a switch says on or off, and off is one short line', () => {
    const off = cardSections(d, route(), { branches: false }), on = cardSections(d, route({ guardRails: true, dualGauge: true }), { branches: false });
    expect(off.filter((s) => s.on !== undefined).map((s) => [s.id, s.on, s.summary])).toEqual([['guard', false, 'off'], ['dual', false, 'off']]);
    expect(on.filter((s) => s.on !== undefined).every((s) => s.on && s.summary.startsWith('on · '))).toBe(true);
  });
  it('every section has a title and a summary', () => {
    for (const r of [route(), route({ guardRails: true, guardRailEnds: 'both' }), route({ dualGauge: true, dualShared: 'centre' }), route({ system: 'monorail', monoHeight: 3, monoHeightEnd: 6 }), route({ throwSide: 'right' })])
      for (const s of cardSections(d, r, { branches: true })) { expect(s.title).not.toBe(''); expect(s.summary).not.toBe(''); }
  });
  it('summaries say what is set', () => {
    expect(guardSummary(route({ guardRails: true, guardRailEnds: 'both', guardRailGapStuds: 1 }))).toBe('on · points at both ends, gap 1 stud');
    expect(dualSummary(d, route({ dualGauge: true, dualShared: 'left' }))).toBe('on · 2 of 4 studs, left rail shared');
    expect(dualSummary(d, route({ dualGauge: true, dualShared: 'centre' }))).toContain('centred');
  });
  it('every locked option has a reason', () => {
    for (const r of [route(), route({ guardRails: true }), route({ guardRails: true, guardRailEnds: 'start' }), route({ guardRails: true, guardRailEnds: 'none' })])
      for (const [k, why] of Object.entries(lockedOptions(r))) { expect(k).not.toBe(''); expect(why.length).toBeGreaterThan(5); }
    expect(Object.keys(lockedOptions(route({ guardRails: true })))).toEqual(['Point length', 'Point shape', 'Nose ramp']);
    expect(lockedOptions(route({ guardRails: true, guardRailEnds: 'both' }))).toEqual({});
  });
});

describe('guard rails and dual gauge are one or the other', () => {
  const sec = (r: DRoute, id: string) => cardSections(d, r, { branches: false }).find((x) => x.id === id)!;
  it('with dual gauge on, the guard rails switch is locked with a reason; and the other way round', () => {
    expect(sec(route({ dualGauge: true }), 'guard').locked).toMatch(/not with dual gauge/);
    expect(sec(route({ guardRails: true }), 'dual').locked).toMatch(/not with guard rails/);
    expect(sec(route({ dualGauge: true }), 'dual').locked).toBeUndefined();
    expect(sec(route({ guardRails: true }), 'guard').locked).toBeUndefined();
    expect(sec(route(), 'guard').locked).toBeUndefined(); expect(sec(route(), 'dual').locked).toBeUndefined();
  });
  it('a route that has both (an older file) is unlocked, with a note on both sections that says they clash', () => {
    for (const id of ['guard', 'dual']) { const s = sec(route({ guardRails: true, dualGauge: true }), id); expect(s.locked).toBeUndefined(); expect(s.note).toMatch(/clash/); }
    expect(sec(route({ guardRails: true }), 'guard').note).toBeUndefined();
  });
  it('which templates have both on one route (listed: they open as they are)', () => {
    const both = Object.entries(TEMPLATES).filter(([, t]) => t.routes.some((r) => r.guardRails && r.dualGauge)).map(([n]) => n);
    expect(both).toEqual([]);
  });
});
