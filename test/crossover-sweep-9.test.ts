// A crossover between parallel tracks 9 studs apart goes together whatever the straights' length (crossover-sweep.shared.ts).
import { describe } from 'vitest';
import { crossoverSweep } from './crossover-sweep.shared';

describe('a crossover between parallel tracks 9 studs apart, whatever the straights\' length', { timeout: 300000 }, () => crossoverSweep(9));
