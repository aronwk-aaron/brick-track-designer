// The layout templates build (the yard and the wye in templates-layouts2.test.ts).
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: layouts', { timeout: 600000 }, () => templatesBuild(['Layouts'], ['Oval (LEGO R40)', 'Crossover (R40)', 'Scissors crossover (R56)']));
