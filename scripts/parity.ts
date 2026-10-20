// Parity check: build pieces with manifold-3d here and with the OpenSCAD
// track library, and compare the meshes (volume, bounding box, symmetric
// difference). Usage: pnpm parity  (OPENSCAD_REPO defaults to
// ~/Documents/openscad; renders go through ~/.claude/scripts/safe-run.sh
// when it exists).
import { setScadParity } from '../src/geom/track';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { kernel, type Wasm } from '../src/geom/kernel';
import { railSection, sweepArc, sweepStraight } from '../src/geom/rail';
import { stlBytes } from '../src/geom/stl';
import { compare } from './colcmp';
import { setArcMode } from '../src/geom/sweep';
setArcMode('scad'); // (OpenSCAD's arc pieces, to compare mesh for mesh)
setScadParity(true); // (and its square stud sockets, and the arm's end as switch.scad's)
import { Scad } from '../src/geom/scad';
import { Track } from '../src/geom/track';
import { STRAIGHT_DEFAULTS, straightTrackOnly } from '../src/geom/straight';
import { CURVE_DEFAULTS, curveTrackOnly } from '../src/geom/curve';
import type { Route, Segment } from '../src/route/route';
import { BASE_DEFAULTS, switchBase, switchGeometry, switchPlan, type SetSpec } from '../src/switch/base';

const OUT = 'parity/out';
const REPO = process.env.OPENSCAD_REPO ?? join(homedir(), 'Documents/openscad');
const SAFE_RUN = join(homedir(), '.claude/scripts/safe-run.sh');
const OFFSETS = [-20, 20];

type Man = InstanceType<Wasm['Manifold']>;

interface Case {
  name: string;
  /** -D settings for parity/rails.scad, or OpenSCAD source of its own. */
  defines?: Record<string, string | number>;
  scad?: string;
  build: (w: Wasm) => Man;
}

const SEGMENTS = 64;
const track = (w: Wasm) => new Track(new Scad(w));
const cases: Case[] = [
  {
    name: 'endpoint-trackonly',
    scad: 'include <track_lib.scad>\nfull_endpoint(true, true);\n',
    build: (w) => track(w).fullEndpoint(true, true),
  },
  ...[8, 16, 32].map((n) => ({
    name: `straight-trackonly-S${n}`,
    scad: `include <straight.scad>\n`,
    defines: { generate_ballast: 'false', stud_grip: '"all"', length_studs: n },
    build: (w: Wasm) => straightTrackOnly(new Scad(w), { ...STRAIGHT_DEFAULTS, lengthStuds: n }),
  })),
  {
    name: 'straight-trackonly-ln2',
    scad: `include <straight.scad>\n`,
    defines: { generate_ballast: 'false', stud_grip: '"all"', gauge_studs: 2 },
    build: (w: Wasm) => straightTrackOnly(new Scad(w), { ...STRAIGHT_DEFAULTS, gaugeStuds: 2 }),
  },
  {
    name: 'straight-trackonly-ties1',
    scad: `include <straight.scad>\n`,
    defines: { generate_ballast: 'false', stud_grip: '"all"', sleeper_width_studs: 1, sleeper_gap_studs: 1, length_studs: 15 },
    build: (w: Wasm) => straightTrackOnly(new Scad(w), { ...STRAIGHT_DEFAULTS, sleeperWidthStuds: 1, sleeperGapStuds: 1, lengthStuds: 15 }),
  },
  ...([[24, 22.5001], [40, 22.5001], [104, 22.5001], [40, 90], [24, 45]] as const).map(([r, a]) => ({
    name: `curve-trackonly-R${r}-${a}`,
    scad: `include <curves.scad>\n`,
    defines: { generate_ballast: 'false', stud_grip: '"all"', Radius: r, SegAng: a },
    build: (w: Wasm) => curveTrackOnly(new Scad(w), { ...CURVE_DEFAULTS, radiusStuds: r, segAng: a }),
  })),
  {
    name: 'curve-trackonly-ln2-end',
    scad: `include <curves.scad>\n`,
    defines: { generate_ballast: 'false', stud_grip: '"all"', gauge_studs: 2, Radius: 24, SegAng: 45, antistud_grid: '"end"' },
    build: (w: Wasm) => curveTrackOnly(new Scad(w), { ...CURVE_DEFAULTS, gaugeStuds: 2, radiusStuds: 24, segAng: 45, antistudGrid: 'end' }),
  },
  {
    name: 'curve-trackonly-ln2',
    scad: `include <curves.scad>\n`,
    defines: { generate_ballast: 'false', stud_grip: '"all"', gauge_studs: 2, Radius: 24, SegAng: 45 },
    build: (w: Wasm) => curveTrackOnly(new Scad(w), { ...CURVE_DEFAULTS, gaugeStuds: 2, radiusStuds: 24, segAng: 45 }),
  },
  {
    name: 'curve-trackonly-R40-end',
    scad: `include <curves.scad>\n`,
    defines: { generate_ballast: 'false', stud_grip: '"all"', antistud_grid: '"end"' },
    build: (w: Wasm) => curveTrackOnly(new Scad(w), { ...CURVE_DEFAULTS, antistudGrid: 'end' }),
  },
  {
    name: 'endpoint-ballast',
    scad: 'include <track_lib.scad>\nfull_endpoint(false, false);\n',
    build: (w) => track(w).fullEndpoint(false, false),
  },
  {
    name: 'rails-straight-128',
    defines: { kind: '"straight"', len_mm: 128 },
    build: (w) => w.Manifold.union(OFFSETS.map((o) => sweepStraight(w, railSection(w, o), 128))),
  },
  {
    name: 'rails-arc-left-R40-22.5',
    defines: { kind: '"arc_left"', radius: 320, angle: 22.5, segments: SEGMENTS },
    build: (w) => w.Manifold.union(OFFSETS.map((o) => sweepArc(w, railSection(w, o), 320, 22.5, SEGMENTS))),
  },
  {
    name: 'rails-arc-right-R40-22.5',
    defines: { kind: '"arc_right"', radius: 320, angle: 22.5, segments: SEGMENTS },
    build: (w) => w.Manifold.union(OFFSETS.map((o) => sweepArc(w, railSection(w, o), 320, -22.5, SEGMENTS))),
  },
  {
    name: 'rails-arc-left-R24-90',
    defines: { kind: '"arc_left"', radius: 192, angle: 90, segments: SEGMENTS },
    build: (w) => w.Manifold.union(OFFSETS.map((o) => sweepArc(w, railSection(w, o), 192, 90, SEGMENTS))),
  },
];

// The track-only switch base against switch.scad's switch_base(), for the
// configs in test/fixtures/switch-sets.txt (their routes and points sets).
{
  type Seg = ['S', number] | ['A', number, number];
  let cur: { name: string; routes: Seg[][]; sets: number[][] } | undefined;
  const cfgs: NonNullable<typeof cur>[] = [];
  for (const line of readFileSync('test/fixtures/switch-sets.txt', 'utf8').trim().split('\n')) {
    const [tag, ...rest] = line.split(' ');
    if (tag === 'CFG') cfgs.push(cur = { name: rest[0], routes: [], sets: [] });
    else if (tag === 'ROUTES') cur!.routes = JSON.parse(rest.join(' '));
    else if (tag === 'SETS') cur!.sets = JSON.parse(rest.join(' '));
  }
  for (const cfg of cfgs) {
    const [type, r, shape] = cfg.name.split('-');
    const routes = cfg.routes.map((segs, k): Route => ({ id: String(k), start: [0, 0, 0],
      segments: segs.map((sg): Segment => (sg[0] === 'S' ? { kind: 'straight', length: sg[1] } : { kind: 'arc', radius: sg[1], angle: sg[2] })) }));
    // the moving parts (each points set's, on a three-way)
    for (const part of ['points', 'throw', 'lever'] as const)
      for (let k = 0; k < cfg.sets.length; k++) {
        if (part === 'lever' && !cfg.name.endsWith('R40-arc')) continue;
        cases.push({
          name: `switch-${part}${k ? k : ''}-${cfg.name}`,
          scad: 'include <switch.scad>\n',
          defines: { part: `"${part}"`, points_set: k, generate_ballast: 'false', switch_type: `"${type}"`,
            diverge_radius: Number(r.slice(1)), diverge_shape: `"${shape}"` },
          build: (w: Wasm) => {
            const gm = switchGeometry(new Scad(w), switchPlan(routes, cfg.sets as SetSpec[], BASE_DEFAULTS, type === 'right' ? -1 : 1));
            return part === 'points' ? gm.pointsPart(k) : part === 'throw' ? gm.throwPart(k) : gm.leverPrint();
          },
        });
      }
    // on ballast (anti-stud bottom with the buddy; and float without it), with
    // switch.scad's routes for ballast (longer: the ends clear the ballast)
    const bcfgOf = (name: string) => {
      const ls = readFileSync('test/fixtures/switch-sets-ballast.txt', 'utf8').split('\n'), i = ls.findIndex((l) => l.startsWith(`CFG ${name} `));
      if (i < 0) return undefined;
      return { routes: (JSON.parse(ls[i + 1].slice(7)) as Seg[][]).map((segs, k): Route => ({ id: String(k), start: [0, 0, 0],
        segments: segs.map((sg): Segment => (sg[0] === 'S' ? { kind: 'straight', length: sg[1] } : { kind: 'arc', radius: sg[1], angle: sg[2] })) })), sets: JSON.parse(ls[i + 2].slice(5)) as SetSpec[] };
    };
    const bcfg = bcfgOf(cfg.name);
    // (the float, no-buddy ones with switch.scad's own routes for them where it makes them shorter (the
    // ballast's narrower without the buddy: scripts/switch-set-fixtures-ballast.sh's float-nobuddy-* configs))
    if (bcfg && ['left-R40-s_curve', 'right-R24-arc', 'wye-R40-arc', 'threeway-R40-arc'].includes(cfg.name))
      for (const [tag, defs, bp] of [['ballast', {}, {}], ['ballast-float-nobuddy', { bottom_style: '"float"', generate_ballast_buddy: 'false' }, { bottomStyle: 'float', ballastBuddy: false }]] as const) {
        const bc = (tag !== 'ballast' && bcfgOf(`float-nobuddy-${cfg.name}`)) || bcfg;
        cases.push({
          name: `switch-${tag}-${cfg.name}`,
          scad: 'include <switch.scad>\nswitch_base();\n',
          defines: { part: '"none"', generate_ballast: 'true', switch_type: `"${type}"`, diverge_radius: Number(r.slice(1)), diverge_shape: `"${shape}"`, label_name: 'false', label_switch: 'false', ...defs },
          build: (w: Wasm) => switchBase(new Scad(w), switchPlan(bc.routes, bc.sets, { ...BASE_DEFAULTS, generateBallast: true, ...bp } as typeof BASE_DEFAULTS, type === 'right' ? -1 : 1)),
        });
      }
    // the base cut for the print bed, piece by piece
    if (['left-R40-s_curve', 'right-R24-arc', 'wye-R40-arc'].includes(cfg.name))
      for (let k = 0; k < 3; k++)
        cases.push({
          name: `switch-basepiece${k}-${cfg.name}`,
          scad: 'include <switch.scad>\n',
          defines: { part: '"base"', base_piece: k, generate_ballast: 'false', stud_grip: '"all"', switch_type: `"${type}"`,
            diverge_radius: Number(r.slice(1)), diverge_shape: `"${shape}"` },
          build: (w: Wasm) => {
            const bp = switchGeometry(new Scad(w), switchPlan(routes, cfg.sets as SetSpec[], { ...BASE_DEFAULTS, studGrip: 'all' }, type === 'right' ? -1 : 1)).basePieces();
            return bp[Math.min(k, bp.length - 1)];
          },
        });
    for (const grip of ['all', 'edges'] as const) {
      // (the anti-stud tube underside on a few)
      if (grip === 'edges' && !['left-R40-s_curve', 'right-R24-arc', 'wye-R40-arc', 'threeway-R40-arc'].includes(cfg.name)) continue;
      cases.push({
        name: `switch-base-${cfg.name}${grip === 'edges' ? '-tubes' : ''}`,
        scad: 'include <switch.scad>\nswitch_base();\n',
        defines: { part: '"none"', generate_ballast: 'false', stud_grip: `"${grip}"`, switch_type: `"${type}"`,
          diverge_radius: Number(r.slice(1)), diverge_shape: `"${shape}"` },
        build: (w: Wasm) => switchBase(new Scad(w), switchPlan(routes, cfg.sets as SetSpec[], { ...BASE_DEFAULTS, studGrip: grip }, type === 'right' ? -1 : 1)),
      });
    }
  }
}

function renderScad(c: Case, out: string) {
  const args = ['--backend=manifold', '--export-format', 'binstl', '-o', out];
  for (const [k, v] of Object.entries(c.defines ?? {})) args.push('-D', `${k}=${v}`);
  if (c.scad) {
    const src = join(OUT, `${c.name}.scad`);
    writeFileSync(src, c.scad);
    args.push(src);
  } else args.push('parity/rails.scad');
  const env = { ...process.env, OPENSCADPATH: REPO };
  const [cmd, cmdArgs] = existsSync(SAFE_RUN) ? [SAFE_RUN, ['openscad-nightly', ...args]] : ['openscad-nightly', args];
  const t0 = performance.now();
  execFileSync(cmd, cmdArgs, { env, stdio: ['ignore', 'ignore', 'pipe'] });
  return performance.now() - t0;
}

/** Signed volume, bounding box and triangle count of a binary STL. */
function rawStats(path: string) {
  const d = readFileSync(path);
  const n = d.readUInt32LE(80);
  let vol = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < n; t++) {
    const v = [0, 1, 2].map((k) => [0, 1, 2].map((c) => d.readFloatLE(84 + t * 50 + 12 + k * 12 + c * 4)));
    for (const p of v) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], p[c]); max[c] = Math.max(max[c], p[c]); }
    const [p, q, r] = v;
    vol += (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6;
  }
  return { vol, min, max, tris: n };
}

/** Volume of a minus b, by OpenSCAD (0 if empty). (Not used: see compare().) */
export function diffVolume(a: string, b: string): number {
  const src = join(OUT, 'diff.scad'), out = join(OUT, 'diff.stl');
  writeFileSync(src, `difference() { import("${resolve(a)}"); import("${resolve(b)}"); }\n`);
  rmSync(out, { force: true });
  const args = ['--backend=manifold', '--export-format', 'binstl', '-o', out, src];
  const [cmd, cmdArgs] = existsSync(SAFE_RUN) ? [SAFE_RUN, ['openscad-nightly', ...args]] : ['openscad-nightly', args];
  try { execFileSync(cmd, cmdArgs, { stdio: ['ignore', 'ignore', 'pipe'] }); } catch { /* empty result */ }
  return existsSync(out) && statSync(out).size > 84 ? Math.abs(rawStats(out).vol) : 0;
}

const w = await kernel();
mkdirSync(OUT, { recursive: true });
const rows: string[] = [];
for (const c of cases.filter((c) => process.argv.length <= 2 || process.argv.slice(2).some((a) => c.name.includes(a)))) {
  const t0 = performance.now();
  const built = c.build(w);
  const ourMs = performance.now() - t0;
  const ourPath = join(OUT, `${c.name}.btd.stl`);
  writeFileSync(ourPath, stlBytes(built.getMesh()));
  const refPath = join(OUT, `${c.name}.scad.stl`);
  const scadMs = renderScad(c, refPath);
  // Measured on the raw triangles (no vertex merging, which can change thin
  // meshes), and the differences both ways by OpenSCAD itself.
  const a = rawStats(ourPath), b = rawStats(refPath);
  // (by vertical columns on a 0.1mm grid, from the raw triangles: OpenSCAD's
  // own differences of imported meshes leave artifacts on thin parts)
  // (a coarser grid on big pieces, to keep the columns in memory)
  const area = (a.max[0] - a.min[0]) * (a.max[1] - a.min[1]);
  const cc = compare(ourPath, refPath, Math.max(0.1, Math.sqrt(area / 4e6)));
  const extra = cc.extra, missing = cc.missing;
  const bbox = Math.max(...[0, 1, 2].flatMap((k) => [Math.abs(a.min[k] - b.min[k]), Math.abs(a.max[k] - b.max[k])]));
  rows.push([
    c.name,
    `vol ${a.vol.toFixed(2)} / ${b.vol.toFixed(2)} (${((100 * (a.vol - b.vol)) / b.vol).toFixed(4)}%)`,
    `symdiff ${(extra + missing).toFixed(4)} mm3${cc.clusters.length ? ` (most at x ${cc.clusters[0].x0.toFixed(0)}, y ${cc.clusters[0].y0.toFixed(0)}, z ${cc.clusters[0].z0.toFixed(1)}..${cc.clusters[0].z1.toFixed(1)})` : ''}`,
    `bbox ${bbox.toFixed(4)} mm`,
    `tris ${a.tris} / ${b.tris}`,
    `time ${ourMs.toFixed(0)} ms / ${scadMs.toFixed(0)} ms`,
  ].join('  '));
}
console.log(rows.join('\n'));
