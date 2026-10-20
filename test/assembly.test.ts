// (the checks in assembly.shared.ts; the bigger designs in assembly-big.test.ts, a worker of their own)
import { TEMPLATES, type Design } from '../src/app/design';
import { assemblySuite, crossover } from './assembly.shared';

const crossoverT = () => crossover;
const cases: [string, Design][] = [
  ['left switch', TEMPLATES['Left switch (LEGO)']],
  ['left switch, points on tines', { ...TEMPLATES['Left switch (LEGO)'], options: { mechStyle: 'tines' } }],
  ['crossover, points on tines', { ...crossoverT(), options: { mechStyle: 'tines' } }],
  ['wye on ballast', { ...TEMPLATES['Wye switch'], options: { ballast: 'buddy' } }],
  ['left switch, lever on a bracket', { ...TEMPLATES['Left switch (LEGO)'], options: { throwStyle: 'bracket' } }],
  ['left switch on ballast, layered points', { ...TEMPLATES['Left switch (LEGO)'], options: { ballast: 'buddy', pointsModule: 'layers', mechStyle: 'tines' } }],
  ['crossover', crossover],
  ['left switch, 4DBrix points', { ...TEMPLATES['Left switch (LEGO)'], options: { mechStyle: '4dbrix' } }],
  ['wye on ballast, 4DBrix points', { ...TEMPLATES['Wye switch'], options: { ballast: 'buddy', mechStyle: '4dbrix' } }],
  ['crossover, 4DBrix points', { ...crossover, options: { mechStyle: '4dbrix' } }],
];

assemblySuite(cases);
