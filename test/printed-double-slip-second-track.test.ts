// Printability (printable.shared.ts): a double slip's second big track part, track2 (printed-double-slip.test.ts has the
// rest): each of its two track parts a few minutes, too long for one file to be sure of its 15 minutes on CI.
import { printsClean } from './printable.shared';

printsClean('double slip', { which: 'track2', keep: (part) => part === 'track2' });
