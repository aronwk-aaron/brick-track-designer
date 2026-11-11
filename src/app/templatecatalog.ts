// The template browser's facts about each template, worked out from its name and its routes (nothing is written by
// hand but the few overrides below), and the plain logic of the browser: its sections, its search and its filters, and
// the plan picture's lines. No page here: main's browser (templatebrowser.ts) only shows what this works out.
import { type Design, STUD, TEMPLATES, TEMPLATE_GROUPS, TEMPLATE_SETS, isMono, routeGaugeStuds, toRoutes } from './design';
import { type Pt, type Route, hostedEnds, railOffsetOf, railPoint, routeLength, routesBox, segLength, segStarts } from '../route/route';

export type Kind =
  | 'switch' | 'curved switch' | 'wye' | 'three-way' | 'next-track switch' | 'crossing' | 'curved crossing' | 'slip'
  | 'crossover' | 'buffer' | 'straight' | 'curve' | 'set' | 'layout' | 'feature' | 'monorail' | 'ramp' | 'test print';
export const KINDS: Kind[] = ['switch', 'curved switch', 'wye', 'three-way', 'next-track switch', 'crossing', 'curved crossing', 'slip', 'crossover', 'buffer', 'straight', 'curve', 'set', 'layout', 'feature', 'monorail', 'ramp', 'test print'];
/** What each kind is called, in plain words (the filter chips, the card's second line, the words a search finds). */
export const KIND_LABEL: Record<Kind, string> = {
  switch: 'Switch', 'curved switch': 'Curved switch', wye: 'Wye', 'three-way': 'Three-way', 'next-track switch': 'Switch to the next track',
  crossing: 'Crossing', 'curved crossing': 'Curved crossing', slip: 'Slip', crossover: 'Crossover', buffer: 'Buffer stop', straight: 'Straight', curve: 'Curve', set: 'Set',
  layout: 'Layout', feature: 'Feature', monorail: 'Monorail', ramp: 'Ramp', 'test print': 'Test print',
};
export type Gauge = 'standard' | 'narrow' | 'dual' | 'mixed' | 'none';
export const GAUGES: Exclude<Gauge, 'none'>[] = ['standard', 'narrow', 'dual', 'mixed'];
export const GAUGE_LABEL: Record<Gauge, string> = { standard: 'Standard gauge', narrow: 'Narrow gauge', dual: 'Dual gauge', mixed: 'Mixed gauges', none: '' };
export type System = 'train' | 'monorail';
/** Whose range of parts a template is from (its group's), if it's one of the makers' groups. */
export type Range = 'TrixBrix' | '4DBrix' | 'BrickTracks' | 'Monorail' | 'Mine';
export const RANGES: Range[] = ['TrixBrix', '4DBrix', 'BrickTracks', 'Monorail', 'Mine'];
export type Hand = 'left' | 'right' | 'none';

export interface TemplateInfo {
  name: string; group: string; kind: Kind;
  hand: Hand;
  /** The other hand's template, if there is one (its name is the same with left and right swapped). */
  twin?: string;
  /** The name for a card that stands for both hands: without the word left or right. */
  title: string;
  /** Radius in studs: the name's first R-number, else the curves' one radius (undefined: none, several, or not a whole number). */
  radius?: number;
  gauge: Gauge; system: System; range?: Range;
  /** The track's footprint in studs, the longer side first. */
  length: number; width: number;
  routes: number;
  /** Where the browser lists it: a section of its own for a stock group, else by kind (and gauge) for the reference trackwork. */
  section: string; parent?: string;
  /** one of My templates (saved in this browser): its name is "mine:" and its id */
  mine?: boolean;
  /** (mine) why it can't be used: it's damaged */
  damaged?: string;
}

/** The kinds the names don't say (or say wrongly): checked first. */
export const KIND_OVERRIDES: Record<string, Kind> = {
  'Wye with a crossover': 'layout',
  'X yard (6 tracks, single slips)': 'layout',
  'T-junction core R56': 'feature',
};

/** The makers' ranges' groups: their templates are listed by kind, not in one pile. */
export const REFERENCE_GROUPS: Record<string, Range> = { 'TrixBrix trackwork': 'TrixBrix', '4DBrix trackwork': '4DBrix', 'BrickTracks trackwork': 'BrickTracks', 'Monorail trackwork': 'Monorail' };

/** The monorail trackwork's kinds, from the names ("Monorail points right", "Monorail S-curve left", "Monorail ramp, 10 bricks up"…). */
function monoKindOf(name: string): Kind {
  const n = name.toLowerCase();
  if (/\bramp\b/.test(n)) return 'ramp';
  if (/\bpoints\b|\bswitch\b/.test(n)) return 'switch';
  if (/crossing/.test(n)) return 'crossing';
  if (/curve/.test(n)) return 'curve';
  return 'straight';
}

/** A template's kind: from its name (first rule that fits), else its group. */
export function kindOf(name: string, group: string, mono = false): Kind {
  if (/test/i.test(group)) return 'test print';
  if (group === 'Monorail trackwork') return monoKindOf(name);
  if (mono || /monorail/i.test(group)) return 'monorail';
  if (KIND_OVERRIDES[name]) return KIND_OVERRIDES[name];
  // (a set of parts, as the maker sells them together: said by its module, not its name)
  if (TEMPLATE_SETS.has(name)) return 'set';
  const n = name.toLowerCase();
  // (plain track: named for what it is, first)
  if (/^(narrow-gauge |dual gauge )?straight\b/.test(n)) return 'straight';
  if (/^(narrow-gauge |dual gauge )?curve\b/.test(n)) return 'curve';
  if (/slip/.test(n)) return 'slip';
  if (/crossover/.test(n)) return 'crossover';
  if (/curved switch/.test(n)) return 'curved switch';
  if (/three-way/.test(n)) return /\bgap\b|next track/.test(n) ? 'next-track switch' : 'three-way';
  if (/\bwye\b/.test(n)) return 'wye';
  if (/^switch\b/.test(n) && /\bgap\b|next track/.test(n)) return 'next-track switch';
  if (/buffer/.test(n)) return 'buffer';
  if (/curved crossing|pass-through|crossing of two|t-junction/.test(n)) return 'curved crossing';
  if (/crossing/.test(n)) return 'crossing';
  if (/switch/.test(n)) return 'switch';
  return /layout/i.test(group) ? 'layout' : 'feature';
}

const HAND_WORD = /\b(left|right)\b/gi;
/** Which hand a name says: left or right (not both: "Wye R40 left, R56 right" has no hand). */
export function handOf(name: string): Hand {
  const w = new Set([...name.matchAll(HAND_WORD)].map((m) => m[1].toLowerCase()));
  return w.size === 1 ? (w.has('left') ? 'left' : 'right') : 'none';
}
/** The name with left and right swapped (case kept). */
export const swapHand = (name: string) => name.replace(HAND_WORD, (w) => {
  const o = w.toLowerCase() === 'left' ? 'right' : 'left';
  return w[0] === w[0].toUpperCase() ? o[0].toUpperCase() + o.slice(1) : o;
});
/** The name without its hand: "Left switch (LEGO)" → "Switch (LEGO)", "Switch R104 left, lever…" → "Switch R104, lever…". */
export function withoutHand(name: string): string {
  if (handOf(name) === 'none') return name;
  const s = name
    .replace(/\s*\(turning (left|right)\)/i, '')
    .replace(/,\s*(left|right)\s*$/i, '')
    .replace(/^(left|right)\s+/i, '')
    .replace(/\s+(left|right)\b/i, '');
  return s[0].toUpperCase() + s.slice(1);
}

/** Radii in a name, studs: "R40", "R40 left, R56 right" → [40, 56] (whole ones: not a fitted "R63.8"). */
export const radiiIn = (name: string) => [...name.matchAll(/\bR(\d+)\b(?!\.\d)/g)].map((m) => Number(m[1]));

function gaugeOf(d: Design): Gauge {
  const rs = d.routes.filter((r) => !isMono(r));
  if (!rs.length) return 'none';
  if (rs.some((r) => r.dualGauge)) return 'dual';
  const gs = new Set(rs.map((r) => routeGaugeStuds(d, r)));
  // (a narrower track within a wider one's end: the narrow gauge leaving a dual-gauge track, or moved across it)
  if (gs.size > 1 && hostedEnds(toRoutes(d), toRoutes(d).map((rt) => railOffsetOf(rt, ((d.gaugeStuds + 1) * STUD) / 2))).length) return 'dual';
  if (gs.size > 1) return 'mixed';
  return [...gs][0] < 4 ? 'narrow' : 'standard';
}

/** The routes' footprint, studs: the centre lines' box with half the rail spacing each side. */
function footprint(d: Design): { length: number; width: number } {
  const rts = toRoutes(d);
  if (!rts.length) return { length: 0, width: 0 };
  const pad = d.routes.some((r) => !isMono(r)) ? ((d.gaugeStuds + 1) * STUD) / 2 : STUD;
  const [x0, y0, x1, y1] = routesBox(rts, pad, 2);
  const a = (x1 - x0) / STUD, b = (y1 - y0) / STUD;
  return { length: Math.round(Math.max(a, b)), width: Math.round(Math.min(a, b)) };
}

/** The section a template is listed in (and the heading over it). */
function sectionOf(group: string, kind: Kind, gauge: Gauge): { section: string; parent?: string } {
  if (!(group in REFERENCE_GROUPS)) return { section: group };
  const parent = group;
  if (gauge === 'narrow') return { section: 'Narrow gauge', parent };
  if (gauge === 'dual' || gauge === 'mixed') return { section: 'Dual and mixed gauge', parent };
  const by: Partial<Record<Kind, string>> = {
    switch: 'Switches', 'curved switch': 'Curved switches', wye: 'Wyes', 'three-way': 'Three-ways', 'next-track switch': 'Switches to the next track',
    crossing: 'Crossings', 'curved crossing': 'Curved and pass-through crossings', slip: 'Slips and crossovers', crossover: 'Slips and crossovers', buffer: 'Buffers', straight: 'Plain track', curve: 'Plain track', set: 'Sets', ramp: 'Ramps',
  };
  return { section: by[kind] ?? 'Other parts', parent };
}
/** The order the reference trackwork's sections are shown in. */
export const REFERENCE_SECTIONS = ['Switches', 'Curved switches', 'Wyes', 'Three-ways', 'Switches to the next track', 'Crossings', 'Curved and pass-through crossings', 'Slips and crossovers', 'Buffers', 'Plain track', 'Ramps', 'Sets', 'Narrow gauge', 'Dual and mixed gauge', 'Other parts'];

/** The facts about every template. */
export function buildCatalog(templates: Record<string, Design> = TEMPLATES, groups: [string, string[]][] = TEMPLATE_GROUPS): TemplateInfo[] {
  const out: TemplateInfo[] = [];
  for (const [group, names] of groups) {
    for (const name of names) {
      const d = templates[name];
      if (!d) continue;
      const mono = d.routes.some(isMono);
      const kind = kindOf(name, group, mono);
      const gauge = gaugeOf(d);
      const hand = handOf(name), twin = hand === 'none' ? undefined : swapHand(name);
      const curves = new Set(d.routes.flatMap((r) => r.segs.flatMap((s) => (s.kind === 'curve' ? [s.radius] : []))));
      // (a radius only if it's a whole number of studs: the next-track switches' curves are fitted, R39.33)
      const only = curves.size === 1 ? [...curves][0] : undefined;
      const radius = radiiIn(name)[0] ?? (only !== undefined && Math.abs(only - Math.round(only)) < 0.01 ? Math.round(only) : undefined);
      out.push({
        name, group, kind, hand, ...(twin && templates[twin] && { twin }), title: withoutHand(name), ...(radius !== undefined && { radius }),
        gauge, system: mono ? 'monorail' : 'train', ...(REFERENCE_GROUPS[group] && { range: REFERENCE_GROUPS[group] }), ...footprint(d), routes: d.routes.length, ...sectionOf(group, kind, gauge),
      });
    }
  }
  return out;
}

let memo: TemplateInfo[] | undefined;
/** The facts about the app's templates (worked out once, when first wanted). */
export const catalog = () => (memo ??= buildCatalog());

/** One card: a template, or a left and right pair (the left one's facts, with the right one's name as twin). */
export type Card = TemplateInfo;
/** The cards: a template whose other hand exists is not a card of its own, its twin's card has both. */
export const cardsOf = (infos: TemplateInfo[]): Card[] => infos.filter((t) => !(t.hand === 'right' && t.twin));
/** How many templates a card stands for. */
export const countOf = (c: Card) => (c.twin ? 2 : 1);
/** The card a template name is on. */
export const cardFor = (infos: TemplateInfo[], name: string): Card | undefined => {
  const t = infos.find((i) => i.name === name);
  return t && (t.hand === 'right' && t.twin ? infos.find((i) => i.name === t.twin) : t);
};

/** The card's second line: "Switch · R104 · 40 × 16 studs". */
export function describe(c: Card): string {
  const bits = [KIND_LABEL[c.kind]];
  if (c.gauge !== 'standard' && c.gauge !== 'none') bits.push(GAUGE_LABEL[c.gauge].toLowerCase());
  if (c.radius !== undefined) bits.push(`R${c.radius}`);
  if (c.length > 0) bits.push(`${c.length} × ${c.width} studs`);
  return bits.join(' · ');
}

// ---------- search and filters ----------
export interface Filters { query: string; kinds: ReadonlySet<Kind>; gauges: ReadonlySet<Gauge>; systems: ReadonlySet<System>; radii: ReadonlySet<number>; ranges: ReadonlySet<Range> }
export const noFilters = (): Filters => ({ query: '', kinds: new Set(), gauges: new Set(), systems: new Set(), radii: new Set(), ranges: new Set() });
export const filtering = (f: Filters) => !!(f.query.trim() || f.kinds.size || f.gauges.size || f.systems.size || f.radii.size || f.ranges.size);

/** What a search looks in: names (both hands), kind words, gauge and track words, radius. */
export const haystack = (c: Card) => [c.name, c.twin, c.title, c.group, KIND_LABEL[c.kind], c.kind, GAUGE_LABEL[c.gauge], c.system, c.range, c.radius !== undefined ? `R${c.radius}` : '']
  .filter(Boolean).join(' ').toLowerCase();
/** Does a card pass the filters? Every word of the search must be found; within one kind of chip any one fits, across kinds all must. */
export function matches(c: Card, f: Filters): boolean {
  if (f.kinds.size && !f.kinds.has(c.kind)) return false;
  if (f.gauges.size && !f.gauges.has(c.gauge)) return false;
  if (f.systems.size && !f.systems.has(c.system)) return false;
  if (f.ranges.size && !(c.range && f.ranges.has(c.range))) return false;
  if (f.radii.size && !(c.radius !== undefined && f.radii.has(c.radius))) return false;
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const h = haystack(c);
  return words.every((w) => h.includes(w));
}
export const filterCards = (cards: Card[], f: Filters) => cards.filter((c) => matches(c, f));

/** The radii present among cards, smallest first. */
export const radiiOf = (cards: Card[]) => [...new Set(cards.flatMap((c) => (c.radius === undefined ? [] : [c.radius])))].sort((a, b) => a - b);
/** The kinds present among cards, in the usual order. */
export const kindsOf = (cards: Card[]) => KINDS.filter((k) => cards.some((c) => c.kind === k));

// ---------- sections ----------
export interface Section { id: string; title: string; parent?: string; cards: Card[] }
/** The browser's sections: the stock groups first, each as it is in TEMPLATE_GROUPS; then the reference trackwork by kind, switches by radius. */
export function sectionsOf(cards: Card[], groups: [string, string[]][] = TEMPLATE_GROUPS): Section[] {
  const out: Section[] = [];
  const order = (a: Card, b: Card) => (a.radius ?? Infinity) - (b.radius ?? Infinity);
  for (const [g] of groups) {
    if (g in REFERENCE_GROUPS) continue;
    const cs = cards.filter((c) => c.group === g && c.section === g);
    if (cs.length) out.push({ id: g, title: g, cards: cs });
  }
  // (groups added since: the reference trackwork's own order is the sections' list above)
  for (const [g] of groups) if (g in REFERENCE_GROUPS) for (const s of REFERENCE_SECTIONS) {
    const cs = cards.filter((c) => c.parent === g && c.section === s);
    if (cs.length) out.push({ id: `${g}/${s}`, title: s, parent: g, cards: [...cs].sort(order) });
  }
  return out;
}

// ---------- the plan picture ----------
export interface PictureLine { /** the route's centre line, studs */ centre: Pt[]; /** its two rails (none for a monorail's beam) */ rails: Pt[][]; /** studs between rails (a beam: its width) */ gauge: number; mono: boolean }
export interface PlanPicture { lines: PictureLine[]; /** [x0, y0, x1, y1] round all of it, studs */ box: [number, number, number, number] }

/** A route's points at one offset to its right: straights by their ends, curves every few degrees. */
function sampleRoute(rt: Route, o: number): Pt[] {
  const starts = segStarts(rt), out: Pt[] = [];
  rt.segments.forEach((sg, k) => {
    const l = segLength(sg), n = sg.kind === 'arc' ? Math.max(2, Math.ceil(Math.abs(sg.angle) / 4)) : 1;
    for (let i = k === 0 ? 0 : 1; i <= n; i++) out.push(railPoint(rt, starts[k] + (l * i) / n, o).map((v) => v / STUD) as Pt);
  });
  if (!out.length && routeLength(rt) === 0) out.push(railPoint(rt, 0, o).map((v) => v / STUD) as Pt);
  return out;
}

/** The lines of a plan picture of a design: each route's centre line and rails, in studs (y up, as on the plan). */
export function planPicture(d: Design): PlanPicture {
  const rts = toRoutes(d), lines: PictureLine[] = [];
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  rts.forEach((rt, i) => {
    const mono = isMono(d.routes[i]);
    const half = railOffsetOf(rt, ((d.gaugeStuds + 1) * STUD) / 2);
    const centre = sampleRoute(rt, 0);
    const rails = mono ? [] : [sampleRoute(rt, -half), sampleRoute(rt, half)];
    lines.push({ centre, rails, gauge: mono ? 2 : (half * 2) / STUD, mono });
    for (const p of [...centre, ...rails.flat()]) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
  });
  return { lines, box: lines.length ? b : [0, 0, 1, 1] };
}
