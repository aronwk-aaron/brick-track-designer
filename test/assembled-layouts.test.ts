// The smaller layouts go together (assembled.shared.ts).
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: layouts', { timeout: 1200000 }, () => assembledSuite(['Layouts'], ['Oval (LEGO R40)', 'Crossover (R40)', 'Double crossover (R56)', 'Yard ladder (R40)', 'Wye with a crossover']));
