// The three-track crossover builds, within its time (templates.shared.ts): eight sets of points, in a worker of its own.
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: the three-track crossover', { timeout: 900000 }, () => templatesBuild(['TrixBrix trackwork'], ['Crossover, three tracks, R104']));
