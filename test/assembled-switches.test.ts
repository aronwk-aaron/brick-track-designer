// The switches', the monorail's and the test prints' templates go together (assembled.shared.ts).
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: switches, monorail, test prints', { timeout: 1200000 }, () => assembledSuite(['Switches', 'Monorail', 'Test prints']));
