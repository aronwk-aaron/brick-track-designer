// A report of a problem, for whoever has to reproduce it: the design as it is, what the app knew (its version, window,
// settings, the build's words and warnings, the view), the two pictures and a note, in one zip. The report's contents
// are worked out here, from what the page hands over (nothing here touches the page); main.ts reads the page.
import { type Design, OPTION_DEFAULTS, type PieceOptions } from './design';
import { unzip } from '../geom/unzip';
import { zip } from '../geom/zip';

declare const __BTD_VERSION__: string | undefined;
/** The app's version: the commit it was built from ('dev' where the build didn't say). */
export const APP_VERSION = typeof __BTD_VERSION__ === 'string' && __BTD_VERSION__ ? __BTD_VERSION__ : 'dev';

export type V3 = [number, number, number];
export interface ReportInput {
  version: string; now: Date; userAgent: string; window: { width: number; height: number; pixelRatio: number };
  design: Design; defaults?: Partial<PieceOptions>;
  status: { info: string; problem: string };
  warnings: string[];
  issues: { at: [number, number]; r: number; text: string }[];
  buildMs?: number;
  pieces: { name: string; lego?: boolean; size?: V3 }[];
  toggles: { auto: boolean; show3d: boolean; shown: string[]; explode: number; mode: string };
  selection: number[];
  plan: { scale: number; ox: number; oy: number };
  camera: { position: V3; target: V3; up: V3 };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** The settings that differ from the defaults: name to its value. */
export function settingsChanged(options: Partial<PieceOptions> | undefined, defaults: Partial<PieceOptions> = OPTION_DEFAULTS): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(options ?? {})) if (v !== undefined && !same(v, (defaults as Record<string, unknown>)[k])) out[k] = v;
  return out;
}

const r2 = (v: number, p = 100) => Math.round(v * p) / p;
const v3 = (v: V3): V3 => [r2(v[0], 1000), r2(v[1], 1000), r2(v[2], 1000)];
/** What goes in report.json. */
export function buildReport(i: ReportInput) {
  return {
    what: 'A problem report from Brick Track Designer: design.btd.json is the design as it was; plan.png and view3d.png are the two views as they were.',
    app: { version: i.version, userAgent: i.userAgent },
    date: i.now.toISOString(),
    window: i.window,
    design: { name: i.design.name ?? null, routes: i.design.routes.length, tables: i.design.tables?.length ?? 0, gaugeStuds: i.design.gaugeStuds, system: [...new Set(i.design.routes.map((r) => r.system ?? 'train'))] },
    settingsChanged: settingsChanged(i.design.options, i.defaults),
    build: {
      status: i.status.info, problem: i.status.problem,
      warnings: i.warnings,
      issues: i.issues.map((s) => ({ at: [r2(s.at[0] / 8), r2(s.at[1] / 8)], atUnit: 'studs', radiusMm: r2(s.r), text: s.text })),
      ms: i.buildMs === undefined ? null : Math.round(i.buildMs),
      parts: i.pieces.map((p) => ({ name: p.name, bought: !!p.lego, sizeMm: p.size ? [r2(p.size[0], 10), r2(p.size[1], 10), r2(p.size[2], 10)] : null })),
    },
    toggles: i.toggles,
    selection: i.selection,
    views: { plan: { scale: r2(i.plan.scale, 1000), ox: r2(i.plan.ox), oy: r2(i.plan.oy) }, view3d: { position: v3(i.camera.position), target: v3(i.camera.target), up: v3(i.camera.up) } },
  };
}
export type Report = ReturnType<typeof buildReport>;

const pad = (n: number) => String(n).padStart(2, '0');
/** btd-report-<design name or 'untitled'>-<YYYYMMDD-HHMMSS>.zip (the date and time as the clock says). */
export function reportName(designName: string | undefined, now: Date): string {
  const base = (designName ?? '').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
  return `btd-report-${base}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.zip`;
}

/** The report's zip: the design, the report, the two pictures (PNG bytes; left out if there are none) and the note. */
export function reportZip(i: ReportInput, note: string, pngs: { plan?: Uint8Array; view3d?: Uint8Array }): Uint8Array {
  const enc = new TextEncoder();
  const files = [
    { name: 'design.btd.json', data: enc.encode(JSON.stringify(i.design, null, 2)) },
    { name: 'report.json', data: enc.encode(JSON.stringify(buildReport(i), null, 2)) },
    ...(pngs.plan ? [{ name: 'plan.png', data: pngs.plan }] : []),
    ...(pngs.view3d ? [{ name: 'view3d.png', data: pngs.view3d }] : []),
    { name: 'note.txt', data: enc.encode(`${note.trim()}\n`) },
  ];
  return zip(files, i.now);
}

/** A report zip read back: its design (not checked: readDesign does that), its report and its note. */
export function readReportZip(bytes: Uint8Array): { design: unknown; report?: Report; note: string } {
  const files = unzip(bytes), dec = new TextDecoder();
  const d = files.get('design.btd.json');
  if (!d) throw new Error("it's a zip, but not one of this app's reports (no design.btd.json in it)");
  let design: unknown, report: Report | undefined;
  try { design = JSON.parse(dec.decode(d)); } catch { throw new Error('the design in the report is damaged'); }
  try { const r = files.get('report.json'); report = r ? (JSON.parse(dec.decode(r)) as Report) : undefined; } catch { report = undefined; }
  return { design, report, note: dec.decode(files.get('note.txt') ?? new Uint8Array()).trim() };
}

/** A PNG's bytes from a canvas's data URL (undefined if it isn't one). */
export function pngBytes(dataUrl: string): Uint8Array | undefined {
  const m = /^data:image\/png;base64,(.*)$/.exec(dataUrl);
  if (!m) return undefined;
  const s = atob(m[1]), out = new Uint8Array(s.length);
  for (let k = 0; k < s.length; k++) out[k] = s.charCodeAt(k);
  return out;
}

// ---------- the designs built lately, kept in the browser ----------
export interface BuiltEntry { json: string; at: number; status: string; name?: string }
export const BUILT_MAX = 20, BUILT_CHARS = 3_000_000;
/** The list with a design that has just built put first (the same design again: moved up, its time and words fresh), the last 20, within a size. */
export function pushBuilt(list: BuiltEntry[], e: BuiltEntry, max = BUILT_MAX, chars = BUILT_CHARS): BuiltEntry[] {
  const out = [e, ...list.filter((x) => x.json !== e.json)].slice(0, max);
  let size = out.reduce((t, x) => t + x.json.length + x.status.length, 0);
  while (out.length > 1 && size > chars) { const g = out.pop()!; size -= g.json.length + g.status.length; }
  return out;
}
/** The list as saved text read back; anything not right is left out. */
export function readBuilt(text: string | null): BuiltEntry[] {
  try {
    const v = JSON.parse(text ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is BuiltEntry => !!x && typeof x.json === 'string' && typeof x.at === 'number' && typeof x.status === 'string').slice(0, BUILT_MAX) : [];
  } catch { return []; }
}
