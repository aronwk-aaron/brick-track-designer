// Printability (printable.shared.ts): a double slip. Its two big track parts are looked at slice by slice, a few minutes
// each: track2 in printed-double-slip-second-track.test.ts (each file well inside its 15 minutes on CI), all the rest here.
import { printsClean } from './printable.shared';

printsClean('double slip', { which: 'all but track2', keep: (part) => part !== 'track2' });
