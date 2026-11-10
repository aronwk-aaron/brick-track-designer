// The R56 yard goes together (assembled.shared.ts): a worker of its own.
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: the yard', { timeout: 1800000 }, () => assembledSuite(['Layouts'], ['Yard (R56)']));
