// The yard and the wye with a crossover build.
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: layouts (2)', { timeout: 600000 }, () => templatesBuild(['Layouts'], ['Yard ladder (R40)', 'Wye with a crossover']));
