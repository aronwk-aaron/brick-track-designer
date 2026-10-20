// Double crossovers at several radii, one drawn backwards, one on ballast (complex.shared.ts).
import { complexSuite, fixture } from './complex.shared';

complexSuite([
  ['double crossover, R40', fixture('scissors-r40')],
  ['double crossover, R200', fixture('scissors-r200')],
  ['double crossover, R56, a track and both crossovers drawn backwards', fixture('scissors-r56-reversed')],
  ['double crossover, R56, on ballast with the buddy layer', fixture('scissors-r56-buddy')],
  ['double crossover, R104, points on tines', fixture('scissors-r104'), [], { mechStyle: 'tines' }],
  ['three-ways in a network on buddy ballast: spring-back on stands, prototype blades', fixture('threeway-net-split-merge'), [/spring-back tongues/, /switch stand locks/], { throwAction: 'springback', throwStyle: 'stand', bladeStyle: 'prototype', ballast: 'buddy' }],
]);
