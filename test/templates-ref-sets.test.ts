// The TrixBrix range's sets build (templates.shared.ts: no warnings but points at an angle to the grid, each within its time).
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: TrixBrix sets', { timeout: 1800000 }, () => templatesBuild(['TrixBrix trackwork'], [
  'Switch, 2-stud gap, left, with its R51 curve',
  'Switch, 2-stud gap, right, with its R51 curve',
  'Three-way, 2-stud gap, with its R51 curves',
  'Switch R148 left with its siding curves',
  'Switch R148 right with its siding curves',
  'Wye R40, 8-stud spacing, to two parallel tracks',
  'Wye R104 with its adapter curves',
  'Wye R104, 8-stud gap, with its curves',
]));
