// The crossings' templates go together (assembled.shared.ts: nothing overlaps as assembled, the moving parts work and go in, joints mate, every part prints).
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: crossings', { timeout: 1200000 }, () => assembledSuite(['Crossings']));
