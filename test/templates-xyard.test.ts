// The X yard builds, within its time (templates.shared.ts): the biggest template, in a worker of its own.
import { describe } from 'vitest';
import { templatesBuild } from './templates.shared';

describe('templates: the X yard', { timeout: 1200000 }, () => templatesBuild(['Layouts'], ['X yard (6 tracks, double slips)']));
