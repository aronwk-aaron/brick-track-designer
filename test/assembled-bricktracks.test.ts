// BrickTracks' range goes together (assembled.shared.ts).
import { describe } from 'vitest';
import { assembledSuite } from './assembled.shared';

describe('templates go together: BrickTracks trackwork', { timeout: 1200000 }, () => assembledSuite(['BrickTracks trackwork']));
