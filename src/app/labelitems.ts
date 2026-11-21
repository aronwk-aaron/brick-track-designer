// (expert, stage 6) Labels as things of their own (Design.expert.labels): the text engraved under a part, placed by
// hand. Each belongs to the part it lies under (the build finds it there, by where it is): one placed by hand is that
// part's label instead of the app's; one marked off takes the app's away. The app's own labels (one a part, where the
// build put it: its overlay's labels) are tapped as well, and become hand labels on their first change (D6).
// Engraved only under a flat underside (Ballast underside: Flat), as the app's. Pure: no canvas, nothing built.
import type { PieceOptions } from './design';

/**
 * A label placed by hand: its middle at `at` (studs on the plan), the text's way `heading` degrees (as a track's: 0
 * runs up the plan); text: its own (left out: the part's own label, as the app makes it, on one line); cap: its
 * capitals' height, mm (left out: as big as fits, up to 6); off: no label on the part under it (an app's taken off).
 */
export interface LabelItem { id: string; at: [number, number]; heading: number; text?: string; cap?: number; off?: true }

/** The most labels kept, the longest text, the capitals' height range (mm), how far out on the plan (studs). */
export const LABEL_MAX = 200, LABEL_TEXT_MAX = 24, LABEL_CAP = [2.5, 6] as const, REACH = 10000;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r2 = (v: number) => Math.round(v * 100) / 100;
const norm = (h: number) => r2((((h % 360) + 540) % 360) - 180);

/** A label's text as kept: one line, capitals, at most LABEL_TEXT_MAX long. */
export const labelTextOf = (t: string) => t.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, LABEL_TEXT_MAX);

/** A file's labels as kept: well-formed, each with an id of its own, numbers in range. Undefined: none. */
export function cleanLabels(v: unknown): LabelItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: LabelItem[] = [];
  for (const x of v.slice(0, LABEL_MAX) as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object' || !Array.isArray(x.at) || !fin(x.at[0]) || !fin(x.at[1]) || Math.abs(x.at[0]) > REACH || Math.abs(x.at[1]) > REACH) continue;
    let id = typeof x.id === 'string' && x.id && x.id.length <= 40 ? x.id : '';
    if (!id || out.some((q) => q.id === id)) id = nextLabelId(out);
    const text = typeof x.text === 'string' ? labelTextOf(x.text) : undefined;
    const cap = fin(x.cap) ? r2(Math.min(LABEL_CAP[1], Math.max(LABEL_CAP[0], x.cap))) : undefined;
    out.push({ id, at: [r2(x.at[0] as number), r2(x.at[1] as number)], heading: fin(x.heading) ? norm(x.heading) : 0,
      ...(x.off === true ? { off: true as const } : { ...(text && { text }), ...(cap !== undefined && { cap }) }) });
  }
  return out.length ? out : undefined;
}
/** An id not yet used: l1, l2, ... */
export function nextLabelId(list: readonly { id: string }[]): string {
  let n = list.length + 1;
  while (list.some((q) => q.id === `l${n}`)) n++;
  return `l${n}`;
}
/** Why labels can't be engraved with these settings (undefined: they can): a flat underside only. */
export const labelsOff = (o: Partial<PieceOptions> | undefined): string | undefined =>
  ((o?.ballast ?? 'none') !== 'none' && o?.bottomStyle === 'float' ? undefined : 'labels go only on a flat underside: set Ballast layers to 1 or 2 and Ballast underside to Flat');
/** A label moved by (dx, dy) studs. */
export const moveLabel = (l: LabelItem, dx: number, dy: number): LabelItem => ({ ...l, at: [r2(l.at[0] + dx), r2(l.at[1] + dy)] });
/** Turned by deg degrees. */
export const turnLabel = (l: LabelItem, deg: number): LabelItem => ({ ...l, heading: norm(l.heading + deg) });

/** How big it's drawn on the plan (studs): its length along its way and its height, for the text it has (cap mm; undefined: 4). */
export function labelBox(text: string, cap = 4): { len: number; h: number } {
  // (the font's capitals are about 0.62 of their height wide, with their spacing: near enough for a box to tap)
  return { len: Math.max(2, (text.length * cap * 0.72) / 8), h: Math.max(0.75, cap / 8) };
}
/** How far a point on the plan is outside a label's box (0: in it), studs. */
export function labelDistance(l: Pick<LabelItem, 'at' | 'heading'>, text: string, cap: number | undefined, w: [number, number]): number {
  const h = (l.heading * Math.PI) / 180, dx = w[0] - l.at[0], dy = w[1] - l.at[1];
  const along = -dx * Math.sin(h) + dy * Math.cos(h), across = dx * Math.cos(h) + dy * Math.sin(h), b = labelBox(text, cap);
  return Math.hypot(Math.max(0, Math.abs(along) - b.len / 2), Math.max(0, Math.abs(across) - b.h / 2));
}
/** What it's called on its card and the selection bar. */
export function labelItemText(l: LabelItem | undefined, part?: string): string {
  if (!l) return `Label${part ? ` under ${part}` : ''} (the app's)`;
  if (l.off) return 'Label taken off';
  return `Label${l.text ? ` "${l.text}"` : ''}, placed by hand`;
}
