// The X yard goes together (assembled.shared.ts): the biggest template, in a worker of its own.
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: the X yard', { timeout: 1800000 }, () => assembledSuite(['Layouts'], ['X yard (6 tracks, double slips)']));
