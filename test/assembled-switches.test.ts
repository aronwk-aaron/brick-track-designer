// The switches' and the monorail's templates go together (assembled.shared.ts).
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: switches, monorail', { timeout: 1200000 }, () => assembledSuite(['Switches', 'Monorail']));
