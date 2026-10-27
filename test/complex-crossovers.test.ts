// Double crossovers at several radii, one drawn backwards, one on ballast (complex.shared.ts).
import { complexSuite, fixture } from './complex.shared';

complexSuite([
  ['double crossover, R40', fixture('double-crossover-r40')],
  ['double crossover, R200', fixture('double-crossover-r200')],
  ['double crossover, R56, a track and both crossovers drawn backwards', fixture('double-crossover-r56-reversed')],
  ['double crossover, R56, on ballast with the buddy layer', fixture('double-crossover-r56-buddy')],
  ['double crossover, R104, points on tines', fixture('double-crossover-r104'), [], { mechStyle: 'tines' }],
  ['three-ways in a network on buddy ballast: on stands, prototype blades', fixture('threeway-net-split-merge'), [/switch stand locks/], { throwStyle: 'stand', bladeStyle: 'prototype', ballast: 'buddy' }],
]);
