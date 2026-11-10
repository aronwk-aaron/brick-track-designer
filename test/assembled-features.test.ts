// The features' templates go together (assembled.shared.ts): raised track on its pillars, the helix.
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: features', { timeout: 1200000 }, () => assembledSuite(['Features']));
