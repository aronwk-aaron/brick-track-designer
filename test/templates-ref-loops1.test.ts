// The TrixBrix range's loop sets (templates-ref-loops.ts: closed by the nearest chain of its real parts) build, half 1 of
// them (templates.shared.ts: no warnings but points at an angle to the grid, each within its time).
import { describe } from 'vitest';
import { REF_LOOPS } from '../src/app/templates-ref-loops';
import { templatesBuild } from './templates.shared';

const names = Object.keys(REF_LOOPS), h = Math.ceil(names.length / 2);
describe('templates: TrixBrix loop sets (1)', { timeout: 3600000 }, () => templatesBuild(['TrixBrix trackwork'], names.slice((1 - 1) * h, 1 * h)));
