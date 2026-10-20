// Ladders, switches on curves, crossovers between curves, tandems and cascades,
// and designs that can't work as drawn (they say so) (complex.shared.ts).
import { TEMPLATES } from '../src/app/design';
import { complexSuite, fixture } from './complex.shared';

complexSuite([
  ['a ladder of three yard tracks', fixture('ladder-r40')],
  ['a ladder, its main line and some yard tracks drawn backwards', fixture('ladder-r40-reversed')],
  ['switches on a curve, inside and outside', fixture('curve-switches')],
  ['a crossover between two curves', fixture('curve-crossover')],
  ['a switch on the branch past the first one\'s frog', fixture('cascade')],
  ['two switches the same side, one after the other', fixture('tandem-same-side')],
  ['the tandem three-way template', TEMPLATES['Three-way switch (tandem, two throws)']],
  ['points inside another switch\'s frog: a warning', fixture('points-in-frog'), [/rail between their stock rails/], {}, true],
  ['a tandem in a network: a warning', fixture('tandem-net'), [/rail between their stock rails/], {}, true],
  ['a ladder\'s diagonal ending in its last points: a warning', fixture('ladder-end-in-points'), [/ends in the points/], {}, true],
]);
