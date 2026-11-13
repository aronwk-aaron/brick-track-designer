// The TrixBrix range's combo sets made of its parts as BTD builds them (templates-ref-combos.ts) build, quarter 4 of them
// (templates.shared.ts: no warnings but points at an angle to the grid, each within its time).
import { describe } from 'vitest';
import { REF_COMBOS } from '../src/app/templates-ref-combos';
import { templatesBuild } from './templates.shared';

const names = Object.keys(REF_COMBOS), q = Math.ceil(names.length / 4);
describe('templates: TrixBrix combo sets (4)', { timeout: 3600000 }, () => templatesBuild(['TrixBrix trackwork'], names.slice((4 - 1) * q, 4 * q)));
