// The layout templates build.
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: layouts', { timeout: 600000 }, () => templatesBuild(['Layouts']));
