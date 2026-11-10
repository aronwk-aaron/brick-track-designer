// The 4DBrix range goes together (assembled.shared.ts).
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: 4DBrix trackwork', { timeout: 1800000 }, () => assembledSuite(['4DBrix trackwork']));
