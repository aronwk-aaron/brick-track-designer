// The reference range's crossings build (templates.shared.ts: no warnings, each within its time).
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: reference crossings', { timeout: 900000 }, () => templatesBuild(['Reference trackwork'], [
  'Crossing 90°, 8 studs',
  'Crossing 45° left',
  'Crossing 45° right',
  'Crossing 45°, 27 studs',
  'Crossing 22.5° left',
  'Crossing 22.5° right',
  'Star crossing 22.5°',
  'Curved crossing R24',
  'Curved crossing R40',
  'Curved crossing R56',
  'Curved crossing R72',
  'Curved crossing R88',
  'Curved crossing R104',
  'Crossing of two R120 curves',
  'Pass-through crossing R56 left',
  'Pass-through crossing R72 (A) left',
  'Pass-through crossing R72 (B) left',
  'Pass-through crossing R120 left',
  'Pass-through crossing R56 right',
  'Pass-through crossing R72 (A) right',
  'Pass-through crossing R72 (B) right',
  'Pass-through crossing R120 right',
  'T-junction core R56',
  'Narrow-gauge crossing 90°',
  'Narrow-gauge crossing 22.5° left',
  'Narrow-gauge crossing 22.5° right',
  'Narrow-gauge crossing 33.75° left',
  'Narrow-gauge crossing 33.75° right',
]));
