// The downloads, as files (no page here): the parts to print as STL (one file, or a zip of them), and the parts to
// buy as a list (CSV) with a BrickLink wanted list (XML) of the LEGO ones.
import { zip } from '../geom/zip';
import { type LegoPart, legoParts } from './build';

/** A file to download. */
export interface Download { name: string; type: string; data: Uint8Array }
/** A piece, as much as the downloads need. */
type Part = { name: string; stl: Uint8Array; lego?: LegoPart[] };

/** What the design's files are named after: its name, without what a file name can't have. */
export const fileBase = (name?: string) => (name || 'track-piece').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'track-piece';

/** The parts to print: one piece, its STL; several (a switch and its moving parts), a zip of them. Not the pieces that are bought. Undefined with none. */
export function stlDownload(pieces: Part[], base: string): Download | undefined {
  const printed = pieces.filter((p) => !p.lego);
  if (!printed.length) return undefined;
  if (printed.length === 1) return { name: `${base}.stl`, type: 'model/stl', data: printed[0].stl };
  return { name: `${base}.zip`, type: 'application/zip', data: zip(printed.map((p) => ({ name: `${base}-${p.name}.stl`, data: p.stl }))) };
}

const from = (p: LegoPart) => (p.shop === 'bricktracks' ? 'BrickTracks' : 'LEGO (BrickLink)');
/** The parts to buy as CSV: part, name, how many, where from. */
export function partsCsv(parts: LegoPart[]): string {
  return ['Part,Name,Quantity,From', ...parts.map((p) => `${p.part},"${p.name.replace(/"/g, '""')}",${p.qty},${from(p)}`)].join('\n');
}
/** LEGO's track pieces: made in dark bluish grey (BrickLink's colour 85) only. */
export const TRACK_PARTS = new Set(['53401', '53400', '53407', '53404']);
/**
 * The LEGO parts as a BrickLink wanted list (its upload format), not what's bought elsewhere. The track in the colour
 * it comes in (85, dark bluish grey); the plates and bricks (ballast under straights, risers) with no colour said,
 * which BrickLink takes as any: they're whatever colour you like.
 */
export function wantedListXml(parts: LegoPart[]): string {
  return `<INVENTORY>\n${parts.filter((p) => !p.shop).map((p) => `  <ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>${p.part}</ITEMID>${TRACK_PARTS.has(p.part) ? '<COLOR>85</COLOR>' : ''}<MINQTY>${p.qty}</MINQTY></ITEM>`).join('\n')}\n</INVENTORY>\n`;
}
/** The parts to buy: a zip of the list and the wanted list. Undefined with nothing bought. */
export function partsDownload(pieces: Part[], base: string): Download | undefined {
  const parts = legoParts(pieces);
  if (!parts.length) return undefined;
  const enc = new TextEncoder();
  return { name: `${base}-lego-parts.zip`, type: 'application/zip', data: zip([{ name: `${base}-lego-parts.csv`, data: enc.encode(partsCsv(parts)) }, { name: `${base}-bricklink-wanted-list.xml`, data: enc.encode(wantedListXml(parts)) }]) };
}

/** The printed parts by kind, the most first: their names without the numbers (track, track-ballast, points-a). */
export function printedKinds(pieces: Part[]): [string, number][] {
  const kinds = new Map<string, number>();
  for (const p of pieces) {
    if (p.lego) continue;
    const k = p.name.replace(/\d+(-\d+)*/g, '').replace(/--+/g, '-').replace(/^-|-$/g, '') || p.name;
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  return [...kinds].sort((a, b) => b[1] - a[1]);
}

/** A kind of printed part (printedKinds: track, points-a, switch-throw) in plain words, for the parts list; one this doesn't know, as it is. */
export function plainKind(kind: string): string {
  const rules: [RegExp, string][] = [
    [/throw.*-posts$/, 'Posts for the throw'],
    [/(^|-)throw$/, 'Throw (the slider that moves the points)'],
    [/-spring$/, 'Points spring'],
    [/(^|-)lever$/, 'Lever'],
    [/(^|-)bracket$/, 'Lever bracket'],
    [/(^|-)lid$/, 'Lid over the points'],
    [/(^|-)frame$/, 'Monorail points frame'],
    [/points-a$/, 'Points blade (first of the two)'],
    [/points-b$/, 'Points blade (second of the two)'],
    [/(^|-)points$/, 'Points blades'],
    [/^monorail-support$/, 'Monorail support'],
    [/^track-support$/, 'Pillar under raised track'],
    [/-ballast$/, 'Ballast (printed apart from its track)'],
    [/-track$/, 'Track (seated in its ballast)'],
    [/^monorail/, 'Monorail track'],
    [/-base$|^track$|^switch$|^crossing$/, 'Track'],
  ];
  return rules.find(([re]) => re.test(kind))?.[1] ?? kind;
}
