// Designs cut for a small print bed and at baseplate edges (complex.shared.ts):
// aaron3 with rail-end tongues ran the kernel out of memory (a minute's build:
// BTD_HEAVY=1 npx vitest run test/complex-cut.test.ts).
import { complexSuite, fixture } from './complex.shared';

complexSuite([
  ['a double crossover on 32-stud baseplates, a 128 bed', fixture('scissors-r56-128-plates')],
  ['two crossovers, one each way, on 48-stud baseplates', fixture('two-crossovers-plates')],
  ['Aaron\'s three tracks with crossovers and three-ways, on a 128 bed, rail-end tongues', fixture('aaron3-tongues'), [], {}, false, true],
]);
