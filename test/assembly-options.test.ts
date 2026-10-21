// The assembly checks (assembly.shared.ts) for the switches' options, in a
// worker of their own: run after the rest in one file, a crossover's checks
// crawled (the kernel's memory, after twenty builds).
import { TEMPLATES, type Design } from '../src/app/design';
import { assemblySuite, crossover } from './assembly.shared';

const cases: [string, Design][] = [
  ['left switch, switch stand', { ...TEMPLATES['Left switch (LEGO)'], options: { throwStyle: 'stand' } }],
  ['left switch, over-centre spring', { ...TEMPLATES['Left switch (LEGO)'], options: { throwAction: 'overcentre' } }],
  ['left switch, spring-back points on a stand', { ...TEMPLATES['Left switch (LEGO)'], options: { throwAction: 'springback', throwStyle: 'stand' } }],
  ['left switch, prototype blades', { ...TEMPLATES['Left switch (LEGO)'], options: { bladeStyle: 'prototype' } }],
  ['left switch, prototype blades and over-centre spring', { ...TEMPLATES['Left switch (LEGO)'], options: { bladeStyle: 'prototype', throwAction: 'overcentre' } }],
  ['wye on ballast, stand and prototype blades', { ...TEMPLATES['Wye switch'], options: { ballast: 'buddy', throwStyle: 'stand', bladeStyle: 'prototype' } }],
  ['crossover, over-centre spring and prototype blades', { ...crossover, options: { throwAction: 'overcentre', bladeStyle: 'prototype' } }],
  ['crossover, spring-back points on stands', { ...crossover, options: { throwAction: 'springback', throwStyle: 'stand' } }],
  ['left switch with everything, cut to a 128 bed', { ...TEMPLATES['Left switch (LEGO)'], options: { printBedX: 128, printBedY: 128, throwAction: 'springback', throwStyle: 'stand', bladeStyle: 'prototype' } }],
];

assemblySuite(cases);
