import { describe, expect, it } from 'vitest';
import type { Design, DRoute } from '../src/app/design';
import { joinProblem } from '../src/app/routeedits';

const r = (name: string, extra: Partial<DRoute> = {}): DRoute => ({ name, x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }], ...extra });
const d = (routes: DRoute[]): Design => ({ version: 1, gaugeStuds: 4, routes });

describe('which routes can be made one track', () => {
  it('plain routes can', () => {
    expect(joinProblem(d([r('A'), r('B')]), r('A'), r('B'))).toBeUndefined();
  });
  it("monorail and train track can't", () => {
    expect(joinProblem(d([]), r('A'), r('B', { system: 'monorail' }))).toMatch(/monorail/);
  });
  it("different gauges can't", () => {
    expect(joinProblem(d([]), r('A'), r('B', { gaugeStuds: 6 }))).toMatch(/gauge/);
    expect(joinProblem(d([]), r('A', { gaugeStuds: 4 }), r('B'))).toBeUndefined();
  });
  it("guard rails on one only (or set differently) can't", () => {
    expect(joinProblem(d([]), r('A', { guardRails: true }), r('B'))).toMatch(/guard rails/);
    expect(joinProblem(d([]), r('A', { guardRails: true }), r('B', { guardRails: true }))).toBeUndefined();
    expect(joinProblem(d([]), r('A', { guardRails: true }), r('B', { guardRails: true, guardRailTaperStuds: 4 }))).toMatch(/guard rails/);
  });
  it("a third rail on one only (or a different one) can't", () => {
    expect(joinProblem(d([]), r('A'), r('B', { dualGauge: true }))).toMatch(/third rail/);
    expect(joinProblem(d([]), r('A', { dualGauge: true, dualShared: 'left' }), r('B', { dualGauge: true }))).toMatch(/third rail/);
    expect(joinProblem(d([]), r('A', { dualGauge: true }), r('B', { dualGauge: true }))).toBeUndefined();
  });
  it('monorail heights must match', () => {
    expect(joinProblem(d([]), r('A', { system: 'monorail', monoHeight: 3 }), r('B', { system: 'monorail' }))).toMatch(/heights/);
    expect(joinProblem(d([]), r('A', { system: 'monorail', monoHeight: 3 }), r('B', { system: 'monorail', monoHeight: 3 }))).toBeUndefined();
  });
});
