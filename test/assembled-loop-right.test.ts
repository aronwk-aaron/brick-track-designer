// The return loop turning right goes together (assembled.shared.ts): on ballast, its ballast's parts big; a worker of its own.
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: the return loop turning right', { timeout: 1800000 }, () => assembledSuite(['Layouts'], ['Double-track return loop (turning right)']));
