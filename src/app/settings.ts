// The settings: every one's label, help, choices (each with what it does and its drawback), range and default, and when
// it can't be changed now (another setting rules it out) and why. The settings panel draws them; a test checks each one.
import { type Design, isMono, OPTION_DEFAULTS, type PieceOptions } from './design';

/** What the options panel needs to know to show only what applies. */
export interface OptCtx { o: PieceOptions; ballast: boolean; fdb: boolean; switches: boolean | undefined }
export interface OptChoice { v: string; t: string; tip?: string; /** its drawback */ con?: string; /** why it can't be built now */ no?: (c: OptCtx) => string | undefined }
export interface OptField {
  key: string; label: string; help?: string; step?: number; min?: number; max?: number;
  choices?: OptChoice[]; check?: boolean;
  /** a line of text */
  text?: boolean;
  /** a choice's value is a number (stored as one) */
  numeric?: boolean;
  /** a small heading over this field, grouping it with the ones after it */
  sub?: string;
  /** the form drawn again when it changes (other fields depend on it) */
  rerender?: boolean;
  /** why it can't be changed now (another setting rules it out): shown greyed out with this reason; undefined: it can */
  off?: (c: OptCtx) => string | undefined;
  /** its default, where it isn't in OPTION_DEFAULTS */
  def?: string | number | boolean;
  get?: () => string | number | boolean; set?: (v: string | number | boolean) => void;
}
export interface OptSection { title: string; switches?: boolean; /** only for one kind of track: folded, its settings locked, when the design has none of it */ kind?: 'train' | 'monorail'; fields: OptField[] }
/** The settings form for the design d() (the one being edited, read when a setting's asked about): its sections, and
 * why the monorail settings are locked (no monorail in the design). */
export function optionForm(d: () => Design): { form: OptSection[]; noMono: (c?: OptCtx) => string | undefined } {
  /** (buffer stop settings) why they don't apply: no route ends in one */
  const noBuf = () => (d().routes.some((r) => r.startEnd === 'buffer' || r.endEnd === 'buffer') ? undefined : 'no route ends in a buffer stop (set Starts in / Ends in on a route card)');
  /** (the banked curves' settings: locked till a curve has a bank) */
  const noBank = () => (d().routes.some((r) => r.segs.some((sg) => sg.kind === 'curve' && (sg.bank ?? 0) > 0)) ? undefined : 'no curve is banked: give one a bank on its route card (Shape)');
  /** (settings for the tines mechanism only) */
  const onlyTines = (c: OptCtx) => (c.fdb ? 'only with Mechanism: Under the bed, on spring tines' : undefined);
  /** A length kept in mm, shown and set in studs (lengths are studs to the user; fits and clearances stay mm). */
  const inStuds = (key: keyof PieceOptions): Pick<OptField, 'get' | 'set' | 'def'> => ({
    def: (OPTION_DEFAULTS[key] as number) / 8,
    get: () => Math.round((((d().options?.[key] as number | undefined) ?? (OPTION_DEFAULTS[key] as number)) / 8) * 100) / 100,
    set: (v) => { d().options = { ...d().options, [key]: Number(v) * 8 }; },
  });
  /** (settings for the blades-on-top mechanism only) */
  const onlyPlates = (c: OptCtx) => (c.fdb ? undefined : 'only with Mechanism: Blades on top, on pins');
  /** (settings for joints with rail tongues only) */
  const noTongues = (c: OptCtx) => (c.o.joint === 'butt' || c.o.joint === 'flataxle' ? 'Parts join with is Straight cuts: no rail tongues' : undefined);
  const form: OptSection[] = [
    { title: 'Track', kind: 'train', fields: [
      { key: 'gaugeStuds', label: 'Gauge, studs', step: 1, min: 2, max: 10, rerender: true, help: 'Studs between the rails. LEGO track is 4.',
        def: 4, get: () => d().gaugeStuds, set: (v) => { d().gaugeStuds = Math.round(Number(v)); } },
      { key: 'sleepers', label: 'Under the rails', choices: [
        { v: 'bed', t: 'Solid bed', tip: 'One solid bed under the rails, like LEGO switches.' },
        { v: 'sleepers', t: 'Sleepers with gaps', tip: 'Separate sleepers, like LEGO straight and curved track. Where tracks meet (switches, crossings) the bed stays solid.',
          con: 'The rails print as bridges over the gaps. A cut in a gap is held by the rails only.',
          no: (c) => (c.ballast ? 'it\'s for track without ballast, so a solid bed is built' : undefined) }] },
      { key: 'sleeperWidthStuds', label: 'Sleeper width', numeric: true, off: (c) => (c.ballast ? 'with ballast there are no separate sleepers' : c.o.sleepers !== 'sleepers' ? 'set Under the rails to Sleepers with gaps' : undefined), choices: [
        { v: '2', t: '2 studs', tip: 'Like LEGO sleepers.' },
        { v: '1', t: '1 stud', tip: 'Narrow, like bridge ties.' }] },
      { key: 'sleeperGapStuds', label: 'Gap between sleepers, studs', step: 1, min: 1, max: 6, off: (c) => (c.ballast ? 'with ballast there are no separate sleepers' : c.o.sleepers !== 'sleepers' ? 'set Under the rails to Sleepers with gaps' : undefined), help: 'LEGO track is 2.' },
      { key: 'raisedOn', label: 'Raised track stands on', get: () => d().options?.raisedOn ?? 'printed', set: (v) => { d().options = { ...d().options, raisedOn: v as 'printed' | 'lego' }; }, def: 'printed',
        off: () => (d().routes.some((r) => !isMono(r) && ((r.monoHeight ?? 0) > 0 || (r.monoHeightEnd ?? 0) > 0)) ? undefined : 'no train route is raised: give one a Height on its card (Place)'),
        help: 'What holds up train track off the baseplate (a route\'s Height, End height), every 16 studs.', choices: [
        { v: 'printed', t: 'Printed supports', tip: 'A support every 16 studs, as the monorail\'s: a 6 x 4 base gripping the baseplate, two legs, a 2 x 2 top the track\'s underside grips, tilted to the grade. One part each; lower than a brick, LEGO 2 x 8 plates instead.', con: 'Parts to print, tall ones on a high track.' },
        { v: 'lego', t: 'LEGO bricks', tip: 'Stacks of LEGO 2 x 8 bricks and plates every 16 studs, in the parts list.', con: 'A lot of bricks for a high track (a helix\'s top turn).' }] },
      { key: 'curveStuds', label: 'Studs on the track', choices: [
        { v: 'grid', t: 'On the baseplate grid', tip: 'Every stud lines up with the baseplate. On curves they form a grid, not rows.' },
        { v: 'follow', t: 'In rows along the track', tip: 'Rows across the track, like LEGO track, so tiles fit across curves.', con: 'On curves the studs are off the baseplate grid.' }], help: 'With Sleepers with gaps (no ballast), only where the bed is solid (switches, crossings): the sleepers\' own studs always run along the track.' },
    ] },
    { title: 'Ballast', kind: 'train', fields: [
      { key: 'ballast', label: 'Ballast', choices: [
        { v: 'none', t: 'None', tip: 'Track only, like LEGO track.' },
        { v: 'ballast', t: 'Ballast', tip: 'The track sits on a stepped ballast shoulder.' },
        { v: 'buddy', t: 'Ballast + buddy layer', tip: 'Ballast with a wider bottom layer.' }] },
      { key: 'trackBallast', label: 'Track and ballast printed', off: (c) => (c.ballast ? undefined : 'only with ballast'), choices: [
        { v: 'together', t: 'In one part', tip: 'Track and ballast print as one part.' },
        { v: 'apart', t: 'Apart, the track seated in the ballast', tip: 'Track and ballast print as separate parts (…-track, …-ballast). The track drops into a seat in the ballast.',
          con: 'Twice as many parts. The track is held only by its fit and the baseplate; with a solid bed the seat is just the ballast steps (with sleepers, each sleeper gets a pocket).' }] },
      { key: 'trackFitTol', label: 'Track fit in the seat, mm', step: 0.05, min: 0, max: 1, off: (c) => (!c.ballast ? 'only with ballast' : c.o.trackBallast !== 'apart' ? 'Track and ballast printed is In one part' : undefined), help: 'Gap round the track in its seat.' },
    ] },
    { title: 'Underside', kind: 'train', fields: [
      { key: 'bottomStyle', label: 'Ballast underside', off: (c) => (c.ballast ? undefined : 'only with ballast'), choices: [
        { v: 'antistud', t: 'Anti-studs (grips the baseplate)', tip: 'Hollow with LEGO tubes, so it clicks onto the baseplate.' },
        { v: 'float', t: 'Flat', tip: 'Flat underneath. It rests on the studs without gripping.' }] },
      { key: 'undersideGrid', label: 'Underside lined up with', off: (c) => (c.ballast ? 'only for track without ballast (ballast always lines up with the baseplate)' : undefined), choices: [
        { v: 'baseplate', t: 'The baseplate grid', tip: 'The sockets and tubes line up with the baseplate\'s studs, so the track clicks onto it.' },
        { v: 'track', t: 'The track itself', tip: 'Hollow with anti-stud tubes in rows along the track, turned with it, like LEGO track\'s underside: for track laid off the grid, at an angle, or on other parts\' studs.',
          con: 'On a baseplate it only clicks on where the track happens to line up with the grid.' }] },
      { key: 'grip', label: 'Grip on the baseplate', off: (c) => (c.ballast && c.o.bottomStyle === 'float' ? 'Ballast underside is Flat, so nothing grips' : !c.ballast && c.o.undersideGrid === 'track' && c.switches === false ? 'Underside lined up with the track: tubes all along it, as LEGO track (it\'s for switches, and there are none)' : undefined), help: 'Switches always; track and crossings with Underside lined up with: The baseplate grid, or with ballast. With Sleepers with gaps (no ballast), only under the solid bed (switches, crossings): the sleepers\' own underside is LEGO track\'s.',
        choices: [
          { v: 'edges', t: 'Along the edges', tip: 'Like a LEGO plate: tubes grip along the edges and every 4 studs (green circles on the plan). Firm, and comes off again.' },
          { v: 'all', t: 'Every stud', tip: 'A socket on every stud.', con: 'Grips very hard: can be difficult to pull off.' }] },
    ] },
    { title: 'Switches: points', kind: 'train', switches: true, fields: [
      { key: 'mechStyle', label: 'Mechanism', choices: [
        { v: 'plates', t: 'Blades on top, on pins', tip: 'Each blade sits on a plate on top of the bed and turns on a pin. Everything goes in from above.' },
        { v: 'tines', t: 'Under the bed, on spring tines', tip: 'The points sit in pockets under the bed on springy tines. They go in from below.' }] },
      { key: 'pointBlades', label: 'Moving blades', numeric: true, off: onlyPlates, choices: [
        { v: '2', t: 'Two', tip: 'Both blades move, as LEGO and most model switches.' },
        { v: '1', t: 'One (single point)', tip: 'Only the blade on the curved side moves; the other rail is fixed, with a flangeway beside its stock rail, as a tram\'s single-point switch.',
          con: 'The one blade steers both ways: a wheel can pick the wrong way if the wheels are loose. Three-ways keep both blades.' }] },
      { key: 'bladeStyle', label: 'Blade shape', off: onlyPlates, choices: [
        { v: 'sprung', t: 'Sprung', tip: 'A 3 mm plate with a flat top on a LEGO stud, two leaf springs in a pocket underneath (supports built in), so a train trailing through pushes them over and they spring back. The slider meets them at the points.',
          con: 'Break the supports out of the pocket after printing.' },
        { v: 'simple', t: 'Rigid', tip: 'Each blade on a thin plate, the slider\'s post in a plain hole: no spring.', con: 'A train trailing through the wrong way can\'t push the blades over: set the points first.' },
        { v: 'prototype', t: 'Rigid, realistic (planed, tucked under the rail)', tip: 'Rigid blades planed to a point and tucked under the stock rail head, so flanges can\'t catch them.',
          con: 'No spring, as Rigid. Fit the blades swung open, then close them. The stock rail head is thinner along the points.' }] },
      { key: 'bladeLip', label: 'Blades held down by', off: (c) => onlyPlates(c) ?? (c.o.bladeStyle === 'sprung' ? 'Blade shape is Sprung: it always has the front lip' : undefined), choices: [
        { v: 'pin', t: 'Snap lip on the pin', tip: 'A small lip on top of each blade\'s pin. The blade\'s hole snaps down over it.',
          con: 'Only the heel is held. The point can lift a little, where a flange can catch it.' },
        { v: 'front', t: 'Lip over the front', tip: 'A low lip on the track leans over each blade\'s front, as on Sprung blades, so the point can\'t lift. The pin is plain. Fit each blade front first, tilted under the lip, then lower it onto its pin.',
          con: 'Each blade\'s rail starts a little further back (its front is bevelled under the lip). Where other track runs too close to a blade\'s front, that blade keeps the snap lip.',
          no: (c) => (c.ballast && c.o.bladeStyle === 'simple' ? 'on ballast a Rigid blade\'s plate is kept off the stock rail\'s foot, so its front is too narrow to hold (Rigid, realistic works)' : undefined) }] },
      { key: 'pointThrow', label: 'Blade throw, mm', step: 0.25, min: 2, max: 6, help: 'How far the blade tips move.' },
      { key: 'pointClearance', label: 'Clearance, mm', step: 0.05, min: 0.1, max: 0.8, help: 'Gap round the moving parts.' },
      { key: 'springPreload', label: 'Spring preload, mm', step: 0.25, min: 0, max: 3, help: 'How far past closed the springs push the blades, to hold them shut.' },
    ] },
    { title: 'Switches: tines mechanism', kind: 'train', switches: true, fields: [
      { key: 'pointsPieces', label: 'Points printed as', numeric: true, off: onlyTines, choices: [
          { v: '1', t: 'One part', tip: 'Both blades on one pivot.' },
          { v: '2', t: 'Two parts', tip: 'Each blade on its own pivot and spring.' }] },
      { key: 'pointsModule', label: 'Points go in', off: onlyTines, choices: [
        { v: 'built-in', t: 'From below', tip: 'The pockets open through the bottom. Fit the points before putting the track on the baseplate.' },
        { v: 'layers', t: 'From above, under a lid', tip: 'A lower layer holds the moving parts; the deck with the rails clips on top with studs.',
          no: (c) => (c.ballast ? undefined : 'it needs ballast, so the points go in from below') }] },
      { key: 'springThickness', label: 'Spring thickness, mm', step: 0.05, min: 0.5, max: 2, off: onlyTines, help: 'Thickness of the spring tines.' },
      { key: 'springLength', label: 'Spring length, studs', step: 0.25, min: 2, max: 10, ...inStuds('springLength'), off: onlyTines, help: 'Length of the spring tines. Each lever can also be dragged along on the plan.' },
      { key: 'bladeDiscD', label: 'Pivot disc diameter, mm', step: 1, min: 10, max: 24, off: onlyTines, help: 'The disc the points pivot on. Bigger is steadier but needs more room under the bed.' },
    ] },
    { title: 'Switches: throw', kind: 'train', switches: true, fields: [
      { key: 'throwStyle', label: 'Throw', choices: [
        { v: 'built-in', t: 'Lever built into the arm', tip: 'The lever mounts on the track piece itself.' },
        { v: 'bracket', t: 'Lever on a bracket', tip: 'The lever sits on a separate 3 x 3 stud bracket on the arm.' },
        { v: 'stand', t: 'Switch stand (ground throw)', tip: 'A handle beside the track, like a real ground throw. It locks at each end.',
          con: 'A train trailing through against it derails unless the points spring back. A three-way\'s middle position isn\'t locked.',
          no: (c) => (c.fdb ? undefined : 'only with Mechanism: Blades on top, on pins') },
        { v: 'nail', t: 'Nail switch (by hand, no lever)', tip: 'As on the reference double slips\' inner points: no lever, no arm. The slider stays under the points, held at either end by an over-centre spring; push the blade over with a fingernail in the notch on its plate. Trains can trail through.',
          con: 'Nothing to work it from beside the track, nor to motorise.', no: (c) => (c.fdb ? undefined : 'only with Mechanism: Blades on top, on pins') }] },
      { key: 'boxedThrow', label: 'Points with no room for a throw', get: () => d().options?.boxedThrow ?? 'slider', set: (v) => { d().options = { ...d().options, boxedThrow: v as 'nail' | 'slider' }; }, def: 'slider',
        off: (c) => (c.fdb ? undefined : 'only with Mechanism: Blades on top, on pins'), help: 'Points whose throw would cross other track in the same part (its lever on that track, or its arm across it), or run into another points\' throw (a double slip\'s, whose sliders cross under its crossing).', choices: [
        { v: 'nail', t: 'Nail switches', tip: 'Those points thrown by hand (Throw: Nail switch); the rest as set.' },
        { v: 'slider', t: 'A slider under the track, to a lever past it', tip: 'The slider in a tunnel under the other track (in two parts), the lever out past it.', con: 'Long sliders under other track; where there\'s no room even so, and where two throws run into each other, a warning.' }] },
      { key: 'throwAction', label: 'Points kept set by', off: onlyPlates, choices: [
        { v: 'detent', t: 'Lever click', tip: 'The lever clicks into place at each end.', con: 'A train trailing through the wrong way can push the points part way and derail.' },
        { v: 'overcentre', t: 'Over-centre spring', tip: 'A printed spring snaps the points to whichever side they\'re pushed. Trains can trail through.', con: 'The spring is light (about 0.3 N) and depends on print accuracy. Not on three-ways or with a switch stand.' }] },
      { key: 'throwSide', label: 'Lever side', help: 'For every switch, unless set on the branch route\'s card or dragged on the plan.', choices: [
        { v: 'auto', t: 'Auto', tip: 'On the side away from the branch, clear of its track (a three-way: right).' },
        { v: 'left', t: 'Left', tip: 'Left, facing along the points from the toe.' },
        { v: 'right', t: 'Right', tip: 'Right, facing along the points from the toe.' }] },
      { key: 'leverOffset', label: 'Lever distance from track, studs', step: 0.25, min: -3, max: 4, ...inStuds('leverOffset'), help: 'How far past the sleeper ends. Each lever can also be dragged on the plan.' },
      { key: 'throwBallast', label: 'Ballast round the lever', check: true, off: (c) => (c.ballast ? undefined : 'only with ballast'), help: 'The ballast steps continue round the lever arm, so the lever stands on ballast.' },
    ] },
    { title: 'Check rails and flangeways', kind: 'train', fields: [
      { key: 'checkRailLen', label: 'Check rail length, studs', step: 0.25, min: 1.25, max: 10, ...inStuds('checkRailLen'), help: 'The check rails beside the running rails opposite a frog (a crossing\'s, a switch\'s), which hold the wheels\' flanges clear of its point: how long each is, its flared ends included.' },
      { key: 'checkRailW', label: 'Check rail width, mm', step: 0.1, min: 1, max: 3, help: 'How thick each check rail is. Thicker is stronger to print.' },
      { key: 'checkRailFlare', label: 'Check rail end flare, mm', step: 0.25, min: 0, max: 4, help: 'How far the ends bend out to guide the flanges in.' },
      { key: 'flangeway', label: 'Flangeway width, mm', step: 0.1, min: 1, max: 4, help: 'The gap the wheels\' flanges run in, beside the rail where other track crosses it and beside check rails. Wider: looser wheels run through; too wide and a wheel drops in.' },
      { key: 'flangewayDepth', label: 'Flangeway depth, mm', step: 0.5, min: 1, max: 6, help: 'How deep the flangeways are cut below the rail tops. Deep enough for your wheels\' flanges.' },
    ] },
    { title: 'Banked curves', kind: 'train', fields: [
      { key: 'bankRampAt', label: 'Bank ramps', off: noBank, choices: [
        { v: 'straight', t: 'On the track before and after', tip: 'The bank eases in on the track leading into a curve and out on the track after it, as real railways do: the curve is banked in full from end to end. With no straight there, or not enough, the ramp runs on into the curve.' },
        { v: 'curve', t: 'Inside the curve', tip: 'The bank eases in and out inside the curve, as the plate-style banked pieces do.', con: 'The outer rail climbs while the train is already turning, and a short curve leaves little room: the ramps get steep.' }] },
      { key: 'bankRampStuds', label: 'Shortest bank ramp, studs', off: noBank, step: 1, min: 2, max: 200, help: 'Each ramp from level to a curve\'s full bank, eased in and out (no kink in the outer rail). Made longer by itself where the outer rail would climb steeper than the limit below. 40 keeps a 3° bank under 1 in 100.' },
      { key: 'bankClimb', label: 'Steepest climb of the outer rail, 1 in', off: noBank, step: 10, min: 20, max: 1000, help: 'The outer rail rises at most 1 mm in this many, at the ramp\'s steepest (its middle). 100 is a gentle model railway run-off; full-size railways use 400 or more. Where there isn\'t room for a ramp that gentle, the build warns and rings the place on the plan.' },
    ] },
    { title: 'Buffer stops', kind: 'train', fields: [
      { key: 'bufferStyle', label: 'Style', off: () => noBuf(), choices: [
        { v: 'frame', t: 'Rail-built frame with buffers', tip: 'A braced frame over each rail, a beam across with two sprung buffers, like a real buffer stop.' },
        { v: 'blocks', t: 'Brick posts', tip: 'Two 2 x 2 posts with studs on top to build on, joined by a beam.' }] },
      { key: 'bufferPostPlates', label: 'Post height, plates', step: 1, min: 4, max: 15, off: (c) => noBuf() ?? (c.o.bufferStyle === 'blocks' ? undefined : 'only with Style: Brick posts'), help: 'Height of the posts above the ballast top, with studs on top.' },
      { key: 'bufferBeamBottom', label: 'Beam bottom above the rails, mm', step: 0.5, min: 0, max: 10, off: () => noBuf(), help: 'Set it to meet your trains\' buffers or magnets.' },
      { key: 'bufferBeamTop', label: 'Beam top above the rails, mm', step: 0.5, min: 4, max: 20, off: () => noBuf(), help: 'The beam\'s top: with its bottom, how tall the beam the trains stop against is.' },
      { key: 'bufferPinHoles', label: 'Pin holes in the posts', check: true, off: (c) => noBuf() ?? (c.o.bufferStyle === 'blocks' ? undefined : 'only with Style: Brick posts'), help: 'Holes for LEGO Technic pins at beam height: for a bumper, lights or a sign.' },
    ] },
    { title: 'Print bed and cutting into parts', fields: [
      { key: 'printBedX', label: 'Print bed width, mm', step: 1, min: 50, max: 1000, help: 'Your printer\'s bed, across (x). Every part is cut to fit on the bed, and turned to fit it best.' },
      { key: 'printBedY', label: 'Print bed depth, mm', step: 1, min: 50, max: 1000, help: 'Your printer\'s bed, front to back (y).' },
      { key: 'splitTrack', label: 'Long track cut into', def: OPTION_DEFAULTS.splitTrack, choices: [
        { v: 'bed', t: 'Parts that fill the print bed', tip: 'Cut along straight lines where the bed needs it; the parts join as set in Parts join with.' },
        { v: 'lengths', t: 'Track pieces, cut across the track', tip: 'Each track cut square to itself into pieces with ordinary end connectors, like LEGO track. Switches and crossings stay whole.', con: 'More parts, and a cut only where the track is clear of other tracks.' }] },
      { key: 'pieceLengthStuds', label: 'Piece length, studs', step: 4, min: 0, max: 64, off: (c) => (c.o.splitTrack === 'lengths' ? undefined : 'only with Long track cut into: Track pieces'), help: 'LEGO straights are 16. 0: as long as fits the print bed. A longer piece than the bed takes: as long as fits.' },
      { key: 'baseplate', label: 'Cut at baseplate edges', numeric: true, help: 'So every part sits on one baseplate (orange dashed lines on the plan).', choices: [
        { v: '0', t: 'No' }, { v: '16', t: '16 x 16 studs' }, { v: '32', t: '32 x 32 studs' }, { v: '48', t: '48 x 48 studs' }, { v: '64', t: '64 x 64 studs' }, { v: '96', t: '96 x 96 studs' }] },
      { key: 'baseplateX', label: 'Baseplate corner x, studs', step: 1, off: (c) => ((c.o.baseplate ?? 0) > 0 ? undefined : 'Cut at baseplate edges is No'), help: 'Where a baseplate corner is on the grid.' },
      { key: 'baseplateY', label: 'Baseplate corner y, studs', step: 1, off: (c) => ((c.o.baseplate ?? 0) > 0 ? undefined : 'Cut at baseplate edges is No'), help: 'Where a baseplate corner is on the grid.' },
      { key: 'studsAtCuts', label: 'Studs a cut goes through', choices: [
        { v: 'off', t: 'Taken off', tip: 'No stud is cut in half: one a cut would go through is left off, on both parts.', con: 'A stud missing here and there along each cut.' },
        { v: 'whole', t: 'Whole on one part', tip: 'Each one whole on the part its middle is on, standing a little over the next part\'s edge.', con: 'Those studs overhang the joint: printed on the edge, they can snap off.' },
        { v: 'split', t: 'Cut in half', tip: 'Cut straight through with the rest.', con: 'Half studs either side of the joint: a brick won\'t sit on them.' }] },
    ] },
    { title: 'Bought track', kind: 'train', fields: [
      { key: 'legoTrack', label: 'Bought track', help: 'Track bought, not printed, wherever it\'s exactly a piece LEGO or BrickTracks sell. Bought parts are in the parts list (toolbar), not the STL download. In the 3D view and the pictures: LEGO\'s green, BrickTracks\' purple.', off: (c) => (c.o.splitTrack !== 'lengths' ? 'only with Long track cut into: Track pieces' : d().gaugeStuds !== 4 ? 'LEGO track is 4 studs between the rails: the gauge isn\'t 4' : undefined), choices: [
        { v: 'lego', t: 'Bought: LEGO\'s and BrickTracks\'', tip: 'Bought: LEGO\'s 16-stud straights (53401, ballast on LEGO plates), R40 curves (53400) and switches (53407, 53404); BrickTracks\' R56 to R120 curves, R104B curve, 1/2, 1/4 and 1/10 straights and R104 switches. On ballast, a printed ballast piece each drops into (see Bought track\'s ballast); on a Flat ballast underside, BrickTracks\' curves on their own ballast and buddy. Pieces only where they fit exactly, with no other track over them.', con: 'Their sleepers and underside are theirs, not as set here.' },
        { v: 'lego-only', t: 'Bought: LEGO\'s only', tip: 'LEGO\'s straights (53401), R40 curves (53400) and switches (53407, 53404) bought, as Bought: LEGO\'s and BrickTracks\'; every other piece printed, BrickTracks\' curves and switches too.', con: 'Their sleepers and underside are theirs, not as set here.' },
        { v: 'print', t: 'Printed', tip: 'Every piece printed, as set here: nothing bought.', con: 'More to print.' }] },
      { key: 'boughtBallast', label: 'Bought track\'s ballast', get: () => d().options?.boughtBallast ?? 'each', set: (v) => { d().options = { ...d().options, boughtBallast: v as 'each' | 'together' }; }, def: 'each',
        off: (c) => (c.o.ballast === 'none' ? 'only with ballast' : (c.o.legoTrack ?? 'lego') === 'print' ? 'only with Bought track: Bought' : c.o.splitTrack !== 'lengths' ? 'only with Long track cut into: Track pieces' : undefined),
        help: 'The ballast printed under bought track (curves, short straights, switches; LEGO\'s straights sit on LEGO plates).', choices: [
        { v: 'each', t: 'A part for each piece', tip: 'Each bought piece\'s ballast a part of its own, whole, as the piece is; a switch\'s too long for the bed in two, cut across between its sleepers. Where two pieces\' ballast would overlap (beside a switch), the first piece\'s.', con: 'More parts; a switch\'s may not fit a small bed.' },
        { v: 'together', t: 'Shared by pieces side by side, cut to fit', tip: 'The ballast under pieces side by side printed in one, cut for the print bed and at the tables\' seams; a switch\'s cut for the bed too.', con: 'Its joints aren\'t where the pieces\' are.' }] },
    ] },
    { title: 'Joints', fields: [
      { key: 'joint', label: 'Parts join with', help: 'How parts cut for the print bed or at baseplate edges join. With Long track cut into: Track pieces, plain track joins with its own end connectors; this is for the switches and crossings too big for the bed.', choices: [
        { v: 'lego', t: 'Rail tongues + peg and clip', tip: 'Like LEGO track ends.' },
        { v: 'dovetail', t: 'Rail tongues + dovetails', tip: 'Stronger. Slides together from above.' },
        { v: 'butt', t: 'Straight cuts', tip: 'Nothing joins them; the baseplate holds them in line.' },
        { v: 'flataxle', t: 'Straight cuts + LEGO axles', tip: 'Cut straight, rails and all (no tongues), pinned with LEGO cross axles across each cut (Axle length).', no: (c) => (c.ballast ? undefined : 'needs ballast (track alone is too thin): straight cuts with nothing joining them') },
        { v: 'axle', t: 'Rail tongues + LEGO axles', tip: 'A cross-axle hole across each cut (Axle length).', no: (c) => (c.ballast ? undefined : 'needs ballast (track alone is too thin): peg and clip is used instead') }] },
      { key: 'axleStuds', label: 'Axle length, studs', step: 2, min: 2, max: 8, off: (c) => (c.o.joint === 'axle' || c.o.joint === 'flataxle' ? undefined : 'only with Parts join with: LEGO axles'), help: 'The LEGO cross axles that pin the parts together across a cut: half of each axle in each part. 2: a 2-stud axle (3704), 4: a 4-stud axle (3705).' },
      { key: 'tongueRails', label: 'Tongues on', off: noTongues, choices: [
        { v: 'all', t: 'Every rail a cut crosses', tip: 'Each rail gets interlocking tongues where it\'s cut, slanted ones too.' },
        { v: 'square', t: 'Only rails crossing the cut square', tip: 'The track the cut crosses squarely gets LEGO track-end tongues; rails crossing it at an angle (a branch\'s) are cut flat, as plate-style large switches are split.',
          con: 'The slanted rails rely on the square ones and the bed joint to stay in line.' }] },
      { key: 'endSupports', label: 'Supports under rail ends', check: true, off: noTongues, help: 'Breakaway supports under the rail-end tongues. Off: leave it to your slicer.' },
      { key: 'pegOnBallast', label: 'Peg and clip on ballast ends', check: true, off: (c) => (c.ballast ? undefined : 'only with ballast'), help: 'Keeps the peg and clip on the end connectors, so pieces clip together. They print on small breakaway supports. Off: the ends just butt together.' },
      { key: 'axleHoles', label: 'LEGO axle holes through the ends', check: true, off: (c) => (c.o.ballast !== 'buddy' ? 'needs Ballast + buddy layer' : c.o.trackBallast === 'apart' ? 'not with Track and ballast printed Apart (the track seated in the ballast)' : undefined), help: 'Cross-axle holes through each end, so a LEGO axle pins two pieces together.' },
    ] },
    { title: 'Labels', fields: [
      { key: 'labelText', label: 'Label text', text: true, off: (c) => (d().routes.some((r) => isMono(r)) ? undefined : (c.ballast && c.o.bottomStyle === 'float' ? undefined : 'labels go only on a flat underside: set Ballast to Ballast and Ballast underside to Flat')), help: 'Engraved under each part, mirrored to read from below. Empty: no labels (monorail: the design\'s name).' },
      { key: 'labelSize', label: 'Add the size (S16, R40 22.5°)', check: true, help: 'After the label text, what the piece is: S16 a 16-stud straight, R40 22.5° a curve.', off: (c) => (c.ballast && c.o.bottomStyle === 'float' ? undefined : 'labels go only on a flat underside: set Ballast to Ballast and Ballast underside to Flat') ?? (c.o.labelText ? undefined : 'Label text is empty') },
      { key: 'labelGauge', label: 'Add the gauge (Ln4)', check: true, help: 'After the label text, the gauge: Ln4, 4 studs between the rails.', off: (c) => (c.ballast && c.o.bottomStyle === 'float' ? undefined : 'labels go only on a flat underside: set Ballast to Ballast and Ballast underside to Flat') ?? (c.o.labelText ? undefined : 'Label text is empty') },
      { key: 'labelParts', label: 'Number parts cut for the bed (#2)', check: true, off: (c) => (c.ballast && c.o.bottomStyle === 'float' ? undefined : 'labels go only on a flat underside: set Ballast to Ballast and Ballast underside to Flat') ?? (c.o.labelText ? undefined : 'Label text is empty'), help: 'Matches the part\'s file name.' },
    ] },
    { title: 'LEGO fit', fields: [
      { key: 'studFit', label: 'Stud fit, mm', step: 0.01, min: -0.3, max: 0.5, help: 'Added to the 4.8 mm studs. Bigger: bricks grip tighter.' },
      { key: 'antistudFit', label: 'Anti-stud fit, mm', step: 0.01, min: -0.3, max: 0.5, help: 'Makes the tubes underneath looser. Bigger: grips the baseplate less.' },
    ] },
    { title: 'Monorail', kind: 'monorail', fields: [
      { key: 'monoEndStuds', label: 'Studs at the ends', off: noMono, choices: [
        { v: 'side', t: 'Out of the sides', tip: 'Hollow studs out of both sides of each end, like LEGO monorail track.' },
        { v: 'top', t: 'On top, in recesses', tip: 'Two studs in a recess each side of the ridge at each end. A 1 x 2 tile sits in flush; a 1 x 4 plate across a joint holds it.' },
        { v: 'none', t: 'None', tip: 'Plain ends, the full beam width.' }] },
      { key: 'monoAxleHoles', label: 'Axle holes in the ends', check: true, off: noMono, help: 'Two LEGO cross-axle holes in each end face, to pin pieces together with axles.' },
      { key: 'monoAxleLengthStuds', label: 'Joining axle length, studs', step: 1, min: 2, max: 6, off: (c) => noMono(c) ?? (c.o.monoAxleHoles === false ? 'Axle holes in the ends is off' : undefined), help: 'Each end\'s hole takes half the axle.' },
      { key: 'monoHoleFit', label: 'Hole fit, mm', step: 0.05, min: 0, max: 0.5, off: noMono, help: 'Added round the axle holes and anti-studs. Bigger: looser.' },
      { key: 'monoLegoAntistud', label: 'Anti-stud depth', off: noMono, get: () => ((d().options?.monoLegoAntistud ?? false) ? 'lego' : 'short'), set: (v) => { d().options = { ...d().options, monoLegoAntistud: v === 'lego' }; }, def: 'short', choices: [
        { v: 'short', t: '2.2 mm', tip: 'Deep enough for a stud, with room for the axle holes above.' },
        { v: 'lego', t: '4 mm, like LEGO', tip: 'As deep as LEGO monorail track\'s anti-studs.',
          con: 'The axle holes move: side-stud and top-stud pieces then don\'t join with axles; on side-stud pieces only 0.2 mm is left between hole and anti-stud; the end notch opens into a hole.' }] },
      { key: 'monoLabels', label: 'Monorail parts engraved with', off: noMono, choices: [
        { v: 'name', t: 'Label text and part name', tip: 'Two lines underneath, reading from below: the Label text (Labels section; empty: the design\'s name) and the part\'s name, as its file.' },
        { v: 'part', t: 'Part name', tip: 'One line underside: the part\'s name, as its file.' },
        { v: 'none', t: 'Nothing', tip: 'A plain underside.' }] },
      { key: 'monoSwitchTravel', label: 'Points frame slide, mm', step: 0.5, min: 10, max: 40, sub: 'Points (experimental)', off: noMono, help: 'How far the points\' frame slides. The idle rack moves this far aside, clear of the train. LEGO\'s: about 27.' },
      { key: 'monoSwitchFit', label: 'Points clearance, mm', step: 0.05, min: 0.1, max: 0.6, off: noMono, help: 'The gap round the sliding frame.' },
      { key: 'monoSupportStuds', label: 'Support every, studs', step: 4, min: 0, max: 256, sub: 'Supports', off: noMono, help: 'A support column under the beam this often, each its own part. 0: none. Parts are cut over a support where they can.' },
      { key: 'monoSupportBricks', label: 'Support height, bricks', step: 1, min: 1, max: 30, off: noSupports, help: 'Height of the beam\'s underside above the baseplate. LEGO\'s supports: 5 and 10.' },
      { key: 'monoSupportPlates', label: 'Extra height, plates', step: 1, min: 0, max: 2, off: noSupports, help: 'Plates added on top of the bricks.' },
      { key: 'monoSupportBaseXStuds', label: 'Support base across, studs', step: 1, min: 2, max: 16, off: noSupports, help: 'Base plate size across the legs. LEGO\'s: 4 (short), 6 (tall).' },
      { key: 'monoSupportBaseYStuds', label: 'Support base along, studs', step: 1, min: 2, max: 16, off: noSupports, help: 'Base plate size along the track. LEGO\'s: 4 (short), 6 (tall).' },
      { key: 'monoSupportAntistud', label: 'Support grips the baseplate', check: true, off: noSupports, help: 'Hollow under the base with LEGO tubes.' },
      { key: 'monoSupportBaseStuds', label: 'Studs round the support base', check: true, off: noSupports, help: 'Studs along the base\'s edges to build onto, like LEGO\'s supports.' },
      { key: 'monoSupportSolid', label: 'Support frame closed', check: true, off: noSupports, help: 'A full web between the legs, no openings. Stiffer; more to print.' },
    ] },
  ];
  /** Why the monorail settings can't be changed: no monorail in the design (undefined: there is). */
  function noMono(_c?: OptCtx) { return d().routes.some(isMono) ? undefined : 'no monorail track in this design'; }
  function noSupports(c: OptCtx) { return noMono(c) ?? ((c.o.monoSupportStuds ?? 0) > 0 ? undefined : 'Support every is 0'); }
  return { form, noMono };
}
