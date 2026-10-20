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
  // (the first branch's rail runs on between the second points' stock rails: 4DBrix's blade plates cut clear of it, a pin moved in)
  ['the tandem three-way template', TEMPLATES['Three-way switch (tandem, two throws)']],
  ['the tandem three-way template, points on tines', TEMPLATES['Three-way switch (tandem, two throws)'], [], { mechStyle: 'tines' }],
  ['a tandem in a network at R40: the plates cut clear', fixture('tandem-net-r40')],
  ['a tandem in a network at R40, tighter: a tongue moved in too', fixture('tandem-net-r40-tight')],
  // (where another track's rail crosses a blade between its toe and heel, or a blade's pin or tongue has no room: still a warning)
  ['points inside another switch\'s frog: a warning', fixture('points-in-frog'), [/rail between their stock rails/], {}, true],
  ['a tandem in a network: a warning (the first branch crosses the second points\' blade at its heel)', fixture('tandem-net'), [/rail between their stock rails/], {}, true],
  ['a tandem the other way: a warning (the same)', fixture('tandem-opposite'), [/rail between their stock rails/], {}, true],
  ['a ladder\'s diagonal ending in its last points: a warning', fixture('ladder-end-in-points'), [/ends in the points/], {}, true],
]);
