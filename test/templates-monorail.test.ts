// The monorail trackwork builds (templates.shared.ts), and each template's route ends are where the reference part's are
// (ends measured off the reference meshes and LDraw's parts: studs on and across from the start, and the turn). Where the
// reference and the app disagree it's listed in DIFFERS below, not bent to fit.
import { describe, expect, it } from 'vitest';
import { STUD, TEMPLATES, toRoutes } from '../src/app/design';
import { routeLength, routePose } from '../src/route/route';
import { MONO_CURVES_45, MONO_DIAGONALS, MONO_QUARTERS, MONO_STRAIGHTS } from '../src/app/templates-monorail';
import { templatesBuild } from './templates.shared';

describe('templates: monorail trackwork', { timeout: 600000 }, () => templatesBuild(['Monorail trackwork']));

/** Where a route's far end is from its start, studs: on (along the start heading), left (across, + to the left), and the turn (degrees, + left). */
function endOf(name: string, route = 0) {
  const rt = toRoutes(TEMPLATES[name])[route], [x0, y0, h0] = rt.start, [x1, y1, h1] = routePose(rt, routeLength(rt));
  const c = Math.cos((h0 * Math.PI) / 180), s = Math.sin((h0 * Math.PI) / 180), dx = (x1 - x0) / STUD, dy = (y1 - y0) / STUD;
  return { on: dx * -s + dy * c, left: -(dx * c + dy * s), turn: h1 - h0, rt };
}
type End = { on: number; left: number; turn: number };
const REF: Record<string, End> = {};
for (const n of MONO_STRAIGHTS) REF[`Monorail straight, ${n} stud${n === 1 ? '' : 's'}`] = { on: n, left: 0, turn: 0 };
// (a diagonal: n studs over and n on, at 45 degrees: along its own heading that is n times root 2)
for (const n of MONO_DIAGONALS) REF[`Monorail diagonal straight, ${n} studs over`] = { on: n * Math.SQRT2, left: 0, turn: 0 };
for (const r of MONO_QUARTERS) REF[`Monorail quarter curve R${r}`] = { on: r, left: r, turn: 90 };
for (const [r, c] of Object.entries(MONO_CURVES_45)) for (const [hand, sg] of [['left', 1], ['right', -1]] as const) REF[`Monorail curve ${r} ${hand} (45°)`] = { on: c.on, left: sg * c.over, turn: sg * 45 };
for (const [hand, sg] of [['left', 1], ['right', -1]] as const) REF[`Monorail S-curve ${hand} (8 studs over)`] = { on: 32, left: sg * 8, turn: 0 };

/**
 * Where the app and the reference part disagree, studs: the template stands with the app's ends and the test checks them
 * against these instead. (The R20 curve's rack has 2.8 studs straight at each end with about R17 between, measured to
 * (20.0, 20.1): the app's is a plain arc, so its ends are exactly (20, 20).)
 */
const DIFFERS: Record<string, string> = {
  'Monorail quarter curve R20': 'the reference R20 measures (20.0, 20.1): a rack with straight ends and about R17 between; the app\'s is a plain R20 arc',
};

describe('monorail trackwork: route ends match the reference parts', () => {
  for (const [name, want] of Object.entries(REF)) it(name, () => {
    const got = endOf(name);
    expect(Math.abs(got.on - want.on), `${name}: on`).toBeLessThan(0.05);
    expect(Math.abs(got.left - want.left), `${name}: across`).toBeLessThan(0.05);
    expect(Math.abs(got.turn - want.turn), `${name}: turn`).toBeLessThan(0.1);
    // (one route, starting at the origin, as the reference's start is)
    expect(TEMPLATES[name].routes.length).toBe(1);
    expect(got.rt.start.map((v) => Math.abs(v))[0] + Math.abs(got.rt.start[1])).toBe(0);
  });
  it('the differences are all named templates', () => {
    for (const n of Object.keys(DIFFERS)) expect(n in REF).toBe(true);
  });

  /** crossings: each beam's two ends are the reference's arms, 4 studs each way from the middle (the middle is the origin) */
  for (const [name, arm] of [['Monorail crossing, 90°', 4]] as const) it(name, () => {
    const d = TEMPLATES[name];
    const mids: number[][] = [];
    d.routes.forEach((_, k) => {
      const rt = toRoutes(d)[k], L = routeLength(rt) / STUD, mid = routePose(rt, routeLength(rt) / 2);
      expect(Math.abs(L - 2 * arm), `${name}: beam ${k} length`).toBeLessThan(0.05);
      mids.push(mid);
    });
    // (the beams' middles are the same point: the crossing)
    expect(Math.hypot(mids[0][0] - mids[1][0], mids[0][1] - mids[1][1]) / STUD, `${name}: beams cross at their middles`).toBeLessThan(0.05);
    // the beams cross square (90 degrees apart)
    const h = toRoutes(d).map((r) => r.start[2]);
    expect(Math.abs(((h[1] - h[0]) % 180 + 180) % 180 - 90)).toBeLessThan(0.1);
  });
  for (const [name, hand] of [['Monorail crossing, 45° left', 1], ['Monorail crossing, 45° right', -1]] as const) it(name, () => {
    // (a through track 24 studs long and a diagonal 16 studs over and on across its middle, 45 degrees to it)
    const through = endOf(name, 0), diag = endOf(name, 1);
    expect(Math.abs(through.on - 24)).toBeLessThan(0.05);
    expect(Math.abs(diag.on - 16 * Math.SQRT2)).toBeLessThan(0.05);
    const h0 = toRoutes(TEMPLATES[name])[0].start[2], h1 = toRoutes(TEMPLATES[name])[1].start[2];
    expect(Math.abs(Math.abs(h1 - h0 + 360) % 180 - 45) < 0.1 || Math.abs(Math.abs(h1 - h0 + 360) % 180 - 135) < 0.1, `${name}: ${hand}`).toBe(true);
  });

  /** points (LEGO's 2889 / 2890): 32 studs straight; the branch ends 20 on and 8 across, turned 45 degrees */
  for (const [name, sg] of [['Monorail points left (as LEGO\'s)', 1], ['Monorail points right (as LEGO\'s)', -1]] as const) it(name, () => {
    const main = endOf(name, 0), br = endOf(name, 1);
    expect(Math.abs(main.on - 32) + Math.abs(main.left) + Math.abs(main.turn)).toBeLessThan(0.05);
    expect(Math.abs(br.on - 20), 'branch on').toBeLessThan(0.05);
    expect(Math.abs(br.left - sg * 8), 'branch across').toBeLessThan(0.05);
    expect(Math.abs(br.turn - sg * 45), 'branch turn').toBeLessThan(0.1);
  });
  /** the ramp: 64 studs long between the level approaches, 30 plates (10 bricks) up */
  it('Monorail ramp (as LEGO\'s)', () => {
    const d = TEMPLATES['Monorail ramp (as LEGO\'s)'], r = d.routes[1];
    expect(r.segs).toEqual([{ kind: 'straight', studs: 64 }]);
    expect((r.monoHeightEnd ?? 0) - (r.monoHeight ?? 0)).toBe(30);
  });
  it('Monorail ramp, 5 bricks up', () => {
    const r = TEMPLATES['Monorail ramp, 5 bricks up'].routes[0];
    expect(r.segs).toEqual([{ kind: 'straight', studs: 48 }]);
    expect((r.monoHeightEnd ?? 0) - (r.monoHeight ?? 0)).toBe(15);
  });
});

/**
 * Not templates, and why (the app can't build them, or they fail a check for a reason in the geometry code):
 *  - the wider points (R44, the 8-stud parallel one, the Y, the three-way): planSwitch builds LEGO's points only;
 *  - the turning crossings: the app's crossing is fixed, its racks cut back;
 *  - the diagonal 90 degree crossing: the arms' stubs run into the crossing piece (assembly check), and every crossing
 *    arm is longer than 4 studs from the middle (monobuild.ts), so the 8-stud crossing has stubs on its beams;
 *  - the ramp's halves singly, the straight ramp extensions: a route's height always eases level to level;
 *  - the tile track: no low beam form; the start-stop track; the diagonal switch adapters (they adapt LEGO's stepped
 *    45 degree end, which the app doesn't make); the skytrail (no rack);
 *  - the one-stud straight's side studs (past the piece's other end on an 8 mm piece): Mono.piece, geometry code.
 */
