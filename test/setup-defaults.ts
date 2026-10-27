// The tests were written for the first defaults (a solid bed, its underside on the baseplate grid, long track cut to
// fill the print bed): each test file starts from those, so the designs they build don't change under them. The
// defaults the app starts with (like LEGO track: sleepers, underside along the track, 16-stud pieces) are kept in
// APP_DEFAULTS for the tests of them (defaults.test.ts).
import { OPTION_DEFAULTS, type PieceOptions } from '../src/app/design';
import { DEFAULTS as TRACK_DEFAULTS } from '../src/geom/track';

export const APP_DEFAULTS: PieceOptions = { ...OPTION_DEFAULTS };
(globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS = APP_DEFAULTS;
Object.assign(OPTION_DEFAULTS, { sleepers: 'bed', undersideGrid: 'baseplate', splitTrack: 'bed', legoTrack: 'print', axleStuds: 4, bladeStyle: 'simple' });
// (4-stud axles, as the axle joints' tests measure their holes)
Object.assign(TRACK_DEFAULTS, { axleStuds: 4 });
