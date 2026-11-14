// The TrixBrix range's loop sets with a section cut by hand to fit the bed (templates-ref-loops.ts: a cut path each), the
// big ones (50 to 100 parts): a file of their own (templates.shared.ts: no warnings, each within its time).
import { describe } from 'vitest';
import { REF_LOOPS } from '../src/app/templates-ref-loops';
import { templatesBuild } from './templates.shared';

const names = Object.keys(REF_LOOPS).filter((n) => REF_LOOPS[n].expert?.cutPaths);
describe('templates: TrixBrix loop sets cut to the bed', { timeout: 3600000 }, () => templatesBuild(['TrixBrix trackwork'], names));
