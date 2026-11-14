// The double slip monster crossover builds, within its time (templates.shared.ts): three tracks, two three-ways and four R104 double slips, in a worker of its own.
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: the double slip monster crossover', { timeout: 1200000 }, () => templatesBuild(['TrixBrix trackwork'], ['Double slip monster crossover R104']));
