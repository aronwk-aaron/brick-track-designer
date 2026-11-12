// Which sections a route's card shows, in what order, and what each says when it is shut. A section whose whole feature can't apply to
// the route (guard rails and a third rail on a monorail, end connectors and buffer stops likewise) isn't shown at all; a feature that
// is off is one line (its title and switch), its options coming only once it's on. Pure: main.ts draws what this says.
import { type Design, isMono, RAIL_DEFAULTS, routeGaugeStuds, type DRoute } from './design';
import { cutsSummary } from './routecuts';
import { hasPartOwn, inForce, liveOwn, partGroups, resolveOptions } from './overrides';
import { PART_KEYS } from './routeown';
import { sharedOf, sleepersSummary } from './sleeperedits';

export type SectionId = 'shape' | 'place' | 'ends' | 'guard' | 'dual' | 'bed' | 'sleepers' | 'levers' | 'height' | 'cuts';
export interface CardSection {
  id: SectionId;
  /** the names the card uses */
  title: string;
  /** what it says beside the title when shut ("on · points at both ends") */
  summary: string;
  /** a section with a switch of its own (guard rails, dual gauge): whether it's on; its options show only then */
  on?: boolean;
  /** (a section with a switch) why the switch can't be turned on now, in a few words */
  locked?: string;
  /** a plain note for the open section (the two rail kinds both on a route that has them: they can clash) */
  note?: string;
}
export interface CardContext { /** the plan knows this route branches off another (a switch's): its lever has a side */ branches: boolean }

const ENDS = { none: 'no points', start: 'point at the start', end: 'point at the end', both: 'points at both ends' } as const;
/** "on · points at both ends, gap 0.8" and so on. */
export function guardSummary(r: DRoute): string {
  if (!r.guardRails) return 'off';
  const v = { ...RAIL_DEFAULTS, ...Object.fromEntries(Object.entries(r).filter(([, x]) => x !== undefined)) } as typeof RAIL_DEFAULTS;
  return `on · ${ENDS[v.guardRailEnds]}, gap ${v.guardRailGapStuds} stud${v.guardRailGapStuds === 1 ? '' : 's'}`;
}
export function dualSummary(d: Design, r: DRoute): string {
  if (!r.dualGauge) return 'off';
  const v = { ...RAIL_DEFAULTS, ...Object.fromEntries(Object.entries(r).filter(([, x]) => x !== undefined)) } as typeof RAIL_DEFAULTS;
  const gs = routeGaugeStuds(d, r);
  return `on · ${v.dualGaugeStuds} of ${gs} studs, ${v.dualShared === 'centre' ? 'centred (four rails)' : `${v.dualShared} rail shared`}`;
}
const endsSummary = (r: DRoute) => [r.startEnd === 'buffer' && 'buffer stop at the start', r.endEnd === 'buffer' && 'buffer stop at the end'].filter(Boolean).join(', ') || 'end connectors';

/** What a track's bed is ("sleepers", "ballast"), and whose: its own, another track's it's one part with, or the design's. */
export function bedSummary(d: Design, r: DRoute): string {
  const i = d.routes.indexOf(r), o = i >= 0 ? inForce(d, i) : resolveOptions(d, r);
  const bed = o.ballast === 'buddy' ? 'ballast + buddy layer' : o.ballast === 'ballast' ? 'ballast' : o.sleepers === 'sleepers' ? 'sleepers' : 'solid bed';
  const from = i >= 0 && hasPartOwn(d) ? partGroups(d).takes[i] : undefined;
  const st = r.stretches?.length ? ` · ${r.stretches.length} ${r.stretches.length === 1 ? 'stretch' : 'stretches'} with ${r.stretches.length === 1 ? 'its' : 'their'} own` : '';
  return `${bed} · ${from !== undefined ? `as ${d.routes[from].name || `route ${from + 1}`} (one part)` : Object.keys(liveOwn(d, r, PART_KEYS)).length ? 'its own' : 'design default'}${st}`;
}
/** The sections of a route's card, in their fixed order. */
export function cardSections(d: Design, r: DRoute, ctx: CardContext): CardSection[] {
  const mono = isMono(r), out: CardSection[] = [
    { id: 'shape', title: 'Shape', summary: `${r.segs.length} piece${r.segs.length === 1 ? '' : 's'}` },
    { id: 'place', title: 'Place', summary: `${r.x}, ${r.y} · ${r.heading}°${mono ? ' · monorail' : ''}${!mono && r.gaugeStuds !== undefined && r.gaugeStuds !== d.gaugeStuds ? ` · gauge ${r.gaugeStuds}` : ''}` },
  ];
  if (!mono) out.push({ id: 'ends', title: 'Ends', summary: endsSummary(r) });
  if (!mono) {
    // (guard rails and a third rail share the space inside the running rail: one or the other per track; a file that has both still opens, with a note)
    const both = !!r.guardRails && !!r.dualGauge, clash = 'Both are on, and the build lays both (guard rails inside each running rail, the third rail beside one): they can clash. Turn one off.';
    out.push(
      { id: 'guard', title: 'Guard rails', summary: guardSummary(r), on: !!r.guardRails, ...(r.dualGauge && !r.guardRails && { locked: 'not with dual gauge: the inner rail is in the way' }), ...(both && { note: clash }) },
      { id: 'dual', title: 'Dual gauge', summary: dualSummary(d, r), on: !!r.dualGauge, ...(r.guardRails && !r.dualGauge && { locked: 'not with guard rails: they are in the way of the third rail' }), ...(both && { note: clash }) });
    // (expert: its bed, sleepers, ballast and underside, the design's unless it has its own)
    out.push({ id: 'bed', title: 'Bed and underside', summary: bedSummary(d, r) });
    // (expert: its sleepers edited by hand, and the ones it shares with the track beside)
    { const i = d.routes.indexOf(r), sh = i >= 0 ? sharedOf(d, i).length : 0; out.push({ id: 'sleepers', title: 'Sleepers', summary: `${sleepersSummary(r)}${sh ? ' · shared with the track beside' : ''}` }); }
  }
  if (ctx.branches || (r.throwSide !== undefined && r.throwSide !== 'auto')) out.push({ id: 'levers', title: 'Points and levers', summary: `lever on the ${r.throwSide && r.throwSide !== 'auto' ? r.throwSide : (d.options?.throwSide ?? 'auto') === 'auto' ? 'auto side' : d.options?.throwSide}` });
  const h = r.monoHeight, he = r.monoHeightEnd;
  out.push({ id: 'height', title: mono ? 'Height' : 'Height and grade', summary: h === undefined && he === undefined ? 'on the baseplate' : he !== undefined ? `${h ?? 0} to ${he} plates` : `${h} plates` });
  // (expert: where its track is cut into parts by hand; a monorail beam's parts are its own)
  if (!mono) out.push({ id: 'cuts', title: 'Cuts into parts', summary: cutsSummary(r) });
  return out;
}

/** An option of a section that's locked by another choice: why, in a few words (always non-empty). Options not locked are absent. */
export function lockedOptions(r: DRoute): Record<string, string> {
  const out: Record<string, string> = {};
  if (r.guardRails) {
    if (!r.guardRailEnds || r.guardRailEnds === 'none') for (const k of ['Point length', 'Point shape', 'Nose ramp']) out[k] = 'only with Guard rail points set';
  }
  return out;
}
