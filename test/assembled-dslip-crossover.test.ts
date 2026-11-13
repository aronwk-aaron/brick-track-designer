// The double slip crossover's parts go together (assembled.shared.ts): four R104 double slips, the diagonals crossing between them.
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: the double slip crossover', { timeout: 1800000 }, () => assembledSuite(['TrixBrix trackwork'], ['Double slip crossover R104']));
