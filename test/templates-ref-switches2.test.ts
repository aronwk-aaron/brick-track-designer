// The reference range's curved switches, wyes, three-ways and parallel-track switches build (templates.shared.ts: no warnings, each within its time).
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: reference switches2', { timeout: 900000 }, () => templatesBuild(['Reference trackwork'], [
  'Curved switch R40 45° left',
  'Curved switch R40 45° right',
  'Curved switch R40 90° left',
  'Curved switch R40 90° right',
  'Curved switch R56 90° left',
  'Curved switch R56 90° right',
  'Curved switch R104 90° left',
  'Curved switch R104 90° right',
  'Wye R40',
  'Wye R40, 8-stud spacing',
  'Wye R104',
  'Wye R40 left, R56 right',
  'Wye R56 left, R40 right',
  'Wye R104 left, R120 right',
  'Wye R120 left, R104 right',
  'Three-way R40',
  'Three-way R104',
  'Switch to the next track, no gap, left',
  'Switch to the next track, no gap, right',
  'Switch, 2-stud gap, left',
  'Switch, 2-stud gap, right',
  'Switch, 4-stud gap, left',
  'Switch, 4-stud gap, right',
  'Three-way, no gap',
  'Three-way, 2-stud gap',
  'Three-way, 4-stud gap',
]));
