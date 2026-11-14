// The double slip crossover builds, within its time (templates.shared.ts): four R104 double slips, in a worker of its own.
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: the double slip crossover', { timeout: 1200000 }, () => templatesBuild(['TrixBrix trackwork'], ['Double slip crossover R104']));
