// The warnings about points (warnings.shared.ts): the ones not already asserted where their feature is tested
// (forced points and branches taken out: switch-edits; throws that meet: double-slip, nail-switch; a blade kept:
// single-point; points at an angle to the grid: slider-grid; a rail through a tandem's points: fdb-plates).
import { describe, it } from 'vitest';
import { C, D, fires, R, S, SWITCH, THREE_WAY } from './warnings.shared';

describe('warnings: points', { timeout: 600000 }, () => {
  it('tines: no room between the blades for them, and a fork too wide for the lever', async () => {
    await fires(/not enough room between the blades for the spring tines/, D(SWITCH(), { mechStyle: 'tines', pointThrow: 9, springPreload: 3 }), D(SWITCH(), { mechStyle: 'tines' }));
    await fires(/the fork's mouth is too wide to hold the lever's tip/, D(SWITCH(), { mechStyle: 'tines', pointThrow: 9, springPreload: 3 }), D(SWITCH(), { mechStyle: 'tines' }));
  });
  it('the over-centre spring, left out on tines and on a three-way', async () => {
    await fires(/the over-centre spring, the switch stand and the prototype blades are only built with blades on top: left out/, D(SWITCH(), { mechStyle: 'tines', throwAction: 'overcentre' }), D(SWITCH(), { throwAction: 'overcentre' }));
    await fires(/a three-way's points have three positions: the over-centre spring has two/, D(THREE_WAY(), { throwAction: 'overcentre' }), D(THREE_WAY()));
  });
  it('a switch stand: the over-centre spring left out, and a three-way\'s middle not locked', async () => {
    await fires(/a switch stand locks the points at each end, so a train can't push them over: the over-centre spring is left out/, D(SWITCH(), { throwAction: 'overcentre', throwStyle: 'stand' }), D(SWITCH(), { throwStyle: 'stand' }));
    await fires(/a switch stand locks at its two ends: a three-way's middle \(straight\) position is with the handle upright, not locked/, D(THREE_WAY(), { throwStyle: 'stand' }), D(SWITCH(), { throwStyle: 'stand' }));
  });
  it('rigid blades: no lip over the front', async () => {
    await fires(/rigid blades have no lip over the front/, D(SWITCH(), { ballast: 'none', bladeStyle: 'simple', bladeLip: 'front' }), D(SWITCH(), { ballast: 'none', bladeStyle: 'prototype', bladeLip: 'front' }));
  });
  it('a track that ends in the points', async () => {
    await fires(/a track ends in the points at 0, 0 \(studs\): carry it on past the frog: lengthen Branch by \d+ studs?$/, D([R('Straight', 0, 0, 0, [S(32)]), R('Branch', 0, 0, 0, [C(40, 12)])]), D(SWITCH()));
  });
  it('two branches off one side at the same point', async () => {
    const two = [R('Straight', 0, 0, 0, [S(40)]), R('B1', 0, 0, 0, [C(40, 30), S(10)]), R('B2', 0, 0, 0, [C(72, 30), S(10)])];
    await fires(/two branches leave one side of a route at the same point: not built as a three-way/, D(two), D(THREE_WAY()));
  });
  it('another track\'s rail through the points (a tandem\'s second set too near the first)', async () => {
    const tandem = (y: number) => D([R('Straight', 0, 0, 0, [S(36)]), R('Left', 0, 0, 0, [C(40, 22.5), S(23)]), R('Right', 0, y, 0, [C(40, -22.5), S(14)])]);
    await fires(/the points at 0, 2 \(studs\) have another track's rail between their stock rails/, tandem(2), tandem(8));
  });
});
