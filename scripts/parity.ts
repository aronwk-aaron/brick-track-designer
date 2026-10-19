// Parity check: build pieces with manifold-3d here and with the OpenSCAD
// track library, and compare the meshes (volume, bounding box, symmetric
// difference). Usage: pnpm parity  (OPENSCAD_REPO defaults to
// ~/Documents/openscad; renders go through ~/.claude/scripts/safe-run.sh
// when it exists).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { kernel, type Wasm } from '../src/geom/kernel';
import { railSection, sweepArc, sweepStraight } from '../src/geom/rail';
import { stlBytes } from '../src/geom/stl';
import { Scad } from '../src/geom/scad';
import { Track } from '../src/geom/track';
import { STRAIGHT_DEFAULTS, straightTrackOnly } from '../src/geom/straight';
import { CURVE_DEFAULTS, curveTrackOnly } from '../src/geom/curve';

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
    defines: { generate_ballast: 'false', length_studs: n },
    build: (w: Wasm) => straightTrackOnly(new Scad(w), { ...STRAIGHT_DEFAULTS, lengthStuds: n }),
  })),
  {
    name: 'straight-trackonly-ln2',
    scad: `include <straight.scad>\n`,
    defines: { generate_ballast: 'false', gauge_studs: 2 },
    build: (w: Wasm) => straightTrackOnly(new Scad(w), { ...STRAIGHT_DEFAULTS, gaugeStuds: 2 }),
  },
  {
    name: 'straight-trackonly-ties1',
    scad: `include <straight.scad>\n`,
    defines: { generate_ballast: 'false', sleeper_width_studs: 1, sleeper_gap_studs: 1, length_studs: 15 },
    build: (w: Wasm) => straightTrackOnly(new Scad(w), { ...STRAIGHT_DEFAULTS, sleeperWidthStuds: 1, sleeperGapStuds: 1, lengthStuds: 15 }),
  },
  ...([[24, 22.5001], [40, 22.5001], [104, 22.5001], [40, 90], [24, 45]] as const).map(([r, a]) => ({
    name: `curve-trackonly-R${r}-${a}`,
    scad: `include <curves.scad>\n`,
    defines: { generate_ballast: 'false', Radius: r, SegAng: a },
    build: (w: Wasm) => curveTrackOnly(new Scad(w), { ...CURVE_DEFAULTS, radiusStuds: r, segAng: a }),
  })),
  {
    name: 'curve-trackonly-ln2-end',
    scad: `include <curves.scad>\n`,
    defines: { generate_ballast: 'false', gauge_studs: 2, Radius: 24, SegAng: 45, antistud_grid: '"end"' },
    build: (w: Wasm) => curveTrackOnly(new Scad(w), { ...CURVE_DEFAULTS, gaugeStuds: 2, radiusStuds: 24, segAng: 45, antistudGrid: 'end' }),
  },
  {
    name: 'curve-trackonly-ln2',
    scad: `include <curves.scad>\n`,
    defines: { generate_ballast: 'false', gauge_studs: 2, Radius: 24, SegAng: 45 },
    build: (w: Wasm) => curveTrackOnly(new Scad(w), { ...CURVE_DEFAULTS, gaugeStuds: 2, radiusStuds: 24, segAng: 45 }),
  },
  {
    name: 'curve-trackonly-R40-end',
    scad: `include <curves.scad>\n`,
    defines: { generate_ballast: 'false', antistud_grid: '"end"' },
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

/** Volume of a minus b, by OpenSCAD (0 if empty). */
function diffVolume(a: string, b: string): number {
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
  const extra = diffVolume(ourPath, refPath), missing = diffVolume(refPath, ourPath);
  const bbox = Math.max(...[0, 1, 2].flatMap((k) => [Math.abs(a.min[k] - b.min[k]), Math.abs(a.max[k] - b.max[k])]));
  rows.push([
    c.name,
    `vol ${a.vol.toFixed(2)} / ${b.vol.toFixed(2)} (${((100 * (a.vol - b.vol)) / b.vol).toFixed(4)}%)`,
    `symdiff ${(extra + missing).toFixed(4)} mm3`,
    `bbox ${bbox.toFixed(4)} mm`,
    `tris ${a.tris} / ${b.tris}`,
    `time ${ourMs.toFixed(0)} ms / ${scadMs.toFixed(0)} ms`,
  ].join('  '));
}
console.log(rows.join('\n'));
