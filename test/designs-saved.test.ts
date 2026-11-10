// Designs saved from the app build and go together (designs.shared.ts): the small ones.
import { describe } from 'vitest';
import { savedSuite } from './designs.shared';

describe('saved designs: the small ones', { timeout: 1800000 }, () => savedSuite(['R136-152_corner.btd.json', '8-way_intersection.btd.json', '128s-112x.btd(2).json']));
