// The complex designs the robustness tests build (test/fixtures/complex/*.json):
// ladders, double crossovers at several radii, three-ways alone and in
// networks, wyes in networks, switches on curves, tandems, crossovers
// between curves, routes drawn backwards; with and without ballast, on a
// small bed, on baseplates.
// npx tsx scripts/complex-fixtures.mts
import { writeFileSync, mkdirSync } from 'node:fs';
import { type Design, type DRoute, type DSeg, endOf, toRoutes } from '../src/app/design';
import { routeLength, routePose } from '../src/route/route';

const OUT = new URL('../test/fixtures/complex/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const st = (studs: number): DSeg => ({ kind: 'straight', studs: r6(studs) });
const cv = (radius: number, angle: number): DSeg => ({ kind: 'curve', radius, angle: r6(angle) });
const rt = (name: string, x: number, y: number, heading: number, segs: DSeg[], more: Partial<DRoute> = {}): DRoute => ({ name, x: r6(x), y: r6(y), heading: r6(heading), segs, ...more });
const design = (name: string, routes: DRoute[], options: Design['options'] = {}, more: Partial<Design> = {}): Design => ({ version: 1, gaugeStuds: 4, name, routes, options, ...more });
/** A route drawn the other way: from its end, turned round, its segments reversed (curves turning the other way). */
const rev = (r: DRoute, name = r.name): DRoute => {
  const e = endOf({ version: 1, gaugeStuds: 4, routes: [r] }, 0);
  return { ...r, name, x: e.x, y: e.y, heading: r6(((e.heading + 360) % 360) - 180), segs: [...r.segs].reverse().map((sg) => (sg.kind === 'straight' ? { ...sg } : { ...sg, angle: -sg.angle })) };
};
/** The S-curve angle that moves a track over by off studs with two arcs of radius R. */
const sAng = (R: number, off = 16) => deg(Math.acos(1 - off / 2 / R));
/** An S-curve from (x, y) heading up, over by off studs (+ = right). */
const sCurve = (name: string, x: number, y: number, R: number, off = 16) => { const a = sAng(R, Math.abs(off)) * Math.sign(off); return rt(name, x, y, 0, [cv(R, -a), cv(R, a)]); };
const sLen = (R: number, off = 16) => 2 * R * Math.sin(rad(sAng(R, off)));

const save = (d: Design) => { writeFileSync(`${OUT}${d.name}.json`, JSON.stringify(d, null, 1) + '\n'); console.log(d.name); };

// ---- double crossovers (scissors) at several radii: two S-curves crossing in the middle ----
for (const R of [40, 56, 72, 104, 200]) {
  const L = sLen(R), y0 = 16, len = Math.ceil(L + 32);
  save(design(`scissors-r${R}`, [
    rt('A', 0, 0, 0, [st(len)]), rt('B', 16, 0, 0, [st(len)]),
    sCurve('AB', 0, y0, R, 16), sCurve('BA', 16, y0, R, -16),
  ]));
}
// the R56 one on ballast with its buddy layer, and on a small bed on baseplates
{
  const R = 56, L = sLen(R), len = Math.ceil(L + 32);
  const rs = [rt('A', 0, 0, 0, [st(len)]), rt('B', 16, 0, 0, [st(len)]), sCurve('AB', 0, 16, R, 16), sCurve('BA', 16, 16, R, -16)];
  save(design('scissors-r56-buddy', rs, { ballast: 'buddy' }));
  save(design('scissors-r56-128-plates', rs, { ballast: 'buddy', printBedX: 128, printBedY: 128, baseplate: 32 }));
  // drawn the other way: both crossovers from their far ends, one main track backwards
  save(design('scissors-r56-reversed', [rt('A', 0, 0, 0, [st(len)]), rev(rt('B', 16, 0, 0, [st(len)])), rev(sCurve('AB', 0, 16, R, 16)), rev(sCurve('BA', 16, 16, R, -16))]));
}

// ---- a ladder: a diagonal off the main line, yard tracks leaving it one after another ----
{
  const R = 40, a = 22.5, dx = 2 * R * (1 - Math.cos(rad(a))), dy = R * Math.sin(rad(a));
  const sx = Math.sin(rad(a)), cy = Math.cos(rad(a));
  const yard = [1, 2, 3].map((k) => (16 * k - dx) / sx); // (where along the diagonal's straight each yard track leaves)
  const diagLen = yard[2] + 8;
  const diag = rt('Ladder', 0, 0, 0, [cv(R, -a), st(diagLen)]);
  const x0 = dx / 2, y0 = dy;
  const tracks = yard.map((s, k) => rt(`Y${k + 1}`, x0 + s * sx, y0 + s * cy, -a, [cv(R, a), st(40 - k * 8)]));
  const main = rt('Main', 0, -8, 0, [st(48 + y0 + diagLen * cy)]);
  save(design('ladder-r40', [main, diag, ...tracks]));
  save(design('ladder-r40-reversed', [rev(main), diag, ...tracks.map((t, k) => (k % 2 ? rev(t) : t))]));
  save(design('ladder-r40-buddy-128', [main, diag, ...tracks], { ballast: 'buddy', printBedX: 128, printBedY: 128 }));
}

// ---- three-ways ----
for (const R of [56, 104]) {
  const a = 22.5;
  save(design(`threeway-r${R}`, [rt('S', 0, 0, 0, [st(48)]), rt('L', 0, 0, 0, [cv(R, a), st(16)]), rt('R', 0, 0, 0, [cv(R, -a), st(16)])]));
}
{
  // in a network: the middle track's branches split off together into the outer tracks, and two more merge back into it
  const R = 104, L = sLen(R), len = Math.ceil(2 * L + 48);
  const lr = [rt('L', 0, 0, 0, [st(len)]), rt('M', 16, 0, 0, [st(len)]), rt('R', 32, 0, 0, [st(len)])];
  const y1 = 8, y2 = y1 + L + 16;
  const split = [sCurve('ML', 16, y1, R, -16), sCurve('MR', 16, y1, R, 16)];
  const merge = [sCurve('LM', 0, y2, R, 16), sCurve('RM', 32, y2, R, -16)];
  save(design('threeway-net-split-merge', [...lr, ...split, ...merge]));
  save(design('threeway-net-split-merge-buddy', [...lr, ...split, ...merge], { ballast: 'buddy' }));
  // the merging three-way drawn from the middle track (branches heading back towards the outer tracks)
  save(design('threeway-net-reversed', [...lr, ...split, ...merge.map((m) => rev(m))]));
}
{
  // a three-way off a track whose branches cross the tracks either side
  const R = 56, a = sAng(R, 32);
  save(design('threeway-crossing', [
    rt('L', 0, 0, 0, [st(96)]), rt('M', 16, 0, 0, [st(96)]), rt('R', 32, 0, 0, [st(96)]),
    rt('MLL', 16, 8, 0, [cv(R, a), cv(R, -a), st(8)]), rt('MRR', 16, 8, 0, [cv(R, -a), cv(R, a), st(8)]),
  ]));
}

// ---- wyes in networks ----
{
  // a wye off one track into two, 16 apart, with a crossover between them, and a wye merging them back
  const R = 72, a = sAng(R, 8), L = sLen(R, 8), L2 = sLen(R, 16);
  const yA = 0, yB = yA + L, yX = yB + 8, yC = yX + L2 + 8;
  save(design('wye-loop-crossover', [
    rt('In', 8, yA - 16, 0, [st(16)]),
    rt('WL', 8, yA, 0, [cv(R, a), cv(R, -a), st(yC - yB)]), rt('WR', 8, yA, 0, [cv(R, -a), cv(R, a), st(yC - yB)]),
    sCurve('X', 0, yX, R, 16),
    rt('ML', 0, yC, 0, [cv(R, -a), cv(R, a)]), rt('MR', 16, yC, 0, [cv(R, a), cv(R, -a)]),
    rt('Out', 8, yC + L, 0, [st(16)]),
  ]));
}
{
  // a wye whose branches each cross another track
  const R = 56, a = 30;
  save(design('wye-crossing', [
    rt('Wye-L', 0, 0, 0, [cv(R, a), st(24)]), rt('Wye-R', 0, 0, 0, [cv(R, -a), st(24)]),
    rt('Cross', -40, 40, -90, [st(80)]),
  ]));
}

// ---- switches on curves ----
{
  // an inside branch off an R104 curve (tighter, R56), and an outside one (straight on)
  save(design('curve-switches', [
    rt('Curve', 0, 0, 0, [cv(104, 60)]),
    rt('In', -104 * (1 - Math.cos(rad(15))), 104 * Math.sin(rad(15)), 15, [cv(56, 30), st(16)]),
    rt('Out', -104 * (1 - Math.cos(rad(40))), 104 * Math.sin(rad(40)), 40, [st(32)]),
  ]));
  // a crossover between two concentric curves (R72 and R88, centre (-72, 0)): from the outer one at 10 degrees, an S of
  // R56 arcs (left then right) onto the inner one, tangent (the arcs' angles found numerically)
  const a0 = 10, Ri = 72, Ro = 88, Rx = 56, ox = -Ri + Ro * Math.cos(rad(a0)), oy = Ro * Math.sin(rad(a0));
  const endAt = (t1: number, t2: number) => { const r = toRoutes({ version: 1, gaugeStuds: 4, routes: [{ name: 'x', x: ox, y: oy, heading: a0, segs: [{ kind: 'curve', radius: Rx, angle: t1 }, { kind: 'curve', radius: Rx, angle: -t2 }] }] })[0], e = routePose(r, routeLength(r)); const dx = e[0] / 8 + Ri, dy = e[1] / 8; return [Math.hypot(dx, dy) - Ri, e[2] - deg(Math.atan2(dy, dx))]; };
  let t1 = 30, t2 = 20;
  for (let k = 0; k < 60; k++) {
    const f = endAt(t1, t2), h = 1e-4, a = endAt(t1 + h, t2), b = endAt(t1, t2 + h);
    const j = [[(a[0] - f[0]) / h, (b[0] - f[0]) / h], [(a[1] - f[1]) / h, (b[1] - f[1]) / h]], det = j[0][0] * j[1][1] - j[0][1] * j[1][0];
    t1 -= (j[1][1] * f[0] - j[0][1] * f[1]) / det; t2 -= (-j[1][0] * f[0] + j[0][0] * f[1]) / det;
  }
  const xo = rt('XO', ox, oy, a0, [cv(Rx, t1), cv(Rx, -t2)]);
  save(design('curve-crossover', [rt('Inner', 0, 0, 0, [cv(Ri, 70)]), rt('Outer', 16, 0, 0, [cv(Ro, 70)]), xo]));
}

// ---- tandems: a switch right after another ----
{
  save(design('tandem-same-side', [
    rt('Main', 0, 0, 0, [st(96)]),
    rt('B1', 0, 0, 0, [cv(40, -22.5), st(24)]),
    rt('B2', 0, 24, 0, [cv(40, -22.5), st(24)]),
  ]));
  save(design('tandem-opposite', [
    rt('Main', 0, 0, 0, [st(80)]),
    rt('B1', 0, 0, 0, [cv(56, -22.5), st(16)]),
    rt('B2', 0, 12, 0, [cv(56, 22.5), st(16)]),
  ]));
  // a switch on the branch just past the first one's frog (a cascade)
  const e = endOf({ version: 1, gaugeStuds: 4, routes: [rt('x', 0, 0, 0, [cv(40, -22.5), st(16)])] }, 0);
  save(design('cascade', [
    rt('Main', 0, 0, 0, [st(96)]),
    rt('B1', 0, 0, 0, [cv(40, -22.5), st(56)]),
    rt('B2', e.x, e.y, -22.5, [cv(40, 22.5), st(32)]),
  ]));
  // (not buildable: the second points start inside the first one's frog, the main track's rail through them)
  const e2 = endOf({ version: 1, gaugeStuds: 4, routes: [rt('x', 0, 0, 0, [cv(40, -22.5)])] }, 0);
  save(design('points-in-frog', [
    rt('Main', 0, 0, 0, [st(80)]),
    rt('B1', 0, 0, 0, [cv(40, -22.5), st(48)]),
    rt('B2', e2.x, e2.y, -22.5, [cv(40, 22.5), st(32)]),
  ]));
  // a tandem three-way in a network: its branches merge into the tracks either side
  {
    const R = 56, a = sAng(R), L = sLen(R);
    save(design('tandem-net', [
      rt('L', -16, 0, 0, [st(96)]), rt('M', 0, 0, 0, [st(96)]), rt('R', 16, 0, 0, [st(96)]),
      rt('ML', 0, 8, 0, [cv(R, a), cv(R, -a)]), rt('MR', 0, 20, 0, [cv(R, -a), cv(R, a)]),
    ]));
    void L;
  }
}

// ---- crossovers between two parallel tracks, one each way (a "universal" crossover), on baseplates ----
{
  const R = 40, a = sAng(R), L = sLen(R);
  save(design('two-crossovers-plates', [
    rt('A', 0, 0, 0, [st(L * 2 + 48)]), rt('B', 16, 0, 0, [st(L * 2 + 48)]),
    sCurve('AB', 0, 8, R, 16), rev(sCurve('BA', 16, L + 24, R, -16)),
  ], { baseplate: 48 }));
  void a;
}
