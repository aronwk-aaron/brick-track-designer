// The assembly checks (assembly.shared.ts) for the bigger designs, a few to
// a file, each file a worker of its own: on CI's runners a file of all five
// ran the kernel out of memory (it aborts) by the fourth.
import type { Design } from '../src/app/design';
import { assemblySuite, threeWay } from './assembly.shared';
import { fixture } from './complex.shared';

const cases: [string, Design][] = [
  ['three-way in a network', threeWay],
  // (a tandem in a network, the first branch's rail between the second points' stock rails: their plates cut clear, pins moved, a tongue moved in)
  ['tandem in a network at R40', fixture('tandem-net-r40-tight')],
];

assemblySuite(cases);
