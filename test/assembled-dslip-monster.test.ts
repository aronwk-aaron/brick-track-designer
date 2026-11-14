// The double slip monster crossover's parts go together (assembled.shared.ts): three tracks, a three-way at each end of the centre one, four R104 double slips.
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: the double slip monster crossover', { timeout: 1800000 }, () => assembledSuite(['TrixBrix trackwork'], ['Double slip monster crossover R104']));
