// The assembly checks (assembly.shared.ts) for the bigger designs, in a
// worker of their own: a three-way in a network, and pieces cut to a small bed.
import { TEMPLATES, type Design } from '../src/app/design';
import { assemblySuite, crossover, threeWay } from './assembly.shared';

const cases: [string, Design][] = [
  ['three-way in a network', threeWay],
  // (cut to a small bed: the cuts may go under the loose blades, but no rail-end tongue there)
  ['crossover cut to a 128 bed', { ...crossover, options: { printBedX: 128, printBedY: 128 } }],
  ['left switch cut to a 128 bed', { ...TEMPLATES['Left switch (LEGO)'], options: { printBedX: 128, printBedY: 128 } }],
  // (a three-way's points with spring-back tongues and prototype blades, on a stand: the stand has no lock in the middle, said so)
  ['three-way, spring-back on a stand, prototype blades', { ...threeWay, options: { throwAction: 'springback', throwStyle: 'stand', bladeStyle: 'prototype' } }],
  ['left switch with everything, cut to a 128 bed', { ...TEMPLATES['Left switch (LEGO)'], options: { printBedX: 128, printBedY: 128, throwAction: 'springback', throwStyle: 'stand', bladeStyle: 'prototype' } }],
];

assemblySuite(cases);
