// The TrixBrix range's sets cut where their pieces join (templates-ref-joints.ts: the option jointCuts), a file of
// their own (templates.shared.ts: no warnings, each within its time).
import { describe } from 'vitest';
import { REF_JOINTS } from '../src/app/templates-ref-joints';
import { templatesBuild } from './templates.shared';

describe('templates: TrixBrix sets cut where their pieces join', { timeout: 3600000 }, () => templatesBuild(['TrixBrix trackwork'], Object.keys(REF_JOINTS)));
