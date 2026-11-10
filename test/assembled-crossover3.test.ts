// The three-track crossover goes together (assembled.shared.ts), in a worker of its own.
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: the three-track crossover', { timeout: 1800000 }, () => assembledSuite(['TrixBrix trackwork'], ['Crossover, three tracks, R104']));
