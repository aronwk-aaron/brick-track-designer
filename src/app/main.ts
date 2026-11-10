// The editor: routes on the left (in studs and degrees), the plan view and the
// 3D piece on the right, rebuilt in a worker as you edit.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BANK_MAX, type BankRamps, type Design, type DRoute, type DSeg, OPTION_DEFAULTS, type PieceOptions, RAIL_DEFAULTS, TEMPLATE_GROUPS, TEMPLATES, type Trackwork, endOf, freeName, isMono, readDesign } from './design';
import { TrackCanvas, type OverlayItem, dialogOpen, leverSide, leverSlides, typingIn } from './canvas';
import { describe } from './planner';
import { BRICKTRACKS_COLOR, gradeOf, LEGO_COLOR, type LegoPart, legoParts, type Piece } from './build';
import { TABLE_COLORS, type Table, tableAt } from './tables';
import { zip } from '../geom/zip';
import { layoutParts } from './layoutparts';
import { PALETTE, placePart } from './palette';
import { BuildRunner, type WorkerPort } from './buildrun';
import { History } from './history';
import { fileBase as fileBaseOf, partsDownload, printedKinds, stlDownload } from './exports';
import { mirrorRoute } from './routeedits';
import { type OptChoice, optionForm, type OptCtx, type OptField } from './settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const routesEl = $('routes'), infoEl = $('info'), errEl = $('error');
const STORE = 'btd-design';

// ---------- the document ----------
let design: Design = load() ?? { version: 1, gaugeStuds: 4, routes: [] };
// Undo history: designs as JSON, the current one last (history.ts).
const history = new History(JSON.stringify(design));

function load(): Design | undefined {
  try { const s = localStorage.getItem(STORE); return s ? readDesign(JSON.parse(s)) : undefined; } catch { return undefined; }
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(design)); } catch { /* storage off: fine */ } }

// ---------- the form ----------
const num = (v: number, set: (n: number) => void, step = 1, label = '') => {
  const i = document.createElement('input');
  i.type = 'number'; i.step = String(step); i.value = String(Math.round(v * 1000) / 1000); i.title = label; // (shown to 3 places: the full value's kept till it's changed)
  i.addEventListener('change', () => { const n = Number(i.value); if (Number.isFinite(n)) { set(n); changed(); } });
  return i;
};
const btn = (text: string, fn: () => void, title = '') => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.title = title;
  b.addEventListener('click', () => { fn(); changed(true); });
  return b;
};
const field = (label: string, ...els: HTMLElement[]) => {
  const d = document.createElement('label'); d.className = 'field';
  const s = document.createElement('span'); s.textContent = label; d.append(s, ...els); return d;
};

function segRow(r: DRoute, k: number): HTMLElement {
  const sg = r.segs[k], row = document.createElement('div'); row.className = 'seg';
  if (sg.kind === 'straight') row.append(field('Straight, studs', num(sg.studs, (n) => { sg.studs = n; }, 1)));
  else row.append(field('Curve: radius, studs', (() => { const i = num(sg.radius, (n) => { const x = Math.min(1000, Math.max(24, n)); (sg as Extract<DSeg, { kind: 'curve' }>).radius = x; i.value = String(x); }, 8); i.min = '24'; i.max = '1000'; i.title = 'Radius in studs, 24 to 1000 (the usual curves run 24 + 8k)'; return i; })()),
    field('angle ° (+ left)', num(sg.angle, (n) => { (sg as Extract<DSeg, { kind: 'curve' }>).angle = n; }, 0.5)));
  row.append(btn('✕', () => { r.segs.splice(k, 1); }, 'Remove this segment'));
  row.append(...bankFields(sg, isMono(r)));
  return row;
}

type Choice = { v: string; t: string; tip: string; con?: string };
const LEFT_OUT = 'Left out within a sleeper length of another track (switches, crossings, a track close alongside).';
/** A route card's bridge guard rails and dual gauge (straight.scad's guard_* and dual_* settings): off by default, always shown, greyed out with the reason when they don't apply. */
function extraRailFields(r: DRoute, body: HTMLElement) {
  const d = { ...RAIL_DEFAULTS, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) } as typeof RAIL_DEFAULTS & DRoute;
  const opt = (off: string | undefined) => {
    const wrap = document.createElement('div'); body.append(wrap);
    const note = (txt: string, color = 'var(--muted)', bold = false) => {
      const n = document.createElement('small'); n.className = 'desc'; n.style.color = color; if (bold) n.style.fontWeight = '600'; n.textContent = txt; wrap.append(n);
    };
    const end = () => { if (off) { note(`Locked: ${off}.`, 'var(--warn)', true); for (const el of wrap.querySelectorAll<HTMLElement>('.field span, small.desc')) if (!el.textContent?.startsWith('Locked')) el.style.opacity = '0.5'; } };
    return { wrap, note, end };
  };
  const pick = (label: string, cur: string, def: string, choices: Choice[], set: (v: string) => void, off?: string, help?: string) => {
    const { wrap, note, end } = opt(off);
    const sel = document.createElement('select'); sel.disabled = !!off;
    for (const ch of choices) { const op = new Option(`${ch.t}${ch.v === def ? ' (default)' : ''}`, ch.v); op.title = [ch.tip, ch.con && `Drawback: ${ch.con}`].filter(Boolean).join(' '); sel.append(op); }
    sel.value = cur;
    sel.addEventListener('change', () => { set(sel.value); changed(true); });
    const f = field(label, sel); f.classList.add('stack'); wrap.append(f);
    const ch = choices.find((c) => c.v === cur);
    if (ch?.tip) note(ch.tip);
    if (ch?.con) note(`Drawback: ${ch.con}`, 'var(--ink)');
    if (help) note(help);
    end();
  };
  const studs = (label: string, v: number, def: number, step: number, min: number, max: number, set: (n: number) => void, help: string, off?: string) => {
    const { wrap, note, end } = opt(off);
    const i = num(v, (n) => { const x = Math.min(max, Math.max(min, n)); set(x); i.value = String(x); }, step, help); i.min = String(min); i.max = String(max); i.disabled = !!off;
    wrap.append(field(label, i));
    note(`${help} Range ${min} to ${max}, default ${def}.`);
    end();
  };
  const ends = (none: Choice, at: (where: string) => string, con?: string): Choice[] => [none,
    { v: 'start', t: 'Start', tip: at('the start (where the route was drawn from)'), con },
    { v: 'end', t: 'End', tip: at('the end'), con },
    { v: 'both', t: 'Both ends', tip: at('both ends'), con }];
  const gOff = r.guardRails ? undefined : 'only with Guard rails on';
  pick('Guard rails', r.guardRails ? 'on' : 'off', 'off', [
    { v: 'off', t: 'Off', tip: 'Just the two running rails.' },
    { v: 'on', t: 'On', tip: 'A guard rail just inside each running rail, as on bridges, to keep a derailed train on the track.', con: 'More to print. Fewer studs between the rails.' }],
  (v) => { r.guardRails = v === 'on' || undefined; }, undefined, LEFT_OUT);
  pick('Guard rail points', d.guardRailEnds, RAIL_DEFAULTS.guardRailEnds, ends(
    { v: 'none', t: 'None', tip: 'The guard rails run to both ends, with rail ends that join the next piece\'s guard rails.' },
    (w) => `The guard rails curve in to a point on the centre line at ${w}, as where a bridge starts.`),
  (v) => { r.guardRailEnds = v as DRoute['guardRailEnds']; }, gOff);
  studs('Guard rail gap, studs', d.guardRailGapStuds, RAIL_DEFAULTS.guardRailGapStuds, 0.05, 0.45, 1.25, (n) => { r.guardRailGapStuds = n; }, 'From each running rail\'s head to its guard rail. Real bridges: about a sixth of the gauge.', gOff);
  const pOff = gOff ?? (d.guardRailEnds === 'none' ? 'only with Guard rail points set' : undefined);
  studs('Point length, studs', d.guardRailTaperStuds, RAIL_DEFAULTS.guardRailTaperStuds, 1, 2, 24, (n) => { r.guardRailTaperStuds = n; }, 'From the point to where the guard rails run parallel. Shorter on a route too short for it.', pOff);
  pick('Point shape', d.guardRailTaperShape, RAIL_DEFAULTS.guardRailTaperShape, [
    { v: 'straight', t: 'Straight', tip: 'Straight in from the point, bent where they meet the parallel guard rails, as on real bridges.' },
    { v: 'curve', t: 'Curve', tip: 'One smooth curve from the point into the parallel guard rails.', con: 'Wider sooner, so fewer studs near the point.' }],
  (v) => { r.guardRailTaperShape = v as DRoute['guardRailTaperShape']; }, pOff);
  studs('Nose ramp, studs', d.guardRailNoseRampStuds, RAIL_DEFAULTS.guardRailNoseRampStuds, 0.25, 0, 5, (n) => { r.guardRailNoseRampStuds = n; }, 'The point\'s nose slopes from just above the bed up to the rail top over this length, so anything dragging rides over it. 0: no slope.', pOff);
  const gs = design.gaugeStuds, dOff = r.dualGauge ? undefined : 'only with Dual gauge on';
  pick('Dual gauge', r.dualGauge ? 'on' : 'off', 'off', [
    { v: 'off', t: 'Off', tip: 'One gauge.' },
    { v: 'on', t: 'On', tip: 'A third rail, so trains of a narrower gauge run on it and one running rail.', con: 'More to print. No studs near the third rail.' }],
  (v) => { r.dualGauge = v === 'on' || undefined; }, undefined, LEFT_OUT);
  studs('Narrow gauge, studs', d.dualGaugeStuds, RAIL_DEFAULTS.dualGaugeStuds, 1, 1, 9, (n) => { r.dualGaugeStuds = Math.round(n); }, 'Studs between the narrow gauge\'s rails (2: LEGO narrow gauge).', dOff);
  if (r.dualGauge && d.dualGaugeStuds >= gs) {
    const n = document.createElement('small'); n.className = 'desc'; n.style.fontWeight = '600';
    n.textContent = `Not built: the narrow gauge must be less than the track's ${gs} studs, so there is no third rail.`; body.append(n);
  }
  pick('Shared rail', d.dualShared, RAIL_DEFAULTS.dualShared, [
    { v: 'right', t: 'Right', tip: 'Both gauges use the right running rail, facing along the route as drawn.' },
    { v: 'left', t: 'Left', tip: 'Both gauges use the left running rail, facing along the route as drawn.' }],
  (v) => { r.dualShared = v as DRoute['dualShared']; }, dOff);
  pick('Ends meeting single gauge', d.dualPlainEnds, RAIL_DEFAULTS.dualPlainEnds, ends(
    { v: 'none', t: 'None', tip: 'The third rail has rail ends at both ends, to join the next dual-gauge piece.' },
    (w) => `The third rail stops short at ${w}, clear of a single-gauge piece's end connector.`, 'Narrow-gauge trains can\'t run on past that end.'),
  (v) => { r.dualPlainEnds = v as DRoute['dualPlainEnds']; }, dOff);
}

/** A curve's bank (superelevation): how far it leans in, and where it ramps from level. Always shown; locked on a straight, the ramps until there's a bank. */
function bankFields(sg: DSeg, mono: boolean): HTMLElement[] {
  const curve = sg.kind === 'curve' && !mono ? sg : undefined, noBank = mono ? 'monorail track doesn\'t bank' : 'only curves bank';
  const locked = (el: HTMLElement, why: string | undefined) => {
    if (!why) return el;
    const n = document.createElement('small'); n.className = 'desc why'; n.textContent = `Locked: ${why}.`;
    const d = document.createElement('div'); d.className = 'stack'; d.append(el, n); return d;
  };
  const bank = num(curve?.bank ?? 0, (n) => {
    if (!curve) return;
    const v = Math.min(Math.max(n, 0), BANK_MAX);
    if (v > 0) curve.bank = v; else { delete curve.bank; delete curve.bankRamps; }
    render();
  }, 0.5, 'The track leans in by this many degrees, about the inner rail: the outer rail is higher (4-stud gauge: 3° = 2.1 mm). The underside stays flat. 0 = level. Range 0 to 10, default 0.');
  bank.min = '0'; bank.max = String(BANK_MAX); bank.disabled = !curve;
  const sel = document.createElement('select');
  const choices: Record<BankRamps, [string, string]> = {
    both: ['Level at both route ends', 'Where the curve is at a route\'s end, the bank eases down to level before it (the ramps are set in the Banked curves settings). In the middle of a route the bank always eases from one curve to the next.'],
    start: ['Banked at the route\'s end', 'Where the curve ends a route, that end stays banked, to join more banked track; where it starts a route, it eases from level. Drawback: only banked track joins the banked end.'],
    end: ['Banked at the route\'s start', 'Where the curve starts a route, that end stays banked, to join more banked track; where it ends a route, it eases to level. Drawback: only banked track joins the banked end.'],
    none: ['Banked at both route ends', 'Where the curve is at a route\'s end, that end stays banked, to join more banked track. Drawback: only banked track joins it.'],
  };
  for (const [v, [t, tip]] of Object.entries(choices)) { const op = new Option(t, v); op.title = tip; sel.append(op); }
  sel.value = curve?.bankRamps ?? 'both';
  sel.title = choices[sel.value as BankRamps][1];
  sel.disabled = !curve?.bank;
  sel.addEventListener('change', () => { if (!curve) return; if (sel.value === 'both') delete curve.bankRamps; else curve.bankRamps = sel.value as BankRamps; changed(true); });
  return [
    locked(field('bank °', bank), curve ? undefined : noBank),
    locked(field('at a route end', sel), !curve ? noBank : !curve.bank ? 'set a bank first' : undefined),
  ];
}

// Which route cards are open (by index); the selected one always is.
const openCards = new Set<number>();

/** The route cards' sections open (by title), the same for every card, remembered in this browser. */
const openParts: Set<string> = (() => { try { const v = JSON.parse(localStorage.getItem('btd-card-parts') ?? 'null'); if (Array.isArray(v)) return new Set<string>(v); } catch { /* (none kept) */ } return new Set(['Shape']); })();
const keepParts = () => { try { localStorage.setItem('btd-card-parts', JSON.stringify([...openParts])); } catch { /* (not kept) */ } };
// ---------- the tables ----------
/** The Tables panel: each table's name, colour and shape in studs, to change; buttons to add one of each kind. */
function renderTables() {
  const body = $('tables-body'), ts = design.tables ?? [];
  $('tables-count').textContent = ts.length ? ` (${ts.length})` : '';
  body.replaceChildren();
  const bar = document.createElement('div'); bar.className = 'tbar';
  // (a new table: among the tracks' starts (or at the origin), on the 8-stud grid)
  const at = (): [number, number] => {
    const rs = design.routes;
    if (!rs.length) return [0, 0];
    const xs = rs.map((r) => r.x), ys = rs.map((r) => r.y);
    return [Math.round((Math.min(...xs) + Math.max(...xs)) / 16) * 8, Math.round((Math.min(...ys) + Math.max(...ys)) / 16) * 8];
  };
  const add = (t: Table) => { design.tables = [...ts, { name: `Table ${ts.length + 1}`, color: TABLE_COLORS[ts.length % TABLE_COLORS.length], ...t }]; };
  bar.append(
    btn('+ Rectangle', () => { const [x, y] = at(); add({ shape: 'rect', x: x - 16, y: y - 32, w: 32, h: 64 }); }, 'Add a rectangular table, 32 x 64 studs'),
    btn('+ Curved', () => { const [x, y] = at(); add({ shape: 'arc', cx: x, cy: y, r0: 32, r1: 64, a0: 0, a1: 90 }); }, 'Add a curved table: a quarter ring, radius 32 to 64 studs round a centre'),
    btn('+ Any shape', () => { const [x, y] = at(); add({ shape: 'poly', pts: [[x - 16, y - 16], [x + 16, y - 16], [x + 24, y + 16], [x - 16, y + 16]] }); }, 'Add a table of any shape: its corners in studs'));
  // (ready-made ones: the usual 30" by 60" table and its 6 and 8 foot ones (a stud 8 mm: 96 by 190, 228 and 304 studs),
  // a baseplate, a straight module, a quarter-circle corner module for a curve's radius (8 studs either side of the track))
  const presets: [string, (x: number, y: number) => Table][] = [
    ...([[190, '60"', ', the usual one'], [228, '72"', ''], [304, '96"', '']] as const).map(([h, ft, usual]): [string, (x: number, y: number) => Table] =>
      [`Table 30" × ${ft} (96 × ${h} studs)${usual}`, (x, y) => ({ shape: 'rect', x: x - 48, y: y - h / 2, w: 96, h })]),
    ['Baseplate, 32 × 32', (x, y) => ({ shape: 'rect', x: x - 16, y: y - 16, w: 32, h: 32 })],
    ['Straight module, 32 × 96', (x, y) => ({ shape: 'rect', x: x - 16, y: y - 48, w: 32, h: 96 })],
    ...[40, 56, 104, 120].map((r): [string, (x: number, y: number) => Table] => [`Corner module for R${r}, a quarter`, (x, y) => ({ shape: 'arc', cx: x, cy: y, r0: r - 8, r1: r + 8, a0: 0, a1: 90 })]),
  ];
  const pre = document.createElement('select'); pre.title = 'Add a ready-made table, by the tracks';
  pre.append(new Option('+ Ready-made…', ''), ...presets.map(([n], k) => new Option(n, String(k))));
  pre.addEventListener('change', () => { const k = Number(pre.value); if (pre.value !== '') { const [x, y] = at(); add(presets[k][1](x, y)); changed(true); } pre.value = ''; });
  bar.append(pre);
  body.append(bar);
  if (ts.length && (design.options?.splitTrack ?? OPTION_DEFAULTS.splitTrack) !== 'lengths') { const p = document.createElement('div'); p.className = 'tnote'; p.style.color = 'var(--warn, #c0392b)'; p.textContent = 'Not used now: tables cut the track only with Long track cut into: Track pieces (Settings › Print bed and cutting into parts).'; body.append(p); }
  if (!ts.length) { const p = document.createElement('div'); p.className = 'tnote'; p.textContent = 'No tables. With tables, the track is cut where one meets the next: plain track at an ordinary track end; bought track\'s printed ballast along the seam. Only with Long track cut into: Track pieces.'; body.append(p); }
  ts.forEach((t, k) => {
    const card = document.createElement('div'); card.className = 'tcard';
    const head = document.createElement('div'); head.className = 'thead';
    const name = document.createElement('input'); name.type = 'text'; name.value = t.name ?? ''; name.placeholder = `Table ${k + 1}`;
    name.addEventListener('change', () => { t.name = name.value; changed(); });
    const col = document.createElement('input'); col.type = 'color'; col.value = t.color ?? TABLE_COLORS[k % TABLE_COLORS.length]; col.title = 'Its colour on the plan';
    col.addEventListener('input', () => { t.color = col.value; changed(false, true, false); });
    head.append(col, name, btn('✕', () => { design.tables = ts.filter((x) => x !== t); if (!design.tables.length) delete design.tables; }, 'Remove this table'));
    const f = document.createElement('div'); f.className = 'tfields';
    const n = (label: string, v: number, set: (x: number) => void, step = 1) => f.append(field(label, num(v, set, step)));
    if (t.shape === 'rect') { n('x', t.x, (v) => { t.x = v; }); n('y', t.y, (v) => { t.y = v; }); n('width', t.w, (v) => { t.w = Math.max(1, v); }); n('length', t.h, (v) => { t.h = Math.max(1, v); }); }
    else if (t.shape === 'arc') {
      n('centre x', t.cx, (v) => { t.cx = v; }); n('centre y', t.cy, (v) => { t.cy = v; });
      n('inner radius', t.r0, (v) => { t.r0 = Math.max(0, v); }, 8); n('outer radius', t.r1, (v) => { t.r1 = Math.max(0, v); }, 8);
      n('from °', t.a0, (v) => { t.a0 = v; }, 11.25); n('to °', t.a1, (v) => { t.a1 = v; }, 11.25);
    } else {
      const ta = document.createElement('textarea'); ta.rows = 2; ta.value = t.pts.map((p) => `${+p[0].toFixed(3)}, ${+p[1].toFixed(3)}`).join('; ');
      ta.title = 'Its corners in studs, x, y each, in order round it, separated by ;';
      const bad = document.createElement('div'); bad.className = 'tnote'; bad.style.color = 'var(--warn, #c0392b)';
      ta.addEventListener('change', () => {
        const parts = ta.value.split(';').map((v) => v.trim()).filter(Boolean), pts = parts.map((v) => v.split(',').map((x) => Number(x.trim())));
        const wrong = parts.filter((_, k) => pts[k].length !== 2 || !pts[k].every(Number.isFinite));
        bad.textContent = wrong.length ? `Not x, y: ${wrong.slice(0, 3).join('; ')}. Kept the corners as they were.` : pts.length < 3 ? 'It needs 3 corners at least. Kept the corners as they were.' : '';
        if (!bad.textContent) { t.pts = pts as [number, number][]; changed(true); }
      });
      f.append(field('corners (x, y; …)', ta), bad);
    }
    const note = document.createElement('div'); note.className = 'tnote';
    note.textContent = t.shape === 'rect' ? 'Studs: its corner (x, y), width (x) and length (y).' : t.shape === 'arc' ? 'Studs: round its centre, from the inner radius to the outer. Angles: 0° points right (+x), 90° up (+y), counterclockwise (not a route\'s heading, where 0° is up). A centre on a curve\'s centre puts the seams square across the track.' : '';
    card.append(head, f, ...(note.textContent ? [note] : []));
    body.append(card);
  });
}

// ---------- the parts palette ----------
/** The parts palette: LEGO's and BrickTracks' track pieces, each laid on the selected route's end (a switch's branch a new
 * route), or as a new route with none selected; the route it continues stays selected, to lay the next one on. */
function renderPalette() {
  const body = $('palette-body'), o = { ...OPTION_DEFAULTS, ...design.options } as PieceOptions;
  body.replaceChildren();
  const sel = canvas.selection().filter((i) => i < design.routes.length), at = sel.length === 1 ? sel[0] : undefined;
  const lay = (id: string, turn = 1) => {
    const { next } = placePart(design, id, at, turn);
    canvas.setSelection([next]);
  };
  const note = (t: string, warn = false) => { const p = document.createElement('div'); p.className = 'tnote'; if (warn) p.style.color = 'var(--warn, #c0392b)'; p.textContent = t; body.append(p); };
  note(at !== undefined ? `Laid on the end of ${design.routes[at].name || `route ${at + 1}`}.` : sel.length > 1 ? 'Several routes selected: each part starts a new route. Select one to lay parts on its end.' : 'Nothing selected: the first part starts a new route; the next go on its end.');
  for (const maker of ['LEGO', 'BrickTracks'] as const) {
    const g = document.createElement('div'); g.className = 'pgroup';
    const h = document.createElement('b'), sw = document.createElement('i');
    sw.style.background = `#${(maker === 'LEGO' ? LEGO_COLOR : BRICKTRACKS_COLOR).toString(16).padStart(6, '0')}`;
    h.append(sw, maker); g.append(h);
    for (const p of PALETTE.filter((q) => q.maker === maker)) {
      if (!p.turns) { g.append(btn(p.name, () => lay(p.id), p.title)); continue; }
      const pair = document.createElement('span'); pair.className = 'ppair';
      pair.append(btn(`↶ ${p.name}`, () => lay(p.id, 1), `${p.title}. Turning left`), btn('↷', () => lay(p.id, -1), `${p.title}. Turning right`));
      g.append(pair);
    }
    body.append(g);
  }
  const bought = o.legoTrack ?? 'lego';
  if (bought === 'print') note('Bought track is set to Printed (Settings › Bought track): these are printed, not bought.', true);
  else if (bought === 'lego-only') note('Bought track is set to LEGO\'s only (Settings › Bought track): the BrickTracks parts are printed.', true);
  else if (o.splitTrack !== 'lengths') note('Bought only with Long track cut into: Track pieces (Settings › Print bed and cutting into parts): now they\'re printed.', true);
  else if (design.gaugeStuds !== 4) note('Bought only at a gauge of 4 studs: now they\'re printed.', true);
}

function render() {
  renderTables(); renderPalette();
  // (the rows go: no piece left picked out by one that's gone)
  canvas.highlightSeg = undefined;
  routesEl.replaceChildren();
  $('routes-title').textContent = design.routes.length ? `Routes (${design.routes.length})` : 'Routes';
  $('empty').hidden = design.routes.length > 0;
  if (!design.routes.length) {
    const e = document.createElement('div'); e.className = 'empty';
    e.textContent = 'No track yet. Draw on the grid, pick a template, or add a route by numbers.';
    routesEl.append(e);
  }
  design.routes.forEach((r, i) => {
    const box = document.createElement('details'); box.className = 'route';
    const sel = i === canvas?.selected;
    if (sel) box.classList.add('selected');
    box.open = sel || openCards.has(i);
    const sum = document.createElement('summary');
    const title = document.createElement('b'); title.textContent = r.name || `Route ${i + 1}`;
    const what = document.createElement('span'); what.textContent = r.segs.length ? describe(r.segs) : 'empty';
    sum.append(title, what);
    sum.addEventListener('click', (e) => {
      e.preventDefault();
      if (sel) { openCards.delete(i); canvas.selected = undefined; }
      else { openCards.add(i); canvas.selected = i; }
      render(); canvas.draw();
    });
    const body = document.createElement('div'); body.className = 'body';
    // (the card in folding sections, each remembered open or shut for every card: only the shape open to start with)
    const part = (title: string, note = '') => {
      const d2 = document.createElement('details'); d2.className = 'rsub'; d2.open = openParts.has(title);
      const s2 = document.createElement('summary'); s2.textContent = title;
      if (note) { const n2 = document.createElement('span'); n2.textContent = note; s2.append(n2); }
      d2.addEventListener('toggle', () => { if (d2.open) openParts.add(title); else openParts.delete(title); keepParts(); });
      const b2 = document.createElement('div'); d2.append(s2, b2); body.append(d2); return b2;
    };
    const shape = part('Shape', `${r.segs.length} piece${r.segs.length === 1 ? '' : 's'}`);
    const place = part('Place', `${r.x}, ${r.y} · ${r.heading}°${isMono(r) ? ' · monorail' : ''}${r.monoHeight !== undefined ? ` · ${r.monoHeight}${r.monoHeightEnd !== undefined && r.monoHeightEnd !== r.monoHeight ? `→${r.monoHeightEnd}` : ''} plates up` : ''}`);
    const name = document.createElement('input'); name.value = r.name; name.type = 'text';
    // (routes are known by their names, in the trackwork and the switches: no two the same)
    name.addEventListener('change', () => {
      const v = name.value.trim();
      if (!v || design.routes.some((q, j) => j !== i && q.name === v)) { name.value = r.name; setStatus(infoEl.textContent ?? '', v ? `There's already a route called ${v}: names must differ` : 'A route needs a name', false, true); return; }
      // (just a name: the trackwork's references to it renamed too, no rebuild)
      const was = r.name;
      r.name = v;
      for (const e of Object.values(design.trackwork?.points ?? {})) if (e.drop) e.drop = e.drop.map((id) => (id === was ? v : id));
      changed(true, true, false);
    });
    place.append(field('Name', name),
      field('Start x, studs', num(r.x, (n) => { r.x = n; }, 1)),
      field('Start y, studs', num(r.y, (n) => { r.y = n; }, 1)),
      field('Heading ° (0 = up, + = left)', num(r.heading, (n) => { r.heading = n; }, 22.5)));
    {
      // (what runs on it: train track or the monorail beam)
      const sys = document.createElement('select');
      sys.append(new Option('Train track', 'train'), new Option('Monorail', 'monorail'));
      sys.value = isMono(r) ? 'monorail' : 'train';
      sys.title = 'Train track, or LEGO monorail: the 4-stud beam with a rack down the middle.';
      sys.addEventListener('change', () => { if (sys.value === 'monorail') r.system = 'monorail'; else delete r.system; changed(true); renderOptions(); });
      place.append(field('Track', sys));
      // (monorail: the beam's height off the baseplate, in plates; empty: the supports' height in Settings, or on the baseplate)
      const hi = document.createElement('input'); hi.type = 'number'; hi.step = '1'; hi.min = '0'; hi.max = '60';
      hi.value = r.monoHeight === undefined ? '' : String(r.monoHeight); hi.placeholder = 'auto';
      hi.title = isMono(r) ? 'The beam\'s height off the baseplate in plates (3.2 mm). Empty: the supports\' height (Settings › Monorail), or on the baseplate. Raise it to pass over train track or another monorail (5 plates clear of a beam, more over track).'
        : 'Train track: its height off the baseplate at its start, in plates (3.2 mm), on risers (LEGO 2 x 8 bricks and plates, in the parts list). The pieces are printed level and laid on them. Empty: on the baseplate.';
      hi.addEventListener('change', () => { const n = Math.round(Number(hi.value)); if (hi.value.trim() === '' || !Number.isFinite(n)) delete r.monoHeight; else r.monoHeight = Math.min(60, Math.max(0, n)); changed(true); });
      place.append(field(isMono(r) && r.monoHeightEnd !== undefined ? 'Start height, plates' : 'Height, plates', hi));
      // (a ramp: its height at its end; empty: level)
      const he = document.createElement('input'); he.type = 'number'; he.step = '1'; he.min = '0'; he.max = '60';
      he.value = r.monoHeightEnd === undefined ? '' : String(r.monoHeightEnd); he.placeholder = 'level';
      he.disabled = r.monoHeight === undefined;
      he.title = r.monoHeight === undefined ? 'Locked: set its Height first' : !isMono(r) ? 'Train track: its height at its end, in plates: an even grade from its start height to this. The standard is 2.5% (a plate a 16-stud straight; a whole turn of R40 rises 15.7 plates, R104 40.8). Empty: level.' : 'Its height at its end, in plates: it ramps from its start height to this, easing in and out (level at both ends). Empty: level. It may be as steep as LEGO\'s monorail ramps (21° at the steepest): those rise 5 bricks over each 32-stud piece.';
      he.addEventListener('change', () => { const n = Math.round(Number(he.value)); if (he.value.trim() === '' || !Number.isFinite(n)) delete r.monoHeightEnd; else r.monoHeightEnd = Math.min(60, Math.max(0, n)); changed(true); });
      place.append(field(isMono(r) ? 'End height, plates (a ramp)' : 'End height, plates (a grade)', he));
      // (train track on a grade: how steep, against the standard 2.5%)
      if (!isMono(r) && r.monoHeight !== undefined && r.monoHeightEnd !== undefined && r.monoHeightEnd !== r.monoHeight) {
        const g = gradeOf(r), n5 = document.createElement('small'); n5.className = 'desc';
        n5.textContent = `Grade ${g.toFixed(2)}%${g > 4 ? ': too steep for most LEGO trains' : g > 2.5 + 1e-6 ? ': steeper than the standard 2.5%' : ''}.`;
        if (g > 2.5 + 1e-6) n5.style.color = 'var(--warn)';
        place.append(n5);
      }
      if (r.monoHeight === undefined) { const n4 = document.createElement('small'); n4.className = 'desc'; n4.textContent = 'End height: locked until Height is set.'; n4.style.color = 'var(--warn)'; place.append(n4); }
    }
    r.segs.forEach((_, k) => {
      const row = segRow(r, k);
      // (hovered: that straight or curve picked out on the plan)
      row.addEventListener('mouseenter', () => { canvas.highlightSeg = [i, k]; canvas.draw(); });
      row.addEventListener('mouseleave', () => { canvas.highlightSeg = undefined; canvas.draw(); });
      shape.append(row);
    });
    const ends = part('Ends', [r.startEnd, r.endEnd].includes('buffer') ? 'buffer stop' : '');
    // (each end: an ordinary end connector, or a buffer stop)
    for (const [prop, label] of [['startEnd', 'Starts in'], ['endEnd', 'Ends in']] as const) {
      const es = document.createElement('select');
      for (const [v, t] of [['connector', 'An end connector'], ['buffer', 'A buffer stop']]) es.append(new Option(t, v));
      es.value = r[prop] ?? 'connector';
      es.title = 'An ordinary end connector, to join more track, or a buffer stop: the rails run into two posts joined by a buffer beam, its last two studs (the Buffer stops settings)';
      es.addEventListener('change', () => { if (es.value === 'buffer') r[prop] = 'buffer'; else delete r[prop]; changed(true); });
      if (isMono(r)) { es.disabled = true; es.title = 'Locked: buffer stops are for train track'; }
      const f = field(label, es); f.classList.add('stack'); ends.append(f);
    }
    // (a branch, i.e. a switch's: its lever's side, where it branches; shown once the plan knows it's one)
    const id = r.name || String(i), items = canvas?.overlay?.items ?? [];
    const keys = new Set(items.filter((it) => it.kind === 'points' && !it.cand && (it.routes ?? []).slice(1).includes(id)).map((it) => it.key));
    if (keys.size || (r.throwSide && r.throwSide !== 'auto')) {
      const sel = document.createElement('select');
      const opt = design.options?.throwSide ?? 'auto';
      for (const [v, t] of [['auto', opt === 'auto' ? 'Auto: away from this branch' : `As the Settings say (${opt})`], ['left', 'Left'], ['right', 'Right']]) sel.append(new Option(t, v));
      sel.value = r.throwSide ?? 'auto';
      sel.title = 'Which side the lever goes at the points where this track branches off another, as you face along them from their toe';
      sel.addEventListener('change', () => { r.throwSide = sel.value as DRoute['throwSide']; changed(true); });
      const f = field('Lever side where it branches', sel); f.classList.add('stack'); ends.append(f);
      const hand = [...keys].filter((k) => design.trackwork?.throw?.[k]?.side);
      if (hand.length) {
        const n = document.createElement('small'); n.className = 'desc';
        n.textContent = `The lever${keys.size > 1 ? 's' : ''} here ${hand.length > 1 ? 'were' : 'was'} dragged across by hand, which wins: set its Side back to Auto in the Trackwork panel for this to apply.`;
        ends.append(n);
      }
    }
    {
      const rails = part('Guard rails and dual gauge', isMono(r) ? 'train track only' : [r.guardRails && 'guard rails', r.dualGauge && 'dual gauge'].filter(Boolean).join(' · '));
      if (isMono(r)) { const n2 = document.createElement('small'); n2.className = 'desc'; n2.textContent = 'Locked: guard rails and a third rail are for train track; this route is monorail (Place › Track).'; rails.append(n2); }
      else extraRailFields(r, rails);
    }
    const add = document.createElement('div'); add.className = 'row';
    add.append(
      btn('+ Straight', () => r.segs.push({ kind: 'straight', studs: 16 })),
      btn('+ Curve L', () => r.segs.push({ kind: 'curve', radius: 40, angle: 22.5 })),
      btn('+ Curve R', () => r.segs.push({ kind: 'curve', radius: 40, angle: -22.5 })),
    );
    const more = document.createElement('div'); more.className = 'row';
    more.append(
      btn('New route from its end', () => { const e = endOf(design, i); design.routes.push({ name: freeName(design, 'R'), ...e, segs: [{ kind: 'straight', studs: 16 }], ...(isMono(r) && { system: 'monorail' as const }) }); }),
      btn('Delete', () => { design.routes.splice(i, 1); if (canvas.selected === i) canvas.selected = undefined; openCards.clear(); }),
    );
    more.lastElementChild!.className = 'danger';
    shape.append(add); body.append(more);
    box.append(sum, body);
    routesEl.append(box);
  });
}

// ---------- building ----------
// (one build at a time; a build still going when a newer one is asked for is
// given a second to finish, then the worker is replaced, so a slow build of
// a big layout never holds up the next change)
// (which build's messages count, the worker replaced when it's stuck or its kernel's broken: buildrun.ts)
const runner = new BuildRunner({
  spawn: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerPort,
  message: (d) => onBuilt(d),
  // (said, and the bar back at the start: the build's from nothing again, not stuck)
  retrying: () => { $('build-what').textContent = 'The geometry kernel ran out of memory: building again from the start…'; $('build-bar').style.width = '0%'; },
});
let pieces: Piece[] = [], timer: number | undefined;
/** The 3D view and the downloads: building (a newer design than the pieces), out of date (stopped, or the last build failed), or up to date. */
let building = false, stale = false;
/** The first build of the design as last let go of (a lever dropped is held where it was put on the plan till then). */
let settleFrom = 0;
const hasTrack = () => design.routes.some((r) => r.segs.length > 0);
/** Build the 3D view after each change (Auto in the 3D view's bar; remembered), and only while it's showing; else just the plan's trackwork. */
let autoBuild = true, show3d = true;
try { autoBuild = localStorage.getItem('btd-auto') !== '0'; show3d = localStorage.getItem('btd-3d') !== '0'; } catch { /* fine */ }
const want3d = () => autoBuild && show3d;
/** force: the 3D view too, whatever Auto says (Build pressed, the view shown again). */
function requestBuild(force = false) {
  clearTimeout(timer);
  const planOnly = !force && !want3d();
  // (nothing to build: no need to ask the worker, which would only say so)
  if (!hasTrack()) {
    runner.skip();
    buildDone(); stale = false; pieces = []; showPieces(pieces); canvas.overlay = undefined; updateLegend(); canvas.draw(); renderTrackwork([]); refreshOptions();
    setStatus('Nothing to build yet: draw some track, or pick a template.');
    return;
  }
  runner.request(structuredClone(design), planOnly);
  // (just the plan's trackwork: quick, and nothing built, so no build's progress or Stop; said quietly in the status line)
  if (planOnly) planStarted(); else buildStarted();
}
/** Stop the build that's going (a big layout taking its time): the 3D view stays as it was, out of date, till Rebuild. */
function stopBuild() {
  clearTimeout(timer);
  runner.stop();
  buildDone(); stale = true;
  setStatus('Build stopped: the 3D view and the downloads are of the design before your last changes.', '', true);
}

/** The status line under the 3D view: what was built (info), what's wrong or worth knowing (problem), and Rebuild when it's out of date. */
function setStatus(info: string, problem = '', rebuild = false, warn = false) {
  infoEl.textContent = info; errEl.textContent = problem; errEl.classList.toggle('warn', warn);
  $('rebuild').hidden = !rebuild;
  $('view3d').classList.toggle('stale', stale);
  updateExports();
}
/** The downloads: only of an up-to-date build. */
function updateExports() {
  const why = building ? 'Wait for the build to finish' : !pieces.length ? 'Nothing built yet' : stale ? 'The 3D view is out of date: rebuild first' : '';
  const tips: Record<string, string> = {
    'export-stl': 'Download the parts for printing as STL (a zip when there are several)',
    'export-lego': 'Download the parts to buy (a CSV, and a BrickLink wanted list of the LEGO ones): plain track as LEGO straights and R40 curves or BrickTracks curves, switches as LEGO\'s or BrickTracks\', the straights\' ballast as LEGO plates',
    'parts-open': 'The parts list: what to buy (plain track as LEGO straights and R40 curves or BrickTracks curves, the straights\' ballast as LEGO plates) and what to print',
    'export-layout': 'Download a parts library for the layout designer (a zip): one part per printed track part, each with its picture and connection points, and a set of them all as designed. Help says how to load it',
  };
  for (const id of ['export-stl', 'export-layout', 'export-lego', 'parts-open']) {
    const b = $<HTMLButtonElement>(id), none = id === 'export-lego' ? !legoParts(pieces).length : id === 'export-stl' ? !pieces.some((p) => !p.lego) : false;
    b.disabled = !!why || none;
    b.title = why ? `${why}` : none ? (id === 'export-lego' ? 'No LEGO parts: every piece is printed (Settings: Bought track)' : 'Nothing to print: every piece is LEGO\'s own') : tips[id];
  }
}

/** The design changed: save it and rebuild. record: an undo step (not while a drag or a draw is still going on). build: false for what doesn't change the parts (a route's name). */
function changed(rerender = false, record = true, build = true) {
  const json = JSON.stringify(design);
  if (record) history.record(json);
  if (record) settleFrom = runner.id + 1; // (the next build is of the design as let go of)
  save();
  updateLegend();
  if (rerender) render();
  canvas?.draw();
  updateHistoryButtons();
  if (!build) return;
  clearTimeout(timer);
  timer = window.setTimeout(requestBuild, 150);
  // (Auto off: only the plan's updated, the 3D view out of date till Build)
  if (want3d()) building = true; else if (pieces.length) stale = true;
  updateExports();
}

// The build status, in the status line while it builds: what the worker is doing, and for how long.
let buildT0 = 0, buildTick: number | undefined;
function buildStarted() {
  buildT0 = performance.now(); building = true; updateExports();
  $('buildstatus').hidden = false; $('build-what').textContent = 'Building…'; $('build-time').textContent = ''; $('build-bar').style.width = '0%';
  clearInterval(buildTick);
  buildTick = window.setInterval(() => { $('build-time').textContent = `${((performance.now() - buildT0) / 1000).toFixed(1)} s`; }, 100);
}
/** Just the plan's trackwork being worked out (Auto off, or the 3D view hidden): no build chip, a quiet word in the status line. */
function planStarted() {
  buildDone();
  $('rebuild').textContent = 'Build';
  setStatus('Updating the plan…', '', show3d);
}
function buildDone() { clearInterval(buildTick); $('buildstatus').hidden = true; building = false; updateExports(); }
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- (the worker's messages, as worker.ts posts them)
function onBuilt(d: any) {
  // (the trackwork, ahead of the pieces: the plan and the Trackwork panel can be worked on while they build)
  if (d.early) { canvas.overlay = d.early; if (d.id >= settleFrom) canvas.settled(); updateLegend(); canvas.draw(); renderTrackwork(d.early.items ?? []); refreshOptions(); refreshRoutes(); return; }
  // (just the plan's trackwork, the 3D view not built: out of date till Build)
  if (d.planDone) {
    buildDone(); stale = true;
    $('rebuild').textContent = 'Build';
    setStatus(show3d ? 'The 3D view is built when you press Build (Auto is off).' : 'The 3D view is hidden: it\'s built when you show it.', '', show3d);
    return;
  }
  if (d.progress) { $('build-what').textContent = `${d.progress}…`; $('build-bar').style.width = `${Math.round((d.frac ?? 0) * 100)}%`; return; }
  buildDone();
  // (the plan keeps the trackwork it was sent; the 3D view the last pieces that built, greyed)
  if (d.error) { stale = pieces.length > 0; setStatus('', `Can't build this: ${d.error}${stale ? ' (the 3D view shows the last design that built)' : ''}`); return; }
  stale = false;
  canvas.overlay = d.overlay; if (d.id >= settleFrom) canvas.settled();
  updateLegend();
  canvas.draw();
  pieces = d.pieces;
  showPieces(pieces);
  showIssues(d.overlay.issues ?? []);
  renderTrackwork(d.overlay.items ?? []);
  refreshOptions(); refreshRoutes();
  const i = d.info;
  const trackwork = [i.switches && plural(i.switches, 'switch', 'switches'), i.crossings && plural(i.crossings, 'rail crossing'), i.checkRails && plural(i.checkRails, 'check rail')].filter(Boolean).join(', ');
  // (what's bought: the track pieces; the bricks a raised track stands on are in the parts list, not counted here)
  const nLego = pieces.filter((p) => p.lego && p.name !== 'risers-bought').length, nPrint = pieces.filter((p) => !p.lego).length;
  setStatus(`${trackwork ? `${trackwork} · ` : ''}${plural(nPrint, 'part')} to print${nLego ? ` · ${plural(nLego, 'bought track piece')}` : ''} · ${i.size.map((v: number) => v.toFixed(0)).join(' × ')} mm · ${(i.volume / 1000).toFixed(1)} cm³ · built in ${(i.ms / 1000).toFixed(1)} s`,
    (i.warnings as string[]).join('; '), false, true);
}
$('build-stop').addEventListener('click', stopBuild);
$('rebuild').addEventListener('click', () => { stale = false; setStatus(''); requestBuild(true); $('rebuild').textContent = 'Rebuild'; });
// Auto: build the 3D view after every change, or only when Build is pressed
{
  const b = $('auto-build');
  const show = () => { b.classList.toggle('on', autoBuild); b.title = autoBuild ? 'The 3D view builds after every change. Click to build it only when you press Build' : 'The 3D view builds only when you press Build. Click to build it after every change'; };
  show();
  b.addEventListener('click', () => {
    autoBuild = !autoBuild; show();
    try { localStorage.setItem('btd-auto', autoBuild ? '1' : '0'); } catch { /* fine */ }
    if (autoBuild && stale) { stale = false; requestBuild(true); }
  });
}

// ---------- 3D view ----------
const view = $('view3d');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// (no more than twice the screen's pixels: a 3x phone screen drew 9 times as many as it needed)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
view.append(renderer.domElement);
const scene = new THREE.Scene();
const cssColor = (v: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback;
scene.background = new THREE.Color(cssColor('--view-bg', '#f4f4f2'));
const themeChanged = () => { scene.background = new THREE.Color(cssColor('--view-bg', '#f4f4f2')); redraw3d(); canvas?.draw(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
// Light or dark: the system's (default), or set from the toolbar (remembered)
{
  const btnT = $('theme'), modes = ['system', 'light', 'dark'] as const;
  const icon = { system: 'i-theme', light: 'i-sun', dark: 'i-moon' } as const, tip = { system: 'Light or dark: follows the system (click for light)', light: 'Light (click for dark)', dark: 'Dark (click to follow the system)' } as const;
  const apply = (m: typeof modes[number]) => {
    if (m === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = m;
    btnT.querySelector('use')!.setAttribute('href', `#${icon[m]}`); btnT.title = tip[m];
    try { localStorage.setItem('btd-theme', m); } catch { /* fine */ }
    themeChanged();
  };
  let mode: typeof modes[number] = 'system';
  try { const v = localStorage.getItem('btd-theme'); if (v === 'light' || v === 'dark') mode = v; } catch { /* fine */ }
  btnT.addEventListener('click', () => { mode = modes[(modes.indexOf(mode) + 1) % 3]; apply(mode); });
  queueMicrotask(() => apply(mode));
}
const camera = new THREE.PerspectiveCamera(35, 1, 1, 10000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
// (drawn only when something's changed: drawing every frame regardless kept the page busy, and the plan's zoom lagged)
let dirty3d = true;
const redraw3d = () => { dirty3d = true; };
controls.addEventListener('change', redraw3d);
controls.zoomToCursor = true; // (zooming toward the mouse, as the plan does)
scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(300, -400, 700); scene.add(sun);
const under = new THREE.DirectionalLight(0xffffff, 0.9); under.position.set(-300, 400, -700); scene.add(under);
let meshes: THREE.Mesh[] = [], framed = false;
let lastNames = '';
const sphereOf = () => new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere());
const group = new THREE.Group();
scene.add(group);
// (one material a colour, shared: a big layout's hundreds of parts drew with as many materials, each its own draw state;
// Lambert's shading, lighter to draw than the physically based one, as these flat colours need)
const materials = new Map<number, THREE.MeshLambertMaterial>();
const materialOf = (color: number) => { let m = materials.get(color); if (!m) { m = new THREE.MeshLambertMaterial({ color }); materials.set(color, m); } return m; };

/** Show the pieces as assembled: the track grey, moving parts in their colours. */
// What the 3D view shows (Track, Points, Throws, Levers buttons), remembered.
const shown = new Set(['track', 'bought', 'points', 'throw', 'lever', 'supports']);
// (saved before there was a Bought button: bought parts shown)
try { const v = localStorage.getItem('btd-shown'); if (v) { const ks = JSON.parse(v) as string[]; shown.clear(); for (const k of ks) shown.add(k); if (!localStorage.getItem('btd-shown-bought')) shown.add('bought'); } } catch { /* fine */ }
const kindOf = (name: string) => (/lid/.test(name) ? 'cassette' : /bracket/.test(name) ? 'bracket' : /lever/.test(name) ? 'lever' : /throw/.test(name) ? 'throw' : /points/.test(name) ? 'points' : 'track');
let meshKinds: string[] = [];
// Exploded view: each part pulled out from the middle (the moving parts lifted too), to see where they separate.
let meshCentres: THREE.Vector3[] = [];
const explodeEl = $<HTMLInputElement>('explode');
function applyExplode() {
  redraw3d();
  const e = Number(explodeEl.value), all = new THREE.Vector3();
  meshCentres.forEach((c) => all.add(c)); if (meshCentres.length) all.divideScalar(meshCentres.length);
  // (track parts spread out from the middle; each moving part goes with the track part it sits in, and lifts straight up out of it)
  const boxes = meshes.map((m) => m.geometry.boundingBox!);
  const spread = (k: number) => new THREE.Vector3((meshCentres[k].x - all.x) * e * 0.5, (meshCentres[k].y - all.y) * e * 0.5, 0);
  const trackIdx = meshKinds.map((kd, k) => (kd === 'track' ? k : -1)).filter((k) => k >= 0);
  meshes.forEach((m, k) => {
    if (meshKinds[k] === 'track') { m.position.copy(spread(k)); return; }
    const c = meshCentres[k];
    let host = trackIdx.find((t) => c.x >= boxes[t].min.x && c.x <= boxes[t].max.x && c.y >= boxes[t].min.y && c.y <= boxes[t].max.y);
    if (host === undefined) host = trackIdx.reduce((best, t) => (best < 0 || meshCentres[t].distanceTo(c) < meshCentres[best].distanceTo(c) ? t : best), -1);
    const off = host !== undefined && host >= 0 ? spread(host) : spread(k);
    // (as they're put together, each lifted clear of the last: the plate-style slider down into its opening, then the
    // blades on it, the bracket on its studs, the lever into it; on tines, the slider and points from underneath,
    // or with the layered points from above under the lid)
    const fdb = design.options?.mechStyle !== 'tines';
    const fromTop = design.options?.pointsModule === 'layers' && (design.options?.ballast ?? 'none') !== 'none';
    // (bought track lifted off the printed ballast it sits in)
    const lift: Record<string, number> = fdb ? { throw: 35, points: 70, hold: 90, cassette: 90, bracket: 50, lever: 110, bought: 40 }
      : { throw: fromTop ? 15 : -30, points: fromTop ? 25 : -18, cassette: 45, bracket: 30, lever: 60, bought: 40 };
    m.position.set(off.x, off.y, e * (lift[meshKinds[k]] ?? 40));
  });
}
explodeEl.addEventListener('input', applyExplode);
// The 3D view's colours: what each colour of the parts shown is (only those there are).
const COLOURS: [number, string][] = [
  [0x6f7780, 'printed track'], [0x9aa3ad, 'printed monorail track'], [0x5a6470, 'pillars and supports under raised track'], [0x4682b4, 'points (blades), monorail frame'],
  [0xc0392b, 'points spring'], [0xe8892b, 'throw'], [0xd4af37, 'lever'], [0x8a8f99, 'throw bracket'],
  [LEGO_COLOR, 'LEGO\'s (bought, not printed)'], [BRICKTRACKS_COLOR, 'BrickTracks\' (bought, not printed)'],
];
function showColours(list: Piece[]) {
  const there = new Set(list.map((p) => p.color)), rows = $('legend3d-rows');
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const items = COLOURS.filter(([c]) => there.has(c)).map(([c, t]) => [hex(c), t]);
  for (const c of there) if (!COLOURS.some(([k]) => k === c)) items.push([hex(c), 'other parts']);
  if (list.some((p) => p.supports?.length)) items.push(['#e0a030', 'breakaway print supports']);
  rows.replaceChildren(...items.map(([c, t]) => { const r = document.createElement('span'), i = document.createElement('i'); i.style.background = c; r.append(i, t); return r; }));
  $('legend3d').hidden = !items.length;
}
try { $('legend3d').classList.toggle('folded', localStorage.getItem('btd-legend3d') === '0'); } catch { /* fine */ }
$('legend3d-fold').addEventListener('click', () => {
  const on = !$('legend3d').classList.toggle('folded');
  $('legend3d-fold').textContent = on ? '–' : '+';
  try { localStorage.setItem('btd-legend3d', on ? '1' : '0'); } catch { /* fine */ }
});
$('legend3d-fold').textContent = $('legend3d').classList.contains('folded') ? '+' : '–';
const showKind = (k: string) => (k === 'cassette' ? 'track' : k === 'bracket' ? 'lever' : k);
function applyShown() {
  redraw3d();
  meshes.forEach((m, k) => { m.visible = shown.has(showKind(meshKinds[k])); const sp = m.getObjectByName('supports'); if (sp) sp.visible = shown.has('supports'); });
  // (only the buttons for parts there are; Explode only with parts to pull apart)
  const kinds = new Set(meshKinds.map(showKind));
  document.querySelectorAll<HTMLButtonElement>('#views .show').forEach((b) => { b.classList.toggle('on', shown.has(b.dataset.show!)); if (b.dataset.show !== 'supports') b.hidden = !kinds.has(b.dataset.show!) || kinds.size < 2; });
  $('views-sep2').hidden = kinds.size < 2;
  $('show-supports').hidden = !meshes.some((m) => m.getObjectByName('supports'));
  explodeEl.disabled = meshes.length < 2; explodeEl.parentElement!.title = meshes.length < 2 ? 'One part: nothing to pull apart' : 'Pull the parts apart to see where they separate';
  for (const id of ['view-top', 'view-under', 'view-frame']) $<HTMLButtonElement>(id).disabled = !meshes.length;
}
document.querySelectorAll<HTMLButtonElement>('#views .show').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.show!; if (shown.has(k)) shown.delete(k); else shown.add(k);
  try { localStorage.setItem('btd-shown', JSON.stringify([...shown])); localStorage.setItem('btd-shown-bought', '1'); } catch { /* fine */ }
  applyShown();
}));
applyShown();
// What's wrong (the build's issues, where they are): red rings round them in the 3D view too, as on the plan, a
// post up from each so it's seen over the track.
const issueGroup = new THREE.Group();
scene.add(issueGroup);
function showIssues(list: { at: [number, number]; r: number }[]) {
  for (const m of [...issueGroup.children]) { issueGroup.remove(m); const mm = m as THREE.Mesh; mm.geometry.dispose(); (mm.material as THREE.Material).dispose(); }
  const top = meshes.length ? new THREE.Box3().setFromObject(group).max.z : 10;
  for (const is of list) {
    const r = Math.max(8, is.r), mat = () => new THREE.MeshBasicMaterial({ color: 0xe02828, transparent: true, opacity: 0.9, depthTest: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, Math.max(0.8, r / 60), 8, 64), mat());
    ring.position.set(is.at[0], is.at[1], top + 1);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 30, 8), mat());
    post.rotation.x = Math.PI / 2; post.position.set(is.at[0], is.at[1], top + 16);
    const head = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), mat());
    head.position.set(is.at[0], is.at[1], top + 32);
    for (const m of [ring, post, head]) { m.renderOrder = 10; issueGroup.add(m); }
  }
  redraw3d();
}
function showPieces(list: Piece[]) {
  for (const m of meshes) { group.remove(m); m.traverse((o) => { const mm = o as THREE.Mesh; if (mm.geometry) mm.geometry.dispose(); }); }
  meshes = list.map((p) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, materialOf(p.color));
    // (its breakaway print supports, in their own colour, shown or hidden with the Supports button; they move with it)
    if (p.supports?.length) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(p.supports, 3));
      sg.computeVertexNormals();
      const sm = new THREE.Mesh(sg, materialOf(0xe0a030));
      sm.name = 'supports';
      m.add(sm);
    }
    group.add(m);
    return m;
  });
  meshKinds = list.map((p) => (p.lego ? 'bought' : kindOf(p.name)));
  showColours(list);
  meshCentres = meshes.map((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox!.getCenter(new THREE.Vector3()); });
  applyShown(); applyExplode();
  if (!list.length) { framed = false; lastNames = ''; lastSphere = undefined; return; } // (nothing to frame: frame the next pieces afresh)
  const bs = sphereOf();
  // (a different set of pieces, e.g. a switch appearing: frame again)
  const names = list.map((p) => p.name).join();
  if (names !== lastNames) { lastNames = names; lastSphere = undefined; }
  // Frame the piece the first time, and again when it has grown, shrunk or
  // moved a lot, keeping the direction you are looking from.
  const moved = !lastSphere || bs.center.distanceTo(lastSphere.center) > lastSphere.radius * 0.35
    || Math.abs(bs.radius - lastSphere.radius) > lastSphere.radius * 0.35;
  if (!framed || moved) frame(bs, framed);
  framed = true;
}
let lastSphere: THREE.Sphere | undefined;
function frame(bs: THREE.Sphere, keepDirection: boolean) {
  const dir = keepDirection ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(0.6, -1.2, 1.1).normalize();
  controls.target.copy(bs.center);
  camera.position.copy(bs.center).add(dir.multiplyScalar(bs.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(1, 1 / camera.aspect)));
  controls.update();
  lastSphere = bs.clone();
}
function resize() {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); redraw3d();
}
new ResizeObserver(resize).observe(view);
// Top or underside view, from the side you're looking from.
const look = (under: boolean) => {
  if (!meshes.length) return; const bs = sphereOf();
  const d = camera.position.clone().sub(controls.target);
  d.z = Math.abs(d.z) * (under ? -1 : 1);
  if (Math.hypot(d.x, d.y) < 1e-6) d.y = -1;
  camera.position.copy(controls.target).add(d);
  frame(bs, true);
};
$('view-top').addEventListener('click', () => look(false));
$('view-under').addEventListener('click', () => look(true));
$('view-frame').addEventListener('click', () => { if (meshes.length) frame(sphereOf(), true); });
renderer.domElement.addEventListener('dblclick', () => { if (meshes.length) frame(sphereOf(), true); });
renderer.setAnimationLoop(() => { if (!dirty3d) return; dirty3d = false; renderer.render(scene, camera); });

// ---------- toolbar ----------
const tpl = $<HTMLSelectElement>('template');
// (in groups: crossings, switches, layouts, features, monorail)
for (const [g, names] of TEMPLATE_GROUPS) { const og = document.createElement('optgroup'); og.label = g; for (const name of names) if (TEMPLATES[name]) og.append(new Option(name, name)); tpl.append(og); }
tpl.addEventListener('change', () => {
  if (!tpl.value) return;
  design = structuredClone(TEMPLATES[tpl.value]); tpl.value = ''; replaced(); framed = false; changed(true); canvas.fit();
});
$('add-route').addEventListener('click', () => {
  design.routes.push({ name: nextName(), x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] });
  canvas.setSelection([design.routes.length - 1]); // (its card open, to type its numbers)
  changed(true);
});
/** The legend: only what's on the plan now. */
function updateLegend() {
  const o = canvas?.overlay, its = o?.items ?? [];
  const has = (k: string) => its.some((it) => it.kind === k);
  const show = (id: string, on: boolean) => { const el = document.getElementById(id); if (el) el.hidden = !on; };
  show('legend-ballast', (design.options?.ballast ?? 'none') !== 'none');
  show('legend-baseplate', (design.options?.baseplate ?? 0) > 0);
  show('legend-tables', !!design.tables?.length);
  show('legend-grooves', !!o?.grooves.length); show('legend-checks', !!o?.checkRails.length); show('legend-crossings', !!o?.crossings.length);
  show('legend-points', its.some((it) => it.kind === 'points' && !it.off && !it.cand));
  show('legend-points-off', its.some((it) => it.kind === 'points' && it.off));
  show('legend-points-cand', its.some((it) => it.kind === 'points' && it.cand));
  show('legend-edited', Object.values(design.trackwork ?? {}).some((g) => Object.keys(g ?? {}).length > 0));
  show('legend-mono-points', !!(o as { monoPoints?: unknown[] } | undefined)?.monoPoints?.length);
  show('legend-levers', has('throw'));
  show('legend-grip', !!o?.grips?.length);
  show('legend-hint', [...document.querySelectorAll<HTMLElement>('#legend-rows [data-layer]')].some((el) => !el.hidden));
}
/** A different design (a template, a file, undo or redo): the toolbar and the forms show it, nothing selected. */
function replaced() {
  canvas.setSelection([]); openCards.clear(); twSig = ''; renderOptions();
}

const download = (blob: Blob, name: string) => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
// One piece: its STL; several (a switch and its moving parts): a zip of them. (Not the pieces that are LEGO's own: the LEGO parts list has those.)
$('export-stl').addEventListener('click', () => {
  if (!pieces.length || building || stale) return;
  const d = stlDownload(pieces, fileBase());
  if (d) download(new Blob([d.data as BlobPart], { type: d.type }), d.name);
});
// The LEGO parts the design uses instead of printing (plain straights as LEGO track, their ballast as plates): a list,
// and a BrickLink wanted list to upload, in a zip.
$('export-lego').addEventListener('click', () => {
  if (!pieces.length || building || stale) return;
  const d = partsDownload(pieces, fileBase());
  if (d) download(new Blob([d.data as BlobPart], { type: d.type }), d.name);
});
// The parts list, on screen: what to buy (as the download has it) and what to print, by kind.
const partsDlg = $<HTMLDialogElement>('parts-dlg');
const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
$('parts-open').addEventListener('click', () => {
  if (!pieces.length || building || stale) return;
  const buy = legoParts(pieces), printed = pieces.filter((p) => !p.lego);
  // (with tables: what goes on each, by where each part's middle is; bought and printed parts)
  const byTable = () => {
    const ts = design.tables ?? [];
    if (!ts.length) return [];
    const groups = new Map<number, Piece[]>();
    for (const p of pieces) {
      let x = 0, y = 0; const n = p.positions.length / 3;
      for (let i = 0; i < p.positions.length; i += 3) { x += p.positions[i]; y += p.positions[i + 1]; }
      const k = tableAt(ts, [x / n, y / n]);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
    }
    const name = (k: number) => (k < 0 ? 'On no table' : ts[k].name || `Table ${k + 1}`);
    return ['<h3>By table</h3>', ...[...groups].sort((a, b) => (a[0] < 0 ? 1 : b[0] < 0 ? -1 : a[0] - b[0])).map(([k, ps]) => {
      const bought = legoParts(ps), np = ps.filter((p) => !p.lego).length;
      return `<p><b>${esc(name(k))}</b>: ${bought.map((p) => `${p.qty} × ${esc(p.part)}`).join(', ') || 'nothing bought'}; ${np} printed part${np === 1 ? '' : 's'}.</p>`;
    })];
  };
  // (printed parts by kind: their names without the numbers, as track, track-ballast, points-a)
  const kinds = printedKinds(printed);
  const from = (p: LegoPart) => (p.shop === 'bricktracks' ? 'BrickTracks' : 'LEGO (BrickLink)');
  $('parts-body').innerHTML = [
    '<h3>To buy</h3>',
    buy.length ? `<table><tr><th class="n">Qty</th><th>Part</th><th>Name</th><th>From</th></tr>${[...buy].sort((a, b) => from(a).localeCompare(from(b)) || b.qty - a.qty).map((p) => `<tr><td class="n">${p.qty}</td><td>${esc(p.part)}</td><td>${esc(p.name)}</td><td>${from(p)}</td></tr>`).join('')}</table>`
      : '<p>Nothing: every piece is printed (Settings: Bought track).</p>',
    '<h3>To print</h3>',
    printed.length ? `<table><tr><th class="n">Qty</th><th>Part</th></tr>${kinds.map(([k, n]) => `<tr><td class="n">${n}</td><td>${esc(k)}</td></tr>`).join('')}</table><p>${printed.length} part${printed.length === 1 ? '' : 's'} in all: the STL download has them.</p>`
      : '<p>Nothing: every piece is bought.</p>',
    ...byTable(),
  ].join('');
  $<HTMLButtonElement>('export-lego').disabled = !buy.length;
  partsDlg.showModal();
});
$('parts-close').addEventListener('click', () => partsDlg.close());
partsDlg.addEventListener('click', (e) => { if (e.target === partsDlg) partsDlg.close(); });
// The parts as a parts library for the layout designer (layoutparts.ts): a zip of the library's folder and a README.
$('export-layout').addEventListener('click', () => {
  if (!pieces.length || building || stale) return;
  try {
    const x = layoutParts(design, pieces.filter((p) => p.positions.length), fileBase());
    download(new Blob([zip(x.files) as BlobPart], { type: 'application/zip' }), `${fileBase()}-layout-parts.zip`);
  } catch (err) { setStatus(infoEl.textContent ?? '', `Couldn't make the layout parts: ${err instanceof Error ? err.message : err}`); }
});
// The design's name (asked on Save): what it saves and downloads under.
const fileBase = () => fileBaseOf(design.name);
$('save').addEventListener('click', () => {
  const name = prompt('Save the design as:', design.name || 'track-piece');
  if (name === null) return;
  // (the name isn't the track: kept, without a rebuild or an undo step)
  design.name = name.trim() || undefined; history.amend(JSON.stringify(design)); save();
  download(new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' }), `${fileBase()}.btd.json`);
});
const loadInput = $<HTMLInputElement>('load-file');
$('load').addEventListener('click', () => loadInput.click());
loadInput.addEventListener('change', async () => {
  const f = loadInput.files?.[0]; if (!f) return;
  try {
    // (checked before it's taken: a file that isn't a design, or a damaged one, leaves the design there is as it was)
    let d0: unknown;
    try { d0 = JSON.parse(await f.text()); } catch { throw new Error("it isn't a track design (.btd.json): the file is cut short or isn't JSON"); }
    design = readDesign(d0); replaced(); framed = false; changed(true); canvas.fit();
  } catch (err) { setStatus('', `Couldn't open ${f.name}: ${err instanceof Error ? err.message : err}`); }
  loadInput.value = '';
});

// ---------- the track canvas ----------
const hintEl = $('hint'), coordsEl = $('coords');
const radiusSel = $<HTMLSelectElement>('radius');
radiusSel.append(new Option('Curves: free', '-1', true, true));
radiusSel.append(new Option('Curves: LEGO radii', '0'));
// (every radius curves.scad makes, 24 + 8k studs, up to R1000: LEGO's and the common ones first, in a group of their own)
{
  const common = [24, 32, 40, 48, 56, 64, 72, 88, 104, 120], g1 = document.createElement('optgroup'), g2 = document.createElement('optgroup');
  g1.label = 'LEGO and common radii'; g2.label = 'Every radius to R1000';
  for (const r of common) g1.append(new Option(`Curves: R${r}`, String(r)));
  for (let r = 24; r <= 1000; r += 8) if (!common.includes(r)) g2.append(new Option(`Curves: R${r}`, String(r)));
  radiusSel.append(g1, g2);
}
// (remembered: it's how you like to draw, not part of the design)
try { const v = localStorage.getItem('btd-radius'); if (v && [...radiusSel.options].some((op) => op.value === v)) radiusSel.value = v; } catch { /* fine */ }
radiusSel.addEventListener('change', () => { try { localStorage.setItem('btd-radius', radiusSel.value); } catch { /* fine */ } });
// What Draw lays: train track or monorail (beside the curves picker; remembered, as the curves are)
const systemSel = document.createElement('select');
systemSel.id = 'system'; systemSel.title = 'What Draw lays: train track or LEGO monorail. A branch drawn off a track is the same as that track.';
systemSel.append(new Option('Track: train', 'train'), new Option('Track: monorail', 'monorail'));
try { const v = localStorage.getItem('btd-system'); if (v === 'monorail') systemSel.value = v; } catch { /* fine */ }
systemSel.addEventListener('change', () => { try { localStorage.setItem('btd-system', systemSel.value); } catch { /* fine */ } });
radiusSel.after(systemSel);
const canvas = new TrackCanvas($<HTMLCanvasElement>('track'), {
  design: () => design,
  changed: (commit) => changed(commit, commit), // (one undo step per finished action, none for each mouse move)
  select: () => { render(); updateSelbar(); },
  radius: () => Number(radiusSel.value),
  system: () => (systemSel.value === 'monorail' ? 'monorail' : 'train'),
  leaveDraw: () => setMode('select'),
  status: (hint, at) => {
    hintEl.textContent = hint;
    coordsEl.textContent = at ? `x ${at[0]}, y ${at[1]} studs` : '';
  },
});
// Plan layers on and off: click one in the legend (remembered).
// (the anti-stud tubes off to start with: a ring at every one cluttered the plan)
canvas.hidden.add('grips');
try { const v = localStorage.getItem('btd-hidden'); if (v) { canvas.hidden.clear(); for (const k of JSON.parse(v) as string[]) canvas.hidden.add(k); } } catch { /* fine */ }
document.querySelectorAll<HTMLElement>('#legend [data-layer]').forEach((el) => {
  const k = el.dataset.layer!;
  el.title = 'Click to show or hide this on the plan';
  el.classList.toggle('off', canvas.hidden.has(k));
  el.addEventListener('click', () => {
    if (canvas.hidden.has(k)) canvas.hidden.delete(k); else canvas.hidden.add(k);
    el.classList.toggle('off', canvas.hidden.has(k));
    try { localStorage.setItem('btd-hidden', JSON.stringify([...canvas.hidden])); } catch { /* fine */ }
    canvas.draw();
  });
});
// (the legend folded away, remembered)
const legendEl = $('legend');
const foldLegend = (on: boolean) => { legendEl.classList.toggle('folded', on); $('legend-fold').textContent = on ? '+' : '–'; try { localStorage.setItem('btd-legend', on ? '0' : '1'); } catch { /* fine */ } };
try { foldLegend(localStorage.getItem('btd-legend') === '0'); } catch { /* fine */ }
$('legend-fold').addEventListener('click', () => foldLegend(!legendEl.classList.contains('folded')));
canvas.draw();
(window as unknown as { btdCanvas: unknown }).btdCanvas = canvas; // (for the browser checks)
const setMode = (m: 'draw' | 'select') => {
  canvas.mode = m; canvas.stopDrawing();
  $('mode-draw').classList.toggle('on', m === 'draw'); $('mode-select').classList.toggle('on', m === 'select');
};
$('mode-draw').addEventListener('click', () => setMode('draw'));
$('mode-select').addEventListener('click', () => setMode('select'));
$('fit').addEventListener('click', () => canvas.fit());
// Show or hide the 3D preview (remembered in the browser).
const mainEl = document.querySelector('main')!;
const set3d = (on: boolean) => {
  mainEl.classList.toggle('no3d', !on);
  // (the status line, with the build's progress, goes with the plan while the 3D view is hidden)
  (on ? $('view3d') : $('plan')).append($('buildstatus'), $('status'));
  $('toggle-3d').classList.toggle('on', on);
  try { localStorage.setItem('btd-3d', on ? '1' : '0'); } catch { /* fine */ }
};
set3d(show3d);
const toggle3d = () => {
  show3d = !show3d; set3d(show3d);
  // (shown again, out of date: built now, if Auto's on; else it says to press Build)
  if (show3d && stale) { if (autoBuild) { stale = false; requestBuild(true); } else { $('rebuild').textContent = 'Build'; setStatus('The 3D view is built when you press Build (Auto is off).', '', true); } }
};
$('toggle-3d').addEventListener('click', toggle3d);
const restore = (json: string) => { design = JSON.parse(json); replaced(); save(); render(); canvas.draw(); updateHistoryButtons(); requestBuild(); };
const undo = () => { const j = history.undo(); if (j !== undefined) restore(j); };
const redo = () => { const j = history.redo(); if (j !== undefined) restore(j); };
function updateHistoryButtons() {
  ($('undo') as HTMLButtonElement).disabled = !history.canUndo;
  ($('redo') as HTMLButtonElement).disabled = !history.canRedo;
}
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
addEventListener('keydown', (e) => {
  // (a dialog open over the page: Esc closes Help (? too), and no other key is a shortcut: nothing's changed behind it)
  const dialog = dialogOpen(), helpOpen = helpEl.classList.contains('open');
  if (e.key === 'Escape' || (e.key === '?' && helpOpen && !typingIn(e))) { helpEl.classList.remove('open'); if (helpOpen) return; }
  if (typingIn(e) || dialog) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  // (the design's file, not the browser's Save page and Open file)
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); $('save').click(); }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); $('load').click(); }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'd' || e.key === 'D') setMode('draw');
  if (e.key === 's' || e.key === 'S') setMode('select');
  if (e.key === 'p' || e.key === 'P') toggle3d();
  if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) canvas.fit();
  if (e.key === '?') helpEl.classList.add('open');
  if (e.key === ',') openSettings(settingsEl.hidden);
});

// Settings: a panel down the right (as the routes' down the left), shown or hidden from the toolbar (or ","), remembered.
const settingsEl = $('settings');
function openSettings(on: boolean, draw = true) {
  settingsEl.hidden = !on; document.body.classList.toggle('settings', on); $('settings-open').classList.toggle('on', on);
  try { localStorage.setItem('btd-settings', on ? '1' : '0'); } catch { /* fine */ }
  if (on && draw) renderOptions();
}
// (drawn with the rest of the form further down)
try { if (localStorage.getItem('btd-settings') === '1') openSettings(true, false); } catch { /* fine */ }
$('settings-open').addEventListener('click', () => openSettings(settingsEl.hidden));
$('settings-close').addEventListener('click', () => openSettings(false));
{
  const search = $<HTMLInputElement>('settings-search');
  search.addEventListener('input', () => { optQuery = search.value.trim(); renderOptions(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; optQuery = ''; renderOptions(); } });
  $('settings-fold').addEventListener('click', () => {
    const fold = OPTION_FORM.some((sec) => openSecs.has(sec.title));
    for (const sec of OPTION_FORM) { if (fold) openSecs.delete(sec.title); else openSecs.add(sec.title); }
    keepSecs(); renderOptions();
  });
}

// (the header's height, for the side panels that slide over the view on a phone)
const headH = () => document.documentElement.style.setProperty('--head-h', `${document.querySelector('header')!.offsetHeight}px`);
addEventListener('resize', headH); headH();
// (a phone: the routes panel starts closed, unless it was left open; the panels close when you tap the plan)
const narrow = () => matchMedia('(max-width: 760px)').matches;
$('track').addEventListener('touchstart', () => { if (narrow()) { if (!document.body.classList.contains('nopanel')) $('toggle-panel').click(); if (!settingsEl.hidden) openSettings(false); } }, { passive: true });
// Installable (add to home screen): the service worker keeps the app (and the geometry kernel) for offline use.
if ('serviceWorker' in navigator && import.meta.env.PROD) addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* (no offline copy: fine) */ }); });

// Help
const helpEl = $('help');
$('help-open').addEventListener('click', () => helpEl.classList.add('open'));
$('about-open').addEventListener('click', () => { helpEl.classList.add('open'); $('about').scrollIntoView({ block: 'start' }); });
$('help-close').addEventListener('click', () => helpEl.classList.remove('open'));
$('help-backdrop').addEventListener('click', () => helpEl.classList.remove('open'));
// (over the whole page, the toolbar and panels dimmed under it too, not only the plan)
document.body.append(helpEl, $('help-backdrop'));
// (the settings' choice pictures: the same, a modal over the page)
document.body.append($('choices'), $('choices-backdrop'));
for (const id of ['choices-close', 'choices-backdrop']) $(id).addEventListener('click', () => $('choices').classList.remove('open'));
addEventListener('keydown', (e) => { if (e.key === 'Escape') $('choices').classList.remove('open'); });

// The routes panel: shown or hidden (remembered).
const setPanel = (on: boolean) => {
  document.body.classList.toggle('nopanel', !on);
  $('toggle-panel').classList.toggle('on', on);
  try { localStorage.setItem('btd-panel', on ? '1' : '0'); } catch { /* fine */ }
};
let showPanel = true;
try { const v = localStorage.getItem('btd-panel'); showPanel = v === null ? !matchMedia('(max-width: 760px)').matches : v !== '0'; } catch { /* fine */ }
setPanel(showPanel);
$('toggle-panel').addEventListener('click', () => { showPanel = !showPanel; setPanel(showPanel); });

// The splitter between the plan and the 3D view (its share remembered).
const splitter = $('splitter');
const setSplit = (f: number) => {
  f = Math.min(0.85, Math.max(0.15, f));
  mainEl.style.setProperty('--plan', `${f}fr`); mainEl.style.setProperty('--view', `${1 - f}fr`);
  return f;
};
try { const f = Number(localStorage.getItem('btd-split')); if (f) setSplit(f); } catch { /* fine */ }
splitter.addEventListener('pointerdown', (e) => {
  splitter.setPointerCapture(e.pointerId); splitter.classList.add('dragging');
  const box = mainEl.getBoundingClientRect();
  const mv = (ev: PointerEvent) => {
    const f = setSplit((ev.clientY - box.top) / box.height);
    try { localStorage.setItem('btd-split', String(f)); } catch { /* fine */ }
  };
  splitter.addEventListener('pointermove', mv);
  splitter.addEventListener('pointerup', () => { splitter.removeEventListener('pointermove', mv); splitter.classList.remove('dragging'); }, { once: true });
});
splitter.addEventListener('dblclick', () => { mainEl.style.removeProperty('--plan'); mainEl.style.removeProperty('--view'); try { localStorage.removeItem('btd-split'); } catch { /* fine */ } });
// (an empty plan: straight on to drawing)
$('clear').addEventListener('click', () => { if (!design.routes.length) return; design.routes = []; canvas.setSelection([]); changed(true); setMode('draw'); });
if (!design.routes.length) setMode('draw');

render();
changed();


// ---------- selection: copy, cut, paste, duplicate, mirror, turn ----------
let clipboard: DRoute[] = [];
const selected = () => canvas.selection().filter((i) => i < design.routes.length);
const nextName = () => freeName(design, 'R');
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Add routes (copies), moved by (dx, dy) studs, and select them. */
function addRoutes(list: DRoute[], dx: number, dy: number) {
  const first = design.routes.length;
  for (const r of list) design.routes.push({ ...structuredClone(r), name: nextName(), x: r3(r.x + dx), y: r3(r.y + dy) });
  canvas.setSelection(list.map((_, k) => first + k));
  changed(true);
}
function copySel() {
  clipboard = selected().map((i) => structuredClone(design.routes[i]));
  try { void navigator.clipboard?.writeText(JSON.stringify({ btdRoutes: clipboard })); } catch { /* fine */ }
}
function deleteSel() {
  for (const i of selected().sort((a, b) => b - a)) design.routes.splice(i, 1);
  canvas.setSelection([]); openCards.clear(); changed(true);
}
function pasteClip() {
  if (!clipboard.length) return;
  const m = canvas.mouseStuds(), p0 = clipboard[0];
  // at the mouse (the first route's start there), or a little over
  addRoutes(clipboard, m ? m[0] - p0.x : 8, m ? m[1] - p0.y : 8);
}
/** Transform the selection about its first route's start. */
function transformSel(f: (r: DRoute, px: number, py: number) => void) {
  const sel = selected(); if (!sel.length) return;
  const { x: px, y: py } = design.routes[sel[0]];
  for (const i of sel) f(design.routes[i], px, py);
  changed(true);
}
const mirrorSel = () => transformSel((r, px) => mirrorRoute(r, px));
const turnSel = (a: number) => transformSel((r, px, py) => {
  const c = Math.cos((a * Math.PI) / 180), sn = Math.sin((a * Math.PI) / 180), dx = r.x - px, dy = r.y - py;
  r.x = r3(px + dx * c - dy * sn); r.y = r3(py + dx * sn + dy * c);
  r.heading = r3((((r.heading + a + 180) % 360) + 360) % 360 - 180);
});
function updateSelbar() {
  const n = selected().length, bar = $('selbar');
  bar.hidden = n === 0 && clipboard.length === 0;
  $('sel-count').textContent = n ? `${n} selected` : 'clipboard:';
  for (const id of ['sel-copy', 'sel-cut', 'sel-dup', 'sel-mirror', 'sel-rotl', 'sel-rotr', 'sel-del']) ($(id) as HTMLButtonElement).disabled = n === 0;
  ($('sel-paste') as HTMLButtonElement).disabled = clipboard.length === 0;
}
$('sel-copy').addEventListener('click', () => { copySel(); updateSelbar(); });
$('sel-cut').addEventListener('click', () => { copySel(); deleteSel(); updateSelbar(); });
$('sel-paste').addEventListener('click', () => { pasteClip(); updateSelbar(); });
$('sel-dup').addEventListener('click', () => { copySel(); addRoutes(clipboard, 8, 0); updateSelbar(); });
$('sel-mirror').addEventListener('click', mirrorSel);
$('sel-rotl').addEventListener('click', () => turnSel(90));
$('sel-rotr').addEventListener('click', () => turnSel(-90));
$('sel-del').addEventListener('click', () => { deleteSel(); updateSelbar(); });
addEventListener('keydown', (e) => {
  if (typingIn(e) || dialogOpen()) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'c') { e.preventDefault(); copySel(); }
  else if (mod && k === 'x') { e.preventDefault(); copySel(); deleteSel(); }
  else if (mod && k === 'v') { e.preventDefault(); pasteClip(); }
  else if (mod && k === 'd') { e.preventDefault(); copySel(); addRoutes(clipboard, 8, 0); }
  else if (mod && k === 'a') { e.preventDefault(); canvas.setSelection(design.routes.map((_, i) => i)); }
  else if (!mod && k === 'm') mirrorSel();
  else if (!mod && k === 'r') turnSel(e.shiftKey ? 90 : -90);
  else return;
  updateSelbar();
});
updateSelbar();


// ---------- piece options (switch.scad's Customizer settings, and the underside) ----------
const { form: OPTION_FORM, noMono } = optionForm(() => design);
let optSig = '';
/** After a build: the options panel again if what applies has changed (switches appearing or going). */
/** After a build: the route cards again if which routes branch has changed (a branch's card has its lever's side). */
let branchSig = '';
function refreshRoutes() {
  const sig = JSON.stringify((canvas.overlay?.items ?? []).filter((it) => it.kind === 'points' && !it.cand).map((it) => [it.key, it.routes]));
  if (sig !== branchSig) { branchSig = sig; render(); }
}
function refreshOptions() {
  if (JSON.stringify([design.options, design.gaugeStuds, switchesNow(), noMono()]) !== optSig) renderOptions();
}
/** Switches in the design, as last built (undefined: not built yet). */
function switchesNow() {
  if (!hasTrack()) return false;
  const items = canvas?.overlay?.items;
  return items && items.some((it) => it.kind === 'points' && !it.off && !it.cand);
}
/** Which settings sections are open (by title), remembered in this browser; the search box's text. */
const openSecs: Set<string> = (() => { try { const v = JSON.parse(localStorage.getItem('btd-settings-open') ?? 'null'); if (Array.isArray(v)) return new Set<string>(v); } catch { /* (none kept) */ } return new Set(OPTION_FORM.slice(0, 2).map((sec) => sec.title)); })();
const keepSecs = () => { try { localStorage.setItem('btd-settings-open', JSON.stringify([...openSecs])); } catch { /* (not kept) */ } };
let optQuery = '';
/** The settings' example pictures (public/options/<key>-<value>.webp, made by scripts/option-pictures.mts): each setting's
 * values that have one (index.json; a text's empty value: none). */
let pictured: Record<string, string[]> = {};
void fetch(`${import.meta.env.BASE_URL}options/index.json`).then((r) => (r.ok ? r.json() : {})).then((v: Record<string, string[]>) => { pictured = v; renderOptions(); }).catch(() => { /* (no pictures: no buttons for them) */ });
/** A value as the settings panel says it: on or off, a text in quotes, a number with its unit (from the label: "…, mm"). */
function valueText(f: OptField, v: string) {
  if (f.check) return v === 'true' ? 'On' : 'Off';
  if (f.text) return v === 'none' ? 'Empty' : `“${v}”`;
  const unit = f.label.includes(', ') ? f.label.slice(f.label.lastIndexOf(', ') + 2) : '';
  return unit === '1 in' ? `1 in ${v}` : unit ? `${v} ${unit}` : v;
}
/** A setting's choices (or, a number or on/off, the values pictured) side by side in a modal: each one's picture, what it
 * does, its drawback, and a button to use it. */
function showChoices(f: OptField, cur: string, def: string, c: OptCtx, off: string | undefined, use: (v: string) => void) {
  const modal = $('choices'), body = $('choices-body');
  $('choices-title').textContent = f.label;
  body.replaceChildren();
  // (a number or on/off: its pictured values, as choices; the value now, a number compared as one)
  const same = (a: string, b: string) => a === b || (!f.choices && !f.check && !f.text && Number(a) === Number(b));
  const choices: OptChoice[] = f.choices ?? (pictured[f.key] ?? []).map((v) => ({ v, t: valueText(f, v) }));
  const curV = f.text && cur === '' ? 'none' : cur, defV = f.text && def === '' ? 'none' : def;
  for (const ch of choices) {
    const isCur = same(ch.v, curV), isDef = same(ch.v, defV);
    const card = document.createElement('div'); card.className = 'choice' + (isCur ? ' current' : '');
    const img = document.createElement('img'); img.loading = 'lazy'; img.alt = ch.t; img.src = `${import.meta.env.BASE_URL}options/${f.key}-${ch.v}.webp`;
    img.addEventListener('error', () => img.remove());
    const h = document.createElement('b'); h.textContent = ch.t + (isDef ? ' (default)' : '');
    card.append(img, h);
    const why = ch.no?.(c);
    for (const [txt, cls] of [[ch.tip, ''], [ch.con && `Drawback: ${ch.con}`, 'con'], [why && `Not built as chosen here: ${why}.`, 'why']] as const) if (txt) { const p2 = document.createElement('p'); p2.textContent = txt; if (cls) p2.className = cls; card.append(p2); }
    const b = document.createElement('button'); b.type = 'button';
    b.textContent = isCur ? 'In use' : 'Use this'; b.disabled = isCur || !!off;
    if (off) b.title = `Locked: ${off}`;
    b.addEventListener('click', () => { use(f.text && ch.v === 'none' ? '' : ch.v); modal.classList.remove('open'); });
    card.append(b); body.append(card);
  }
  // (one column per choice, the window only as wide as they need: no empty space beside two)
  const n = choices.length;
  body.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
  modal.style.width = `min(${n * 340 + 48}px, calc(100vw - 32px))`;
  modal.classList.add('open');
}
function renderOptions() {
  const body = $('options-body'), scroll = $('options').scrollTop;
  const o = { ...OPTION_DEFAULTS, ...design.options } as PieceOptions;
  const c: OptCtx = { o, ballast: o.ballast !== 'none', fdb: o.mechStyle !== 'tines', switches: switchesNow() };
  optSig = JSON.stringify([design.options, design.gaugeStuds, c.switches, noMono()]);
  body.replaceChildren();
  const setOpt = (f: OptField, v: string | number | boolean) => {
    if (f.set) f.set(v); else design.options = { ...design.options, [f.key]: v };
  };
  // (searching: only the fields whose label, help or choices have every word in them, their sections open)
  const words = optQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (f: OptField) => { const txt = [f.label, f.help, ...(f.choices ?? []).flatMap((ch) => [ch.t, ch.tip])].join(' ').toLowerCase(); return words.every((w) => txt.includes(w)); };
  let shown = 0;
  for (const sec of OPTION_FORM) {
    const fields = sec.fields.filter((f) => !words.length || hit(f));
    if (words.length && !fields.length) continue;
    const det = document.createElement('details'); det.className = 'osec';
    // (a section for the kind of track the design hasn't got: folded, and says so)
    const kinds = design.routes.filter((r) => r.segs.length), hasTrain = kinds.some((r) => !isMono(r)), hasMono = kinds.some((r) => isMono(r));
    const absent = kinds.length > 0 && ((sec.kind === 'train' && !hasTrain) || (sec.kind === 'monorail' && !hasMono));
    const absentWhy = sec.kind === 'train' ? 'no train track in this design (only monorail)' : 'no monorail in this design';
    det.open = !absent && (words.length > 0 || openSecs.has(sec.title));
    if (absent) det.classList.add('absent');
    const sum = document.createElement('summary'); sum.textContent = sec.title;
    if (absent) { const ab = document.createElement('em'); ab.className = 'ab'; ab.textContent = 'not used'; ab.title = absentWhy; sum.append(ab); }
    const n = document.createElement('span'); n.className = 'n'; n.textContent = String(fields.length); sum.append(n);
    det.append(sum);
    det.addEventListener('toggle', () => { if (words.length) return; if (det.open) openSecs.add(sec.title); else openSecs.delete(sec.title); keepSecs(); });
    const box = document.createElement('div'); box.className = 'sec';
    if (sec.switches && c.switches === false) {
      box.classList.add('idle');
      const nt = document.createElement('div'); nt.className = 'note'; nt.textContent = 'No switches in this design yet: these apply where a track branches off another.';
      box.append(nt);
    }
    for (const f of fields) {
      shown++;
      if (f.sub) { const h = document.createElement('div'); h.className = 'sub'; h.textContent = f.sub; box.append(h); }
      const cur = f.get ? f.get() : (o as unknown as Record<string, string | number | boolean>)[f.key];
      const def = f.def ?? (OPTION_DEFAULTS as unknown as Record<string, string | number | boolean>)[f.key];
      // (can't be changed now: greyed out, and why, exactly)
      const off = (absent ? absentWhy : undefined) ?? f.off?.(c);
      const wrap = document.createElement('div'); wrap.className = off ? 'opt off' : 'opt';
      const note = (txt: string, cls = 'desc') => { const d = document.createElement('small'); d.className = cls; d.textContent = txt; wrap.append(d); };
      // (pictures of the choices, or of a few values: a round button by the label opens them side by side)
      const pics = (lab: HTMLElement) => {
        if (!pictured[f.key]?.length) return;
        const pb = document.createElement('button'); pb.type = 'button'; pb.className = 'pics'; pb.textContent = 'i';
        pb.title = f.choices ? `See what each choice of ${f.label} looks like` : `See what ${f.label} does, at ${pictured[f.key].map((v) => valueText(f, v)).join(' and ')}`;
        pb.setAttribute('aria-label', pb.title);
        pb.addEventListener('click', (e) => {
          e.preventDefault();
          showChoices(f, String(cur ?? ''), String(def ?? ''), c, off, (v) => { setOpt(f, f.check ? v === 'true' : f.numeric || (!f.choices && !f.text) ? Number(v) : f.text ? v.toUpperCase() : v); changed(true); renderOptions(); });
        });
        lab.querySelector('span')!.append(pb);
      };
      if (f.choices) {
        const sel = document.createElement('select'); sel.disabled = !!off;
        for (const ch of f.choices) {
          const why = ch.no?.(c), dflt = String(def) === ch.v ? ' (default)' : '';
          const op = new Option(why ? `${ch.t}${dflt} (not available)` : `${ch.t}${dflt}`, ch.v);
          op.disabled = !!why && String(cur) !== ch.v; if (ch.tip) op.title = [ch.tip, ch.con && `Drawback: ${ch.con}`, why && `Not available: ${why}.`].filter(Boolean).join(' ');
          sel.append(op);
        }
        sel.value = String(cur);
        const lab = field(f.label, sel); lab.classList.add('stack'); wrap.append(lab);
        pics(lab);
        const chosen = f.choices.find((ch) => ch.v === String(cur)), why = chosen?.no?.(c);
        if (why) note(`Not built as chosen: ${why}.`, 'desc why');
        if (chosen?.tip) note(chosen.tip);
        if (chosen?.con) note(`Drawback: ${chosen.con}`, 'desc con');
        if (f.help) note(f.help);
        sel.addEventListener('change', () => { setOpt(f, f.numeric ? Number(sel.value) : sel.value); changed(true); renderOptions(); });
      } else if (f.text) {
        const ti = document.createElement('input'); ti.type = 'text'; ti.value = String(cur ?? ''); ti.disabled = !!off; ti.maxLength = 24;
        ti.addEventListener('change', () => { setOpt(f, ti.value.trim().toUpperCase()); changed(true); renderOptions(); });
        const lab = field(f.label, ti); lab.classList.add('stack'); wrap.append(lab); pics(lab);
        if (f.help) note(f.help);
      } else if (f.check) {
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = cur !== false; cb.disabled = !!off;
        cb.addEventListener('change', () => { setOpt(f, cb.checked); changed(true); renderOptions(); });
        const lab = field(f.label, cb); wrap.append(lab); pics(lab);
        note([f.help, `Default: ${def === false ? 'off' : 'on'}.`].filter(Boolean).join(' '));
      } else {
        const lim = (v: number) => Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, v));
        const i = num(Number(cur), (v) => { const x = lim(v); setOpt(f, x); i.value = String(x); if (f.rerender) renderOptions(); }, f.step ?? 1, f.help ?? '');
        i.disabled = !!off;
        if (f.min !== undefined) i.min = String(f.min);
        if (f.max !== undefined) i.max = String(f.max);
        const lab = field(f.label, i); wrap.append(lab); pics(lab);
        // (exactly what it takes: its range and steps, and its default)
        const range = f.min !== undefined && f.max !== undefined ? `${f.min} to ${f.max}` : f.min !== undefined ? `at least ${f.min}` : f.max !== undefined ? `at most ${f.max}` : '';
        note([f.help, [range && `Range ${range}`, def !== undefined && `default ${def}`].filter(Boolean).join(', ') + '.'].filter(Boolean).join(' '));
      }
      if (off) note(`Locked: ${off}.`, 'desc why');
      box.append(wrap);
    }
    det.append(box); body.append(det);
  }
  if (words.length && !shown) { const nm = document.createElement('div'); nm.className = 'nomatch'; nm.textContent = `No setting matches “${optQuery}”.`; body.append(nm); }
  const reset = btn('Reset to defaults', () => { design.options = {}; renderOptions(); }, 'Every piece setting back to its default (Undo brings them back; the gauge stays)');
  reset.classList.add('reset'); body.append(reset);
  $('options').scrollTop = scroll;
  $('settings-fold').textContent = OPTION_FORM.some((sec) => openSecs.has(sec.title)) ? 'Fold all' : 'Open all';
}
renderOptions();


// ---------- trackwork: hand edits to the check rails, flangeway cuts and points ----------
type TwItem = { kind: 'check' | 'groove' | 'points' | 'throw'; key: string; at: [number, number]; off?: boolean; len?: number; toe?: number; routes?: string[]; forced?: boolean; cand?: { ok: boolean; why: string }; lever?: { side: number; leverOffset: number; springLength: number; maxTine: number; edited: boolean } };
let twSig = '';
/** The monorail points' toes, as last built (mm). */
const monoToes = (): [number, number][] => (canvas?.overlay as { monoPoints?: [number, number][] } | undefined)?.monoPoints ?? [];
/** Trackwork: the groups and items open (remembered), and whether only the hand-edited ones show. */
const twOpen: Set<string> = (() => { try { const v = JSON.parse(localStorage.getItem('btd-tw-open') ?? 'null'); if (Array.isArray(v)) return new Set<string>(v); } catch { /* (none kept) */ } return new Set(['g:points']); })();
const keepTw = () => { try { localStorage.setItem('btd-tw-open', JSON.stringify([...twOpen])); } catch { /* (not kept) */ } };
let twOnlyEdited = false;
function renderTrackwork(list: TwItem[]) {
  const sig = JSON.stringify([list.map((it) => [it.kind, it.key, it.off, Math.round((it.len ?? 0) * 10), it.toe, it.routes, it.forced, it.cand, it.lever && [it.lever.side, it.lever.leverOffset, it.lever.springLength]]),
    design.trackwork, design.options?.throwSide, design.options?.mechStyle, design.routes.map((r) => [r.name, r.throwSide]), monoToes(), twOnlyEdited]);
  if (sig === twSig) return; // (don't rebuild the form under the user's fingers)
  twSig = sig;
  const body = $('trackwork-body'), scroll = $('trackwork').scrollTop; body.replaceChildren();
  const tw = design.trackwork ?? {};
  // (a hand edit: anything kept for it in design.trackwork)
  const editedOf = (kind: keyof Trackwork, key: string) => { const e = (tw[kind] as Record<string, Record<string, unknown>> | undefined)?.[key]; return !!e && Object.values(e).some((v) => v !== undefined && v !== false && !(Array.isArray(v) && !v.length)); };
  const edits = (['points', 'throw', 'check', 'groove'] as const).reduce((n, k) => n + Object.keys(tw[k] ?? {}).filter((key) => editedOf(k, key)).length, 0);
  const edit = <K extends keyof Trackwork>(kind: K, key: string, patch: Record<string, unknown>) => {
    const t2 = (design.trackwork ??= {}), group = ((t2[kind] ??= {}) as Record<string, Record<string, unknown>>);
    group[key] = { ...group[key], ...patch };
    changed(true);
  };
  const resetOne = (kind: keyof Trackwork, key: string) => { const g = (design.trackwork?.[kind] ?? {}) as Record<string, unknown>; delete g[key]; twSig = ''; changed(true); };
  // the bar on top: how many are edited, only those, reset them all
  if (list.length || monoToes().length) {
    const bar = document.createElement('div'); bar.className = 'twbar';
    const cnt = document.createElement('span'); cnt.className = edits ? 'chipn on' : 'chipn'; cnt.textContent = edits ? `${edits} edited by hand` : 'Nothing edited: all as worked out';
    const only = document.createElement('input'); only.type = 'checkbox'; only.checked = twOnlyEdited; only.disabled = !edits;
    only.addEventListener('change', () => { twOnlyEdited = only.checked; twSig = ''; renderTrackwork(list); });
    const ol = document.createElement('label'); ol.className = 'only'; ol.append(only, document.createTextNode(' Show only edited'));
    const reset = btn('Reset all', () => { design.trackwork = {}; twSig = ''; twOnlyEdited = false; }, 'Put every check rail, flangeway cut, points set and lever back to what the app works out (points taken out put back, forced ones unforced). Undo brings them back.');
    reset.disabled = !edits; reset.classList.add('danger');
    bar.append(cnt, ol, reset); body.append(bar);
  }
  if (!list.length && !monoToes().length) { const n = document.createElement('div'); n.className = 'none'; n.textContent = 'No check rails, flangeway cuts or points in this design.'; body.append(n); $('trackwork-count').textContent = ''; return; }
  // a group of items, folding (its header stays in view)
  const group = (id: string, title: string, n: number, nEdited: number) => {
    const g = document.createElement('details'); g.className = 'twg'; g.open = twOpen.has(`g:${id}`) || (twOnlyEdited && nEdited > 0);
    const sm = document.createElement('summary'); sm.textContent = title;
    const c = document.createElement('span'); c.className = 'n'; c.textContent = nEdited ? `${n} · ${nEdited} edited` : String(n); if (nEdited) c.classList.add('ed'); sm.append(c);
    g.addEventListener('toggle', () => { if (g.open) twOpen.add(`g:${id}`); else twOpen.delete(`g:${id}`); keepTw(); });
    g.append(sm); body.append(g); return g;
  };
  // an item: its line (name, what it is now, Edited), and its settings under it when open
  const item = (g: HTMLElement, key: string, title: string, sub: string, edited: boolean, kind?: keyof Trackwork) => {
    const d = document.createElement('details'); d.className = 'tw' + (edited ? ' edited' : ''); d.open = twOpen.has(`i:${key}`);
    const sm = document.createElement('summary');
    const t = document.createElement('b'); t.textContent = title;
    const st = document.createElement('span'); st.className = 'sub'; st.textContent = sub;
    sm.append(t, st);
    if (edited) { const e = document.createElement('em'); e.className = 'edtag'; e.textContent = 'Edited'; e.title = 'Changed by hand from what the app works out'; sm.append(e); }
    sm.addEventListener('mouseenter', () => { canvas.highlight = key; canvas.draw(); });
    sm.addEventListener('mouseleave', () => { canvas.highlight = undefined; canvas.draw(); });
    d.addEventListener('toggle', () => { if (d.open) twOpen.add(`i:${key}`); else twOpen.delete(`i:${key}`); keepTw(); });
    const b2 = document.createElement('div'); b2.className = 'twb';
    d.append(sm, b2); g.append(d);
    if (edited && kind) { const r = btn('Reset this', () => resetOne(kind, key), 'Back to what the app works out'); r.classList.add('reset1'); queueMicrotask(() => b2.append(r)); }
    return b2;
  };
  const check = (row: HTMLElement, label: string, on: boolean, change: (v: boolean) => void, tip?: string) => {
    const i = document.createElement('input'); i.type = 'checkbox'; i.checked = on; if (tip) i.title = tip;
    i.addEventListener('change', () => change(i.checked)); row.append(field(label, i));
  };
  const show = (edited: boolean) => !twOnlyEdited || edited;
  // Points: one per toe (a three-way's splits share one), built or taken out; and the near misses, to force points there
  {
    const keys = [...new Set(list.filter((it) => it.kind === 'points').map((it) => it.key))];
    if (keys.length) {
      const g = group('points', 'Points', keys.length, keys.filter((k) => editedOf('points', k)).length);
      let n = 0, m = 0;
      for (const key of keys) {
        const its = list.filter((it) => it.kind === 'points' && it.key === key), st = canvas.pointsState(key), cand = its.find((it) => it.cand)?.cand;
        const cur = design.trackwork?.points?.[key] ?? {}, ed = editedOf('points', key);
        if (!show(ed)) { if (st.state === 'cand') m++; else n++; continue; }
        if (st.state === 'cand') {
          const row = item(g, key, `Could be points ${++m}`, st.forced ? (st.ok ? 'forced' : 'forced · too far off to build') : 'not built', ed, 'points');
          const why = document.createElement('div'); why.className = 'none'; why.textContent = `${cand?.why ?? ''}${cand?.ok ? '' : ': too far off to force (redraw it to start on the track)'}`; row.append(why);
          check(row, 'Force points here', st.forced, () => canvas.togglePoints(key), 'Make points here though the track end is a hair off the other track');
        } else {
          const ids = [...new Set(its.flatMap((it) => it.routes ?? []))];
          const sub = [ids.join(' / '), st.state === 'off' ? 'taken out' : st.forced ? 'forced' : '', cur.toe ? `moved ${cur.toe > 0 ? '+' : ''}${cur.toe} mm` : '', cur.drop?.length ? `without ${cur.drop.join(', ')}` : ''].filter(Boolean).join(' · ');
          const row = item(g, key, `Points ${++n}`, sub, ed, 'points');
          check(row, 'Built (off: both tracks\' rails run through as plain track)', st.state === 'built', () => canvas.togglePoints(key));
          // (a three-way: each route in it or not; one taken out leaves a two-way for the others)
          if (ids.length > 2 && !cur.off) for (const id of ids) check(row, `${id} in the points`, !cur.drop?.includes(id), (v) => {
            const drop = (cur.drop ?? []).filter((d2) => d2 !== id).concat(v ? [] : [id]);
            edit('points', key, { drop: drop.length ? drop : undefined });
          });
          if (st.state === 'built') { const i = num((cur.toe ?? 0) / 8, (v) => edit('points', key, { toe: v * 8 }), 0.125); row.append(field('Moved along, studs', i)); }
        }
      }
    }
  }
  const names = { throw: ['Levers', 'Lever'], check: ['Check rails', 'Check rail'], groove: ['Flangeway cuts', 'Flangeway cut'] } as const;
  for (const kind of ['throw', 'check', 'groove'] as const) {
    const its = list.filter((it) => it.kind === kind);
    if (!its.length) continue;
    const g = group(kind, names[kind][0], its.length, its.filter((it) => editedOf(kind, it.key)).length);
    its.forEach((it, n) => {
      const cur = ((design.trackwork?.[kind] ?? {}) as Record<string, Record<string, number | boolean | string>>)[it.key] ?? {}, ed = editedOf(kind, it.key);
      if (!show(ed)) return;
      let sub: string;
      if (kind === 'throw' && it.lever) { const ls = leverSide(design, it as unknown as OverlayItem, (canvas.overlay?.items ?? [])); sub = `${ls.side} · ${(it.lever.leverOffset / 8).toFixed(2).replace(/\.?0+$/, '')} studs out`; }
      else sub = [it.len ? `${it.len.toFixed(1)} mm` : '', it.off ? 'taken out' : '', cur.d0 ? `start ${Number(cur.d0) > 0 ? '+' : ''}${cur.d0}` : '', cur.d1 ? `end ${Number(cur.d1) > 0 ? '+' : ''}${cur.d1}` : '', cur.shift ? `moved ${cur.shift}` : ''].filter(Boolean).join(' · ');
      const row = item(g, it.key, `${names[kind][1]} ${n + 1}`, sub, ed, kind);
      // (studs: the value kept in mm, shown and set in studs)
      const numField = (label: string, prop: string, step: number, min?: number, studs = false) => {
        const k = studs ? 8 : 1;
        const i = num(((cur[prop] as number) ?? 0) / k, (v) => edit(kind, it.key, { [prop]: min === undefined ? v * k : Math.max(min, v * k) }), step);
        if (min !== undefined) i.min = String(min);
        row.append(field(label, i));
      };
      if (kind === 'check') {
        numField('Longer at the start, studs', 'd0', 0.125, undefined, true); numField('Longer at the end, studs', 'd1', 0.125, undefined, true); numField('Moved in from the rail, mm', 'shift', 0.1);
        check(row, 'Take it out', !!cur.off, (v) => edit(kind, it.key, { off: v }));
      } else if (kind === 'groove') {
        numField('Longer at the start, studs', 'd0', 0.125, 0, true); numField('Longer at the end, studs', 'd1', 0.125, 0, true);
      } else if (kind === 'throw' && it.lever) {
        // (drag the lever on the plan, or set it here; Auto: as the route or the options say)
        const lv = it.lever, ls = leverSide(design, it as unknown as OverlayItem, (canvas.overlay?.items ?? []));
        const side = document.createElement('select');
        const auto = ls.by === 'hand' ? 'Auto (as the route or the settings say)' : `Auto: ${ls.side} (${ls.why})`;
        for (const [v, l] of [['auto', auto], ['left', 'Left'], ['right', 'Right']]) side.append(new Option(l, v));
        side.value = ls.by === 'hand' ? ls.side : 'auto';
        side.title = 'Left or right as you face along the points from their toe';
        side.addEventListener('change', () => {
          const t2 = (design.trackwork ??= {}), gg = (t2.throw ??= {}), e = { ...gg[it.key] };
          if (side.value === 'auto') delete e.side; else e.side = side.value as 'left' | 'right';
          if (Object.keys(e).length) gg[it.key] = e; else delete gg[it.key];
          changed(true);
        });
        const sf = field('Side', side); sf.classList.add('stack'); row.append(sf);
        const out = num(lv.leverOffset / 8, (v) => edit('throw', it.key, { leverOffset: Math.max(0, v * 8) }), 0.125); out.min = '0';
        row.append(field('Out past the track, studs', out));
        if (leverSlides(design)) {
          const tine = num(lv.springLength / 8, (v) => edit('throw', it.key, { springLength: Math.min(lv.maxTine, Math.max(16, v * 8)) }), 0.125); tine.min = '2'; tine.max = String(Math.floor(lv.maxTine / 8 * 8) / 8);
          row.append(field('Spring tines (shorter: the lever nearer the heel), studs', tine));
        }
      }
    });
  }
  // (monorail points: what they are, and that they're built as drawn)
  if (monoToes().length && !twOnlyEdited) {
    const g = group('mono', 'Monorail points (experimental)', monoToes().length, 0);
    monoToes().forEach((q, k) => {
      const row = item(g, `mono:${k}`, `Monorail points ${k + 1}`, `at ${(q[0] / 8).toFixed(0)}, ${(q[1] / 8).toFixed(0)} studs`, false);
      const n2 = document.createElement('div'); n2.className = 'none';
      n2.textContent = 'Experimental: not test-printed yet. Built where the routes part, as drawn: the lever is on the main track\'s side, away from the branch (as LEGO\'s). To move them, redraw the branch; their slide and clearance are in Settings › Monorail.';
      row.append(n2);
    });
  }
  $('trackwork').scrollTop = scroll;
  $('trackwork-count').textContent = list.length || monoToes().length ? ` (${edits ? `${edits} edited` : 'none edited'})` : '';
}
