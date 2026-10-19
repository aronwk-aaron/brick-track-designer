// Clash checks for a switch's moving parts (the OpenSCAD intersection suite,
// ported): how much each pair of parts overlaps, in each position.
// Usage: tsx scripts/clash.ts [config filter]
import { readFileSync } from 'node:fs';
import { kernel } from '../src/geom/kernel';
import { Scad, R, T } from '../src/geom/scad';
import type { Route, Segment } from '../src/route/route';
import { BASE_DEFAULTS, switchGeometry, switchPlan, type SetSpec } from '../src/switch/base';

export async function clashes(routes: Route[], sets: SetSpec[], defaultThrowDir: number, pointsPieces: 1 | 2 = 1) {
  const w = await kernel(), s = new Scad(w);
  const plan = switchPlan(routes, sets, { ...BASE_DEFAULTS, pointsPieces }, defaultThrowDir);
  const gm = switchGeometry(s, plan), base = gm.base(), g = plan.g;
  const out: Record<string, number> = {};
  sets.forEach((_, k) => {
    const v = plan.sets[k];
    const rotZ = (m: ReturnType<typeof base.translate>, a: number, pv: number[]) => T(R(T(m, [-pv[0], -pv[1], 0]), [0, 0, a]), [pv[0], pv[1], 0]);
    const parts = gm.pointsParts(k), us = gm.pointsUnits(k), thr = gm.throwPart(k), lev = gm.leverPart(k);
    // the points (all their parts) for the right-hand route, and turned for the left-hand one
    const pts = w.Manifold.union(parts), ptsL = w.Manifold.union(parts.map((m, i) => rotZ(m, us[i].swing, us[i].pivot)));
    if (parts.length > 1) {
      out[`points part x part, right${''}`] = parts[0].intersect(parts[1]).volume();
      out[`points part x part, left${''}`] = rotZ(parts[0], us[0].swing, us[0].pivot).intersect(rotZ(parts[1], us[1].swing, us[1].pivot)).volume();
    }
    const leverAt = (a: number) => T(R(gm.leverShape(), [0, a, 0]), [v.leverX, v.throwY, g.leverPz]);
    const vol = (a: typeof base, b: typeof base) => a.intersect(b).volume();
    const sfx = sets.length > 1 ? ` (set ${k})` : '';
    out[`base x points, right${sfx}`] = vol(base, pts);
    out[`base x points, left${sfx}`] = vol(base, ptsL);
    out[`base x throw, right${sfx}`] = vol(base, thr);
    out[`base x throw, left${sfx}`] = vol(base, T(thr, [v.leverTravel, 0, 0]));
    out[`points x throw${sfx}`] = vol(pts, thr);
    out[`points x throw, left${sfx}`] = vol(ptsL, T(thr, [v.leverTravel, 0, 0]));
    if ((plan.sets[k] as { three?: unknown }).three) {
      // a three-way's middle position (straight): blade 0 closed, blade 1 closed, the slider half way
      const half = v.leverTravel / 2, ptsS = w.Manifold.union([parts[0], rotZ(parts[1], us[1].swing, us[1].pivot)]);
      out[`base x points, straight${sfx}`] = vol(base, ptsS);
      out[`base x throw, straight${sfx}`] = vol(base, T(thr, [half, 0, 0]));
      out[`points x throw, straight${sfx}`] = vol(ptsS, T(thr, [half, 0, 0]));
      out[`points part x part, straight${sfx}`] = parts[0].intersect(rotZ(parts[1], us[1].swing, us[1].pivot)).volume();
    }
    out[`base x lever, right${sfx}`] = vol(base, lev);
    out[`base x lever, middle${sfx}`] = vol(base, leverAt(0));
    out[`base x lever, left${sfx}`] = vol(base, leverAt(-v.leverAng));
    out[`throw x lever, right${sfx}`] = vol(thr, lev);
    out[`throw x lever, left${sfx}`] = vol(T(thr, [v.leverTravel, 0, 0]), leverAt(-v.leverAng));
    // the catches: points dropped 0.5 still hang on the top; slider dropped 0.8 held by the lever's tip
    out[`catch: points dropped 0.5 x base${sfx}`] = vol(base, T(pts, [0, 0, -0.5]));
    out[`catch: throw dropped 0.8 x lever${sfx}`] = vol(T(thr, [0, 0, -0.8]), lev);
  });
  return out;
}

if (process.argv[1]?.endsWith('clash.ts')) {
  const lines = readFileSync('test/fixtures/switch-sets.txt', 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('CFG ')) continue;
    const name = lines[i].split(' ')[1];
    if (process.argv[2] && !name.includes(process.argv[2])) continue;
    const routes = (JSON.parse(lines[i + 1].slice(7)) as (['S', number] | ['A', number, number])[][]).map((segs, k): Route => ({ id: String(k), start: [0, 0, 0],
      segments: segs.map((sg): Segment => (sg[0] === 'S' ? { kind: 'straight', length: sg[1] } : { kind: 'arc', radius: sg[1], angle: sg[2] })) }));
    const r = await clashes(routes, JSON.parse(lines[i + 2].slice(5)) as SetSpec[], name.startsWith('right') ? -1 : 1, Number(process.env.PIECES ?? 1) as 1 | 2);
    console.log(name, Object.entries(r).filter(([, v]) => v > 1e-4).map(([k, v]) => `${k}: ${v.toFixed(3)}`).join('; ') || 'no contacts');
  }
}
