// The assembly checks (assembly.shared.ts) for the bigger designs, in a
// worker of their own: a three-way in a network, and pieces cut to a small bed.
import { TEMPLATES, type Design } from '../src/app/design';
import { assemblySuite, crossover, threeWay } from './assembly.shared';

const cases: [string, Design][] = [
  ['three-way in a network', threeWay],
  // (cut to a small bed: the cuts may go under the loose blades, but no rail-end tongue there)
  ['crossover cut to a 128 bed', { ...crossover, options: { printBedX: 128, printBedY: 128 } }],
  ['left switch cut to a 128 bed', { ...TEMPLATES['Left switch (LEGO)'], options: { printBedX: 128, printBedY: 128 } }],
];

assemblySuite(cases);
