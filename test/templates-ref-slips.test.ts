// The reference range's slips, crossovers and buffer stops build (templates.shared.ts: no warnings, each within its time).
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: reference slips', { timeout: 900000 }, () => templatesBuild(['Reference trackwork'], [
  'Double slip R40 45°',
  'Single slip R40 45°',
  'Double crossover R40',
  'Crossover, 4-stud gap, left',
  'Crossover, 4-stud gap, right',
  'Buffer stop',
  'Narrow-gauge buffer stop',
]));
