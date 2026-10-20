// The assembly checks (assembly.shared.ts) for the bigger designs, in a
// worker of their own: a three-way in a network, and pieces cut to a small bed.
import { TEMPLATES, type Design } from '../src/app/design';
import { assemblySuite, crossover, threeWay } from './assembly.shared';
import { fixture } from './complex.shared';

const cases: [string, Design][] = [
  ['three-way in a network', threeWay],
  // (a tandem in a network, the first branch's rail between the second points' stock rails: their plates cut clear, pins moved, a tongue moved in)
  ['tandem in a network at R40', fixture('tandem-net-r40-tight')],
  // (cut to a small bed: the cuts may go under the loose blades, but no rail-end tongue there)
  ['crossover cut to a 128 bed', { ...crossover, options: { printBedX: 128, printBedY: 128 } }],
  ['left switch cut to a 128 bed', { ...TEMPLATES['Left switch (LEGO)'], options: { printBedX: 128, printBedY: 128 } }],
  // (a three-way's points with prototype blades, on a stand (no lock in the middle, said so; and no spring-back tongues there, said so too))
  ['three-way, spring-back on a stand, prototype blades', { ...threeWay, options: { throwAction: 'springback', throwStyle: 'stand', bladeStyle: 'prototype' } }],
];

assemblySuite(cases);
