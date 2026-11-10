// The reference range's switches build (left and right; R40 to R148) (templates.shared.ts: no warnings, each within its time).
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: reference switches', { timeout: 900000 }, () => templatesBuild(['Reference trackwork'], [
  'Switch R40 left',
  'Switch R40 right',
  'Switch R40 left, 28-stud straight',
  'Switch R40 right, 28-stud straight',
  'Yard switch R40 left',
  'Yard switch R40 right',
  'Switch R56 left',
  'Switch R56 right',
  'Switch R72 left',
  'Switch R72 right',
  'Switch R104 left',
  'Switch R104 right',
  'Switch R104 left, lever on the straight side',
  'Switch R104 right, lever on the straight side',
  'Switch R120 left',
  'Switch R120 right',
  'Switch R148 left',
  'Switch R148 right',
  'Switch R148 left, lever on the straight side',
  'Switch R148 right, lever on the straight side',
]));
