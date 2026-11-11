// The monorail trackwork goes together (assembled.shared.ts).
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: monorail trackwork', { timeout: 1200000 }, () => assembledSuite(['Monorail trackwork']));
