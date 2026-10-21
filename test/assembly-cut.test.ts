// The assembly checks (assembly.shared.ts) for the bigger designs, a few to
// a file, each file a worker of its own: on CI's runners a file of all five
// ran the kernel out of memory (it aborts) by the fourth.
import { TEMPLATES, type Design } from '../src/app/design';
import { assemblySuite, crossover, threeWay } from './assembly.shared';

const cases: [string, Design][] = [
  // (cut to a small bed: the cuts may go under the loose blades, but no rail-end tongue there)
  ['crossover cut to a 128 bed', { ...crossover, options: { printBedX: 128, printBedY: 128 } }],
  ['left switch cut to a 128 bed', { ...TEMPLATES['Left switch (LEGO)'], options: { printBedX: 128, printBedY: 128 } }],
  // (a three-way's points with prototype blades, on a stand (no lock in the middle, said so; and no spring-back tongues there, said so too))
  ['three-way, spring-back on a stand, prototype blades', { ...threeWay, options: { throwAction: 'springback', throwStyle: 'stand', bladeStyle: 'prototype' } }],
];

assemblySuite(cases);
