// The settings panel's groups: which settings belong together (by what they are about), in a fixed order, what shows
// in each (a feature that's off is its switch alone), which groups the design doesn't use, and what's away from its
// default. Pure: the panel (main.ts) only draws what this says. The settings themselves are in settings.ts.
import { type Design, isMono, OPTION_DEFAULTS, type PieceOptions } from './design';
import type { OptCtx, OptField, OptSection } from './settings';

/** What the design has, for marking the groups it doesn't use. */
export interface Facts { tracks: boolean; train: boolean; mono: boolean; switches: boolean | undefined; banked: boolean; buffers: boolean }
export function designFacts(d: Design, switches: boolean | undefined): Facts {
  const routes = d.routes.filter((r) => r.segs.length);
  return {
    tracks: routes.length > 0, train: routes.some((r) => !isMono(r)), mono: routes.some(isMono), switches,
    banked: d.routes.some((r) => r.segs.some((sg) => sg.kind === 'curve' && (sg.bank ?? 0) > 0)),
    buffers: d.routes.some((r) => r.startEnd === 'buffer' || r.endEnd === 'buffer'),
  };
}

export interface Group {
  id: string; title: string;
  /** the design must have this for the group to apply: set before drawing, it's still a design default */
  needs?: 'train' | 'mono' | 'switches' | 'banked' | 'buffers';
  /** the settings in it, in order; a heading over the one it names */
  keys: string[]; subs?: Record<string, string>;
}
/** Every setting in one group, once (a test checks it). */
export const GROUPS: Group[] = [
  { id: 'bed', title: 'Printer and bed', keys: ['printBedX', 'printBedY'] },
  { id: 'cuts', title: 'Cutting and joints', keys: ['splitTrack', 'pieceLengthStuds', 'baseplate', 'baseplateX', 'baseplateY', 'studsAtCuts', 'joint', 'axleStuds', 'tongueRails', 'endSupports', 'pegOnBallast', 'axleHoles'],
    subs: { splitTrack: 'Cutting', joint: 'Joints' } },
  { id: 'fits', title: 'Fits and clearances', keys: ['studFit', 'antistudFit', 'trackFitTol'] },
  { id: 'track', title: 'Track and rails', needs: 'train', keys: ['gaugeStuds', 'raisedOn', 'curveStuds', 'studsFullPitch'] },
  { id: 'ballast', title: 'Sleepers and ballast', needs: 'train', keys: ['sleepers', 'sleeperWidthStuds', 'sleeperGapStuds', 'ballast', 'ballastLeftStuds', 'ballastRightStuds', 'ballastEnds', 'trackBallast'] },
  { id: 'under', title: 'Underside', keys: ['bottomStyle', 'undersideGrid', 'grip'] },
  { id: 'labels', title: 'Labels', keys: ['labelText', 'labelSize', 'labelGauge', 'labelParts'] },
  { id: 'points', title: 'Points and levers', needs: 'switches', subs: { mechStyle: 'Points', pointsPieces: 'Spring tines', throwStyle: 'Levers and throws' },
    keys: ['mechStyle', 'pointBlades', 'bladeStyle', 'bladeRelief', 'bladeLip', 'pointThrow', 'pointClearance', 'springPreload', 'pointsPieces', 'pointsModule', 'springThickness', 'springLength', 'bladeDiscD',
      'throwStyle', 'leverHousing', 'threeWayLevers', 'boxedThrow', 'throwAction', 'throwSide', 'leverOffset', 'throwBallast'] },
  { id: 'check', title: 'Check rails and flangeways', needs: 'train', keys: ['checkRailLen', 'checkRailW', 'checkRailFlare', 'flangeway', 'flangewayDepth'] },
  { id: 'bank', title: 'Banked curves', needs: 'banked', keys: ['bankRampAt', 'bankRampStuds', 'bankClimb'] },
  { id: 'buffer', title: 'Buffer stops', needs: 'buffers', keys: ['bufferStyle', 'bufferPostPlates', 'bufferBeamBottom', 'bufferBeamTop', 'bufferPinHoles'] },
  { id: 'bought', title: 'Bought track', needs: 'train', keys: ['legoTrack', 'boughtBallast'] },
  { id: 'mono', title: 'Monorail', needs: 'mono', subs: { monoSwitchFit: 'Points' }, keys: ['monoEndStuds', 'monoAxleHoles', 'monoAxleLengthStuds', 'monoHoleFit', 'monoLegoAntistud', 'monoLabels', 'monoSwitchFit'] },
  { id: 'monosup', title: 'Monorail supports', needs: 'mono', keys: ['monoSupportStuds', 'monoSupportBricks', 'monoSupportPlates', 'monoSupportBaseXStuds', 'monoSupportBaseYStuds', 'monoSupportAntistud', 'monoSupportBaseStuds', 'monoSupportSolid', 'monoRampJoint'] },
];

const UNUSED: Record<NonNullable<Group['needs']>, string> = {
  train: 'no train track in this design', mono: 'no monorail in this design', switches: 'no switches in this design yet',
  banked: 'no curve is banked in this design', buffers: 'no route ends in a buffer stop',
};
/** Why the group doesn't apply to this design (undefined: it does, or the design is empty). */
export function unusedWhy(g: Group, f: Facts): string | undefined {
  if (!g.needs || !f.tracks) return undefined;
  const has = g.needs === 'switches' ? f.switches !== false : g.needs === 'train' ? f.train : g.needs === 'mono' ? f.mono : g.needs === 'banked' ? f.banked : f.buffers;
  return has ? undefined : UNUSED[g.needs];
}

/** A feature that's off: the settings only it uses aren't listed (searching still finds them, locked). */
const HIDDEN_WHEN: Record<string, (c: OptCtx) => boolean> = {
  sleeperWidthStuds: (c) => c.ballast || c.o.sleepers !== 'sleepers', sleeperGapStuds: (c) => c.ballast || c.o.sleepers !== 'sleepers',
  ballastLeftStuds: (c) => !c.ballast, ballastRightStuds: (c) => !c.ballast, ballastEnds: (c) => !c.ballast,
  trackBallast: (c) => !c.ballast, trackFitTol: (c) => !c.ballast || c.o.trackBallast !== 'apart',
  bottomStyle: (c) => !c.ballast, undersideGrid: (c) => c.ballast,
  labelSize: (c) => !c.o.labelText, labelGauge: (c) => !c.o.labelText, labelParts: (c) => !c.o.labelText,
  pieceLengthStuds: (c) => c.o.splitTrack !== 'lengths', baseplateX: (c) => !((c.o.baseplate ?? 0) > 0), baseplateY: (c) => !((c.o.baseplate ?? 0) > 0),
  axleStuds: (c) => c.o.joint !== 'axle' && c.o.joint !== 'flataxle', pegOnBallast: (c) => !c.ballast, axleHoles: (c) => c.o.ballast !== 'buddy',
  // (the blades-on-top mechanism's settings, and the tines')
  pointBlades: (c) => !c.fdb, bladeStyle: (c) => !c.fdb, bladeRelief: (c) => !c.fdb, bladeLip: (c) => !c.fdb, throwAction: (c) => !c.fdb, leverHousing: (c) => !c.fdb || (c.o.throwStyle ?? 'built-in') !== 'built-in', boxedThrow: (c) => !c.fdb,
  pointsPieces: (c) => c.fdb, pointsModule: (c) => c.fdb, springThickness: (c) => c.fdb, springLength: (c) => c.fdb, bladeDiscD: (c) => c.fdb,
  throwBallast: (c) => !c.ballast,
  bufferPostPlates: (c) => c.o.bufferStyle !== 'blocks', bufferPinHoles: (c) => c.o.bufferStyle !== 'blocks',
  boughtBallast: (c) => c.o.ballast === 'none' || (c.o.legoTrack ?? 'lego') === 'print',
  monoAxleLengthStuds: (c) => c.o.monoAxleHoles === false,
  monoSupportBricks: (c) => !((c.o.monoSupportStuds ?? 0) > 0), monoSupportPlates: (c) => !((c.o.monoSupportStuds ?? 0) > 0), monoSupportBaseXStuds: (c) => !((c.o.monoSupportStuds ?? 0) > 0),
  monoSupportBaseYStuds: (c) => !((c.o.monoSupportStuds ?? 0) > 0), monoSupportAntistud: (c) => !((c.o.monoSupportStuds ?? 0) > 0),
  monoSupportBaseStuds: (c) => !((c.o.monoSupportStuds ?? 0) > 0), monoSupportSolid: (c) => !((c.o.monoSupportStuds ?? 0) > 0), monoRampJoint: (c) => !((c.o.monoSupportStuds ?? 0) > 0),
};

export interface Row { f: OptField; /** heading over it */ sub?: string; /** why it can't be changed now */ off?: string; /** a feature that's off: listed only when searched for */ hidden: boolean; changed: boolean }
export interface GroupView {
  group: Group; rows: Row[]; /** how many settings are away from their default */ changed: number; total: number;
  /** settings not listed because their feature is off */ hiddenCount: number; unused?: string; summary: string;
}
const same = (a: unknown, b: unknown) => (typeof a === 'number' || typeof b === 'number' ? Math.abs(Number(a) - Number(b)) < 1e-9 : String(a) === String(b));
const dflt = (f: OptField) => f.def ?? (OPTION_DEFAULTS as unknown as Record<string, unknown>)[f.key];
const value = (f: OptField, o: PieceOptions) => (f.get ? f.get() : (o as unknown as Record<string, unknown>)[f.key]);
/** Is this setting away from its default? (a text: empty is the default) */
export function isChanged(f: OptField, o: PieceOptions): boolean {
  const v = value(f, o), d = dflt(f);
  return f.check ? (v !== false) !== (d !== false) : f.text ? String(v ?? '') !== String(d ?? '') : !same(v, d);
}
/** The text a search looks in. */
export const searchText = (f: OptField) => [f.label, f.help, ...(f.choices ?? []).flatMap((ch) => [ch.t, ch.tip])].join(' ').toLowerCase();
/** The groups as the panel shows them, for this design's options and facts, and a search (words that must all be in a setting's text). */
export function groupView(form: OptSection[], c: OptCtx, facts: Facts, query = ''): GroupView[] {
  const fields = new Map(form.flatMap((s) => s.fields).map((f) => [f.key, f]));
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out: GroupView[] = [];
  for (const g of GROUPS) {
    const rows: Row[] = [];
    let changed = 0, hiddenCount = 0, total = 0;
    for (const key of g.keys) {
      const f = fields.get(key); if (!f) continue;
      total++;
      const hidden = HIDDEN_WHEN[key]?.(c) ?? false, ch = isChanged(f, c.o);
      if (ch) changed++;
      if (words.length ? !words.every((w) => searchText(f).includes(w)) : hidden) { if (hidden) hiddenCount++; continue; }
      rows.push({ f, sub: g.subs?.[key], off: f.off?.(c), hidden, changed: ch });
    }
    if (words.length && !rows.length) continue;
    const unused = unusedWhy(g, facts);
    out.push({ group: g, rows, changed, total, hiddenCount, unused, summary: changed ? `${changed} changed` : '' });
  }
  return out;
}
/** Back to the default for these settings (a group's "Reset group"): the options dropped; the gauge (a design field) set to its default. */
export function resetFields(d: Design, fields: OptField[]) {
  const o = { ...d.options } as Record<string, unknown>;
  for (const f of fields) { if (f.key === 'gaugeStuds') f.set?.(f.def ?? 4); else delete o[f.key]; }
  d.options = o as Design['options'];
}
/** The settings of a group, in its order. */
export const groupFields = (form: OptSection[], g: Group): OptField[] => g.keys.flatMap((k) => form.flatMap((s) => s.fields).filter((f) => f.key === k));
