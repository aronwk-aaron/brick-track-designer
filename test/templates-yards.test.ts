// The yard and the return loops build, each within its time (templates.shared.ts).
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: yards and return loops', { timeout: 900000 }, () => templatesBuild(['Layouts'], ['Yard (R56)', 'Double-track return loop (turning right)', 'Double-track return loop (turning left)']));
