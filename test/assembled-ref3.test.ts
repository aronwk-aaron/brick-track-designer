// The reference trackwork goes together (assembled.shared.ts): the last third of its templates.
import { describe } from 'vitest';
import { assembledSuite, reference } from './assembled.shared';

describe('templates go together: reference trackwork, 53 to 97', { timeout: 1200000 }, () => assembledSuite(['TrixBrix trackwork'], reference(52, 97)));
