// The reference range's modular kits go together (assembled.shared.ts): every part one body, printable, the parts
// drawn apart and brought together, the points working, no stud cut by a cut path.
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: the modular kits', { timeout: 1800000 }, () => assembledSuite(['TrixBrix trackwork'], [
  'Three-way R104, base and detachable modules',
  'Double slip R104 left, middle and detachable sections', 'Double slip R104 right, middle and detachable sections',
  'Switch R40 left, compact base and standard section', 'Switch R40 right, compact base and standard section',
  'Switch R40 left, compact base and short section', 'Switch R40 right, compact base and short section',
  'Yard switch R40 left, compact base and rail yard section', 'Yard switch R40 right, compact base and rail yard section',
  'Switch R40 left, compact base and curved 45° section', 'Switch R40 right, compact base and curved 45° section',
  'Switch R40 left, compact base and curved 90° section', 'Switch R40 right, compact base and curved 90° section',
  'Double crossover R104, bases and detachable modules',
]));
