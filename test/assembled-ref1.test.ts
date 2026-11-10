// The reference trackwork goes together (assembled.shared.ts): the first third of its templates.
import { describe } from 'vitest';
import { assembledSuite, reference } from './assembled.shared';

describe('templates go together: reference trackwork, 1 to 26', { timeout: 1200000 }, () => assembledSuite(['Reference trackwork'], reference(0, 26)));
