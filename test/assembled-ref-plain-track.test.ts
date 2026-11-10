// The reference range's plain track goes together (assembled.shared.ts): each a part that prints, on the bed, one solid.
import { describe } from 'vitest';
import { REF1_PLAIN } from '../src/app/templates-ref1';
import { assembledSuite } from './assembled.shared';

describe('templates go together: reference plain track', { timeout: 1200000 }, () => assembledSuite(['TrixBrix trackwork'], Object.keys(REF1_PLAIN)));
