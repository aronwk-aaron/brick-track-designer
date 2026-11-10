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
/** The LEGO parts as a BrickLink wanted list (its upload format; colour 85, dark bluish grey): not what's bought elsewhere. */
export function wantedListXml(parts: LegoPart[]): string {
  return `<INVENTORY>\n${parts.filter((p) => !p.shop).map((p) => `  <ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>${p.part}</ITEMID><COLOR>85</COLOR><MINQTY>${p.qty}</MINQTY></ITEM>`).join('\n')}\n</INVENTORY>\n`;
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
