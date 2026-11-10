// The downloads, as files (no page here): the parts to print as STL (one file, or a zip of them), and the parts to
// buy as a list (CSV) with a BrickLink wanted list (XML) of the LEGO ones.
import { zip } from '../geom/zip';
import { type LegoPart, legoParts } from './build';

/** A file to download. */
export interface Download { name: string; type: string; data: Uint8Array }
/** A piece, as much as the downloads need. */
type Part = { name: string; stl: Uint8Array; lego?: LegoPart[]; kit?: string; supports?: unknown; bedTurn?: number };

/** What the status line says of the printed parts that fit the bed only corner to corner (n of them, of `of` printed): their files are turned to lie so. */
export const turnedText = (n: number, of: number) => (!n ? '' : ` (${n === of && n > 1 ? 'all' : n} fit${n === 1 ? 's' : ''} the bed only turned diagonally: ${n === 1 ? 'its file is' : 'their files are'} turned already)`);
/** A test-print kit's coupon, as much as the README says of it (design.ts KitPart). */
type Coupon = { name: string; note?: string };

/** What the design's files are named after: its name, without what a file name can't have. */
export const fileBase = (name?: string) => (name || 'track-piece').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'track-piece';

/** The parts to print: one piece, its STL; several (a switch and its moving parts), a zip of them. Not the pieces that are bought. Undefined with none. */
export function stlDownload(pieces: Part[], base: string, kit?: Coupon[]): Download | undefined {
  const printed = pieces.filter((p) => !p.lego);
  if (!printed.length) return undefined;
  if (printed.length === 1) return { name: `${base}.stl`, type: 'model/stl', data: printed[0].stl };
  return { name: `${base}.zip`, type: 'application/zip', data: zip([...printed.map((p) => ({ name: `${base}-${p.name}.stl`, data: p.stl })), { name: 'README.txt', data: new TextEncoder().encode(stlReadme(pieces, base, kit)) }]) };
}

/** A part's kind (printedKinds: its name without the numbers, nor its kit coupon's name). */
const kindOf = (p: Part) => { const n = p.kit && p.name.startsWith(`${p.kit}-`) ? p.name.slice(p.kit.length + 1) : p.name; return n.replace(/\d+(-\d+)*/g, '').replace(/--+/g, '-').replace(/^-|-$/g, '') || n; };

/**
 * The README in the STL zip, for whoever prints it: what each file is, which way up, what to break off, how the
 * moving parts go in. Only what the parts themselves show (a throw, blades, a spring) is said. kit: a test-print
 * kit's coupons (what each one is).
 */
export function stlReadme(pieces: Part[], base: string, kit?: Coupon[]): string {
  const printed = pieces.filter((p) => !p.lego), has = (re: RegExp) => printed.some((p) => re.test(kindOf(p)));
  const out = [`${base}: ${printed.length} parts to print`, 'Made with Brick Track Designer.', ''];
  // (each file's place among those of its kind: "track part 3 of 8")
  const nth = (p: Part) => { const same = printed.filter((q) => kindOf(q) === kindOf(p)); return same.length > 1 ? ` (${same.indexOf(p) + 1} of ${same.length})` : ''; };
  if (kit?.length) {
    out.push('TEST PRINTS', "Each coupon's files start with its name. What to do with them, and the form to fill in: docs/test-prints.md in the app's repository (Help has the link).", '');
    for (const k of kit) if (k.note) out.push(`  ${k.name}: ${k.note}`);
    out.push('');
  }
  out.push('FILES (print one of each)');
  for (const p of printed) out.push(`  ${base}-${p.name}.stl: ${plainKind(kindOf(p))}${nth(p)}${p.supports ? ' [has break-out supports]' : ''}${p.bedTurn ? ' [turned to fit the bed: it goes on corner to corner]' : ''}`);
  const bought = legoParts(pieces);
  if (bought.length) out.push('', 'BOUGHT, NOT PRINTED (the Parts list button downloads this as a list, with a BrickLink wanted list)', ...bought.map((p) => `  ${p.qty} x ${p.name} (${p.part})`));
  out.push('', 'PRINTING',
    '  Each file lies on the bed the way it prints: leave it as it is. No slicer supports, no brim.',
    '  0.4 mm nozzle, 0.2 mm layers, PLA or PETG.');
  if (printed.some((p) => p.supports)) out.push('  The parts marked above are printed with small loose supports of their own (under rail ends, in sprung blades): snap them out with a small screwdriver, and check that nothing is left in the slots.');
  if (has(/throw|points|lever|spring/)) {
    out.push('', 'PUTTING THE POINTS TOGETHER (in this order)');
    const steps = ['Join the track parts and press them onto a baseplate.'];
    if (has(/throw/)) steps.push("The throw (the slider): down through the opening where the lever goes, then along its tunnel under the rails, till its posts stand up where the blades go.");
    if (has(/-spring$/)) steps.push("The spring (the thin flat part). A snap clamp: dropped over its two bosses in its pocket (between the blades, or on the lever's arm), sprung open over the slider's post; its two small links are loose in it and stay in. An over-centre spring: its rings pressed over their pins.");
    if (has(/points/)) steps.push("The blades: from above, each onto its pin and the slider's post, its front edge tilted in under the lip on the bed where there is one.");
    if (has(/(^|-)lever$/)) steps.push('The lever: pressed in between its two ears till its pivot clicks in, its foot in the slider.');
    if (has(/(^|-)lid$/)) steps.push('The lid: over the points, last of all.');
    steps.forEach((t, k) => out.push(`  ${k + 1}. ${t}`));
    out.push('  Move the lever: both blades should go over together and close against their rails.');
  }
  return `${out.join('\n')}\n`;
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
    const k = kindOf(p);
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
