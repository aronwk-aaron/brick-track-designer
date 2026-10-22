// The feature and monorail templates build.
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: features and monorail', { timeout: 600000 }, () => templatesBuild(['Features', 'Monorail']));
