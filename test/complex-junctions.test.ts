// Three-ways and wyes, alone and in networks, splitting and merging (complex.shared.ts).
import { TEMPLATES } from '../src/app/design';
import { complexSuite, fixture } from './complex.shared';

complexSuite([
  ['three-way, R56', fixture('threeway-r56')],
  ['three-way, R56, points on tines (a part per blade)', fixture('threeway-r56'), [], { mechStyle: 'tines' }],
  ['three-way, R56, prototype blades on ballast', fixture('threeway-r56'), [], { bladeStyle: 'prototype', ballast: 'ballast' }],
  ['left switch, points on tines in two parts', TEMPLATES['Left switch (LEGO)'], [], { mechStyle: 'tines', pointsPieces: 2 }],
  ['three-way whose branches cross the tracks either side', fixture('threeway-crossing')],
  ['three-ways splitting and merging in a network, the merging one drawn from the middle track', fixture('threeway-net-reversed')],
  ['a wye, a crossover and a wye merging back', fixture('wye-loop-crossover'), [], { throwStyle: 'bracket' }],
  ['a wye whose branches cross a track', fixture('wye-crossing')],
]);
