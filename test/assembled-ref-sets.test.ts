// The TrixBrix range's sets go together (assembled.shared.ts).
import { describe } from 'vitest';
import { REF1_SETS } from '../src/app/templates-ref1';
import { assembledSuite } from './assembled.shared';

describe('templates go together: TrixBrix sets', { timeout: 3000000 }, () => assembledSuite(['TrixBrix trackwork'], Object.keys(REF1_SETS)));
