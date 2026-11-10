// The reference trackwork goes together (assembled.shared.ts): the second third of its templates.
import { describe } from 'vitest';
import { assembledSuite, reference } from './assembled.shared';

describe('templates go together: reference trackwork, 27 to 52', { timeout: 1200000 }, () => assembledSuite(['TrixBrix trackwork'], reference(26, 52)));
