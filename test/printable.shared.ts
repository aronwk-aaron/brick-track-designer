// Does what's exported print without supports? A representative set of designs (DESIGNS), each built as the app builds it,
// and every printed part's file, as exported (on the bed, the way up it prints), looked at the way a slicer would:
// 1. nothing hangs: no face facing down steeper than 45 degrees above the bed with nothing to hold it (scripts/printability.ts
//    hangingAt: held by the part's own break-out supports, which are in its file, a slope of 45 degrees or less, or a
//    bridge of 10 mm or less across); no more than HANG mm2 (the moving parts' own check, assembly.shared.ts putTogether, has that bound);
// 2. no floating islands: no bit of a layer (0.2 mm) that touches nothing in the layer below, grown by 0.3 mm
//    (scripts/printability.ts islandsOf).
// Where a design fails today it's in PINNED, the exact part, where and how much: never loosened to make a design pass. A
// pin is a ceiling (it may come down, not go up) and must still be found (else it comes off the list).
import { expect, it } from 'vitest';
import { kernel } from '../src/geom/kernel';
import { buildDesign, clearBuildCache, type Piece } from '../src/app/build';
import { type Design, OPTION_DEFAULTS, type PieceOptions, TEMPLATES } from '../src/app/design';
import { arena } from '../src/geom/kernel';
import { boxText, hangingAt, islandsOf, stlSolid } from '../scripts/printability';

const APP = (globalThis as { APP_DEFAULTS?: PieceOptions }).APP_DEFAULTS!;

/** (mm2) A part may hang this much (a sliver the face sampling finds; assembly.shared.ts putTogether's bound too). */
export const HANG = 1;

const st = (studs: number, more = {}) => ({ name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight' as const, studs }], ...more });
const curve = (radius: number, angle: number, more = {}) => ({ name: 'B', x: 0, y: 0, heading: 0, segs: [{ kind: 'curve' as const, radius, angle }], ...more });
const D = (routes: unknown[], options: Record<string, unknown> = {}): Design => ({ version: 1, gaugeStuds: 4, routes, options: { legoTrack: 'print', ...options } } as Design);
const sw = TEMPLATES['Left switch (LEGO)'].routes;
/** A long straight cut to a small print bed, so its joints show. */
const cut = (joint: string, more = {}) => D([st(32)], { printBedX: 128, printBedY: 128, splitTrack: 'bed', joint, ballast: 'buddy', ...more });

/** The designs, by what they stand for (the names are the tests'). */
export const DESIGNS: Record<string, Design> = {
  'plain track on sleepers (straight and curve)': D([st(16), { ...st(16), name: 'S2', x: 10 }, curve(40, 22.5, { x: 20 })], { splitTrack: 'lengths', sleepers: 'sleepers' }),
  'plain track on ballast': D([st(16), curve(40, 22.5, { x: 12 })], { ballast: 'ballast', splitTrack: 'lengths' }),
  'switch: blades on top, lever built in': TEMPLATES['Left switch (LEGO)'],
  'switch: blades on top, lever on a bracket': D(sw, { throwStyle: 'bracket' }),
  'switch: blades on top, switch stand': D(sw, { throwStyle: 'stand' }),
  'switch: blades on top, nail switch': D(sw, { throwStyle: 'nail' }),
  'switch: blades on top, snap clamp, rigid blades': D(sw, { bladeStyle: 'simple', throwAction: 'snap' }),
  'switch: under the bed, on spring tines': D(sw, { mechStyle: 'tines' }),
  'three-way, one lever': TEMPLATES['Three-way switch (one throw)'],
  'crossing': TEMPLATES['90° crossing'],
  'double slip': TEMPLATES['Double slip (22.5°)'],
  'cut: peg and clip': D([st(32)], { printBedX: 128, printBedY: 128, splitTrack: 'bed', joint: 'lego' }),
  'cut: dovetail': D([st(32)], { printBedX: 128, printBedY: 128, splitTrack: 'bed', joint: 'dovetail' }),
  'cut: axle holes': cut('axle', { axleStuds: 4 }),
  'seat for bought track': TEMPLATES['Test print 5: seat for a LEGO curve'],
  'raised track on pillars and a beam': D([st(32, { monoHeight: 9 })], { splitTrack: 'lengths' }),
  'monorail with supports': D([st(16, { system: 'monorail' })], { monoSupportStuds: 8 }),
  'monorail points, right': TEMPLATES['Monorail points right (as LEGO\'s)'],
  'monorail points, left': TEMPLATES['Monorail points left (as LEGO\'s)'],
  'test-print coupon: fits': TEMPLATES['Test print 1: stud and anti-stud fits'],
};

/** What isn't put right yet, by design and part (its file's name part): where it is (x, y over the bed, z up from its bottom, mm) and how much. */
export interface Pin { hang?: { area: number; where: string }; islands?: { count: number; where: string; area: number }; why: string }
/**
 * Found 2026-11-10 by looking at each design as the test does (with the app's own defaults). Nearly all of it is one thing: the hollow
 * underside's roof (z 2.0 from the part's bottom, over the anti-stud tubes) has stretches with nothing under them that a
 * bridge (10 mm across) can't span, and a little more at z 2.4 and 3.5 (sleepers' undersides). A pillar's beam hangs over the
 * whole way between its pillars (z 22.4) and its feet's undersides (z 1.8) are flat. Islands: a few mm2 (listed below), not yet
 * looked into. where: x, y over the bed and z up from the part's bottom, mm (the box the unheld bits lie in). area: the most
 * hanging, mm2 (found, rounded up); the test allows 10% over. Fix one and take it off the list: the test says when to.
 */
export const PINNED: Record<string, Record<string, Pin>> = {
  'plain track on sleepers (straight and curve)': {
    'track1': { hang: { area: 62, where: '-23.0..23.0 -67.5..67.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
    'track2': { hang: { area: 63, where: '-58.4..40.4 -70.5..66.8 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 8 at 2.0' },
    'track3': { hang: { area: 114, where: '-37.1..36.0 -31.5..31.6 2.0..3.5' }, why: 'unheld by height (mm2 at z): 50 at 2.0, 34 at 2.4, 29 at 3.5' },
    'track4': { hang: { area: 119, where: '-31.0..35.1 -46.9..44.1 2.0..9.5' }, why: 'unheld by height (mm2 at z): 63 at 2.0, 29 at 2.4, 25 at 3.5' },
  },
  'plain track on ballast': {
    'track1': { hang: { area: 3220, where: '-71.0..81.6 -70.5..67.1 2.0..6.7' }, islands: { count: 1, area: 2.75, where: '7.9..7.9 48.0..48.0 2.1..2.1' }, why: 'unheld by height (mm2 at z): 3168 at 2.0, 52 at 6.7' },
    'track2': { hang: { area: 1933, where: '-41.9..42.5 -46.9..44.1 2.0..12.8' }, why: 'unheld by height (mm2 at z): 1906 at 2.0, 25 at 6.7, 0 at 12.8' },
  },
  'switch: blades on top, lever built in': {
    'switch-base1': { hang: { area: 1321, where: '-41.0..46.4 -57.6..60.4 2.0..3.5' }, why: 'unheld by height (mm2 at z): 1212 at 2.0, 58 at 3.5, 50 at 2.4' },
    'switch-base2': { hang: { area: 1073, where: '-79.0..77.6 -85.0..78.8 2.0..3.5' }, why: 'unheld by height (mm2 at z): 950 at 2.0, 64 at 3.5, 58 at 2.4' },
  },
  'switch: blades on top, lever on a bracket': {
    'switch-base1': { hang: { area: 1314, where: '-49.0..54.4 -57.6..60.4 2.0..3.5' }, why: 'unheld by height (mm2 at z): 1205 at 2.0, 58 at 3.5, 50 at 2.4' },
    'switch-base2': { hang: { area: 1073, where: '-79.0..77.6 -85.0..78.8 2.0..3.5' }, why: 'unheld by height (mm2 at z): 950 at 2.0, 64 at 3.5, 58 at 2.4' },
  },
  'switch: blades on top, switch stand': {
    'switch-base1': { hang: { area: 1314, where: '-45.0..50.4 -57.6..60.4 2.0..3.5' }, why: 'unheld by height (mm2 at z): 1205 at 2.0, 58 at 3.5, 50 at 2.4' },
    'switch-base2': { hang: { area: 1073, where: '-79.0..77.6 -85.0..78.8 2.0..3.5' }, why: 'unheld by height (mm2 at z): 950 at 2.0, 64 at 3.5, 58 at 2.4' },
  },
  'switch: blades on top, nail switch': {
    'switch-base1': { hang: { area: 1304, where: '-33.0..41.9 -57.6..60.4 2.0..3.5' }, why: 'unheld by height (mm2 at z): 1195 at 2.0, 58 at 3.5, 50 at 2.4' },
    'switch-base2': { hang: { area: 1073, where: '-79.0..77.6 -85.0..78.8 2.0..3.5' }, why: 'unheld by height (mm2 at z): 950 at 2.0, 64 at 3.5, 58 at 2.4' },
  },
  'switch: blades on top, snap clamp, rigid blades': {
    'switch-base1': { hang: { area: 1408, where: '-41.0..33.9 -57.6..60.4 2.0..6.0' }, why: 'unheld by height (mm2 at z): 1299 at 2.0, 58 at 3.5, 50 at 2.4' },
    'switch-base2': { hang: { area: 1073, where: '-79.0..77.6 -85.0..78.8 2.0..3.5' }, why: 'unheld by height (mm2 at z): 950 at 2.0, 64 at 3.5, 58 at 2.4' },
  },
  'switch: under the bed, on spring tines': {
    'switch-base1': { hang: { area: 1735, where: '-41.0..48.3 -57.6..60.4 2.0..3.9' }, why: 'unheld by height (mm2 at z): 1290 at 2.0, 336 at 3.9, 58 at 3.5' },
    'switch-base2': { hang: { area: 1073, where: '-79.0..77.6 -85.0..78.8 2.0..3.5' }, why: 'unheld by height (mm2 at z): 950 at 2.0, 64 at 3.5, 58 at 2.4' },
    'switch-throw': { hang: { area: 3, where: '-19.8..-18.9 0.9..2.7 0.6..0.6' }, why: 'unheld by height (mm2 at z): 3 at 0.6' },
  },
  'three-way, one lever': {
    'switch-base': { hang: { area: 2469, where: '-87.3..89.1 -121.7..118.7 2.0..5.4' }, why: 'unheld by height (mm2 at z): 2368 at 2.0, 52 at 3.5, 47 at 2.4' },
  },
  'crossing': {
    'track1': { hang: { area: 733, where: '-67.2..67.5 -67.5..67.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 623 at 2.0, 59 at 2.4, 50 at 3.5' },
  },
  'cut: peg and clip': {
    'track1': { hang: { area: 62, where: '-23.0..23.0 -47.5..47.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
    'track2': { hang: { area: 62, where: '-23.0..23.0 -43.5..43.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
    'track3': { hang: { area: 62, where: '-23.0..23.0 -47.5..47.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
  },
  'cut: dovetail': {
    'track1': { hang: { area: 62, where: '-23.0..23.0 -47.5..47.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
    'track2': { hang: { area: 62, where: '-23.0..23.0 -43.5..43.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
    'track3': { hang: { area: 62, where: '-23.0..23.0 -47.5..47.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
  },
  'cut: axle holes': {
    'track1': { hang: { area: 1322, where: '-36.6..36.6 -47.5..47.2 2.0..9.9' }, why: 'unheld by height (mm2 at z): 1276 at 2.0, 25 at 9.9, 21 at 8.8' },
    'track2': { hang: { area: 1149, where: '-36.6..36.6 -43.5..43.2 2.0..9.9' }, why: 'unheld by height (mm2 at z): 1103 at 2.0, 25 at 9.9, 21 at 8.8' },
    'track3': { hang: { area: 1351, where: '-36.6..36.6 -47.5..47.2 2.0..9.9' }, why: 'unheld by height (mm2 at z): 1305 at 2.0, 25 at 9.9, 21 at 8.8' },
  },
  'seat for bought track': {
    'track2-ballast': { hang: { area: 3184, where: '-50.2..48.8 -66.2..65.3 2.0..2.0' }, why: 'unheld by height (mm2 at z): 3184 at 2.0' },
  },
  'raised track on pillars and a beam': {
    'track1': { hang: { area: 62, where: '-23.0..23.0 -67.5..67.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
    'track2': { hang: { area: 62, where: '-23.0..23.0 -67.5..67.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
    'track-support1': { hang: { area: 2400, where: '-56.6..56.6 -11.8..11.8 1.8..22.4' }, why: 'unheld by height (mm2 at z): 1258 at 1.8, 1141 at 22.4' },
    'track-support2': { hang: { area: 2400, where: '-56.6..56.6 -11.8..11.8 1.8..22.4' }, why: 'unheld by height (mm2 at z): 1258 at 1.8, 1141 at 22.4' },
    'track-support3': { hang: { area: 2400, where: '-56.6..56.6 -11.8..11.8 1.8..22.4' }, why: 'unheld by height (mm2 at z): 1258 at 1.8, 1141 at 22.4' },
  },
  // (the points' base has the plain track's three ends: the same as monorail-A's two, below)
  'monorail points, right': { 'monorail-points-base': { hang: { area: 33, where: '-125.7..125.7 -54.5..50.6 3.6..4.0' }, why: 'its three ends, as the plain beam\'s: unheld by height (mm2 at z): 12 at 3.6, 9 at 3.7, 5 at 3.8' } },
  'monorail points, left': { 'monorail-points-base': { hang: { area: 31, where: '-54.9..54.6 -125.0..125.0 3.6..7.6' }, why: 'its three ends, as the plain beam\'s: unheld by height (mm2 at z): 10 at 3.6, 9 at 3.7, 5 at 3.9' } },
  'monorail with supports': {
    'monorail-A': { hang: { area: 28, where: '-14.4..14.4 -61.3..61.3 3.6..4.0' }, why: 'unheld by height (mm2 at z): 10 at 3.6, 8 at 3.7, 5 at 3.9' },
    'monorail-support1': { hang: { area: 48, where: '-4.0..4.0 -3.6..3.6 22.0..40.7' }, why: 'unheld by height (mm2 at z): 43 at 40.7, 2 at 22.1, 1 at 22.0' },
    'monorail-support2': { hang: { area: 48, where: '-4.0..4.0 -3.6..3.6 22.0..40.7' }, why: 'unheld by height (mm2 at z): 43 at 40.7, 2 at 22.1, 1 at 22.0' },
    'monorail-support3': { hang: { area: 48, where: '-4.0..4.0 -3.6..3.6 22.0..40.7' }, why: 'unheld by height (mm2 at z): 43 at 40.7, 2 at 22.1, 1 at 22.0' },
  },
  'test-print coupon: fits': {
    'fit1-stud0.08-tube0.16-track1': { hang: { area: 62, where: '-23.2..22.7 -11.4..11.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
    'fit2-stud0.13-tube0.11-track1': { hang: { area: 62, where: '-23.2..22.7 -11.4..11.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
    'fit3-stud0.18-tube0.06-track1': { hang: { area: 62, where: '-23.2..22.7 -11.4..11.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
    'fit4-stud0.23-tube0.01-track1': { hang: { area: 62, where: '-23.2..22.7 -11.4..11.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
    'fit5-stud0.28-tube-0.04-track1': { hang: { area: 62, where: '-23.2..22.7 -11.4..11.2 2.0..3.5' }, why: 'unheld by height (mm2 at z): 29 at 2.4, 25 at 3.5, 7 at 2.0' },
  },
  'double slip': {
    'track1': { hang: { area: 1657, where: '-74.3..78.6 -87.2..82.6 2.0..21.5' }, islands: { count: 2, area: 1.23, where: '-28.0..62.7 -83.6..-58.3 21.5..21.5' }, why: 'unheld by height (mm2 at z): 1550 at 2.0, 43 at 6.0, 29 at 2.4' },
    'track2': { hang: { area: 1988, where: '-78.4..73.9 -82.3..89.2 2.0..21.5' }, islands: { count: 2, area: 1.23, where: '-55.2..27.1 56.4..81.7 21.5..21.5' }, why: 'unheld by height (mm2 at z): 1879 at 2.0, 40 at 6.0, 32 at 2.4' },
  },

};

/** The part's findings: its hanging area (mm2, and where) and its islands. */
export interface Found { part: string; hang: number; hangAt: string; hangByHeight: string; islands: number; islandArea: number; islandAt: string }
export function lookAt(w: Awaited<ReturnType<typeof kernel>>, p: Piece): Found | undefined {
  if (p.lego || !p.stl.length) return undefined;
  const m = stlSolid(w, p.stl);
  if (!m) return { part: p.name, hang: Infinity, hangAt: 'not a closed solid', hangByHeight: '', islands: 0, islandArea: 0, islandAt: '' };
  const h = hangingAt(w, m), isl = islandsOf(w, m);
  const hs = [...h.byHeight].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([z, a]) => `${a.toFixed(0)} mm2 at z ${z}`).join(', ');
  const ix = isl.map((i) => i.x), iy = isl.map((i) => i.y), iz = isl.map((i) => i.z);
  const r = (v: number[]) => (v.length ? `${Math.min(...v).toFixed(1)}..${Math.max(...v).toFixed(1)}` : '');
  return { part: p.name, hang: h.area, hangAt: boxText(h.where), hangByHeight: hs, islands: isl.length, islandArea: isl.reduce((t, i) => t + i.area, 0), islandAt: isl.length ? `${r(ix)} ${r(iy)} ${r(iz)}` : '' };
}

/** A design built as the app builds it, every printed part looked at, and what's found held to what's pinned. */
export function printsClean(name: string) {
  it(`${name}: every printed part, as exported, hangs nowhere and has no floating island (but what's pinned)`, { timeout: 900000 }, async () => {
    const saved = { ...OPTION_DEFAULTS };
    Object.assign(OPTION_DEFAULTS, APP);
    try {
      const w = await kernel();
      clearBuildCache();
      const b = buildDesign(w, structuredClone(DESIGNS[name]));
      // (its pieces are plain data: the build's own solids let go before the looking makes its own)
      clearBuildCache();
      const found = b.pieces.flatMap((p) => arena(w, () => [lookAt(w, p)], () => [])).filter((f): f is Found => !!f);
      expect(found.length, `${name}: no printed part`).toBeGreaterThan(0);
      const pins = PINNED[name] ?? {}, bad: string[] = [];
      for (const f of found) {
        const pin = pins[f.part];
        if (f.hang > HANG) {
          if (!pin?.hang) bad.push(`${f.part} hangs ${f.hang.toFixed(1)} mm2 (${f.hangAt}; ${f.hangByHeight})`);
          else if (f.hang > pin.hang.area * 1.1 + 1) bad.push(`${f.part} hangs ${f.hang.toFixed(1)} mm2, more than the ${pin.hang.area} pinned (${f.hangAt}; ${f.hangByHeight})`);
        } else if (pin?.hang) bad.push(`${f.part} no longer hangs (${f.hang.toFixed(1)} mm2): take its pin off the list`);
        if (f.islands > 0) {
          if (!pin?.islands) bad.push(`${f.part} has ${f.islands} floating islands, ${f.islandArea.toFixed(2)} mm2 (x y z ${f.islandAt})`);
          else if (f.islands > pin.islands.count) bad.push(`${f.part} has ${f.islands} floating islands, more than the ${pin.islands.count} pinned (x y z ${f.islandAt})`);
        } else if (pin?.islands) bad.push(`${f.part} no longer has floating islands: take its pin off the list`);
      }
      for (const part of Object.keys(pins)) if (!found.some((f) => f.part === part)) bad.push(`${part} is pinned but isn't built any more`);
      expect(bad.join('; ')).toBe('');
    } finally { Object.assign(OPTION_DEFAULTS, saved); clearBuildCache(); }
  });
}
