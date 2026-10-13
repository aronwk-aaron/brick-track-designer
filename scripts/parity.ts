// Parity check: build pieces with manifold-3d here and with the OpenSCAD
// track library, and compare the meshes (volume, bounding box, symmetric
// difference). Usage: pnpm parity  (OPENSCAD_REPO defaults to
// ~/Documents/openscad; renders go through ~/.claude/scripts/safe-run.sh
// when it exists).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { kernel, type Wasm } from '../src/geom/kernel';
import { railSection, sweepArc, sweepStraight } from '../src/geom/rail';
import { stlBytes } from '../src/geom/stl';

const OUT = 'parity/out';
const REPO = process.env.OPENSCAD_REPO ?? join(homedir(), 'Documents/openscad');
const SAFE_RUN = join(homedir(), '.claude/scripts/safe-run.sh');
const OFFSETS = [-20, 20];

type Man = InstanceType<Wasm['Manifold']>;

interface Case {
  name: string;
  defines: Record<string, string | number>;
  build: (w: Wasm) => Man;
}

const SEGMENTS = 64;
const cases: Case[] = [
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

function readStl(w: Wasm, path: string): Man {
  const d = readFileSync(path);
  if (d.subarray(0, 5).toString() === 'solid' && d.includes('facet')) throw new Error(`${path}: ASCII STL, export binstl`);
  const n = d.readUInt32LE(80);
  const vert = new Float32Array(n * 9);
  for (let t = 0; t < n; t++)
    for (let k = 0; k < 9; k++) vert[t * 9 + k] = d.readFloatLE(84 + t * 50 + 12 + k * 4);
  const mesh = new w.Mesh({ numProp: 3, vertProperties: vert, triVerts: Uint32Array.from({ length: n * 3 }, (_, i) => i) });
  mesh.merge();
  return new w.Manifold(mesh);
}

function renderScad(c: Case, out: string) {
  const args = ['--backend=manifold', '--export-format', 'binstl', '-o', out];
  for (const [k, v] of Object.entries(c.defines)) args.push('-D', `${k}=${v}`);
  args.push('parity/rails.scad');
  const env = { ...process.env, OPENSCADPATH: REPO };
  const [cmd, cmdArgs] = existsSync(SAFE_RUN) ? [SAFE_RUN, ['openscad-nightly', ...args]] : ['openscad-nightly', args];
  const t0 = performance.now();
  execFileSync(cmd, cmdArgs, { env, stdio: ['ignore', 'ignore', 'pipe'] });
  return performance.now() - t0;
}

const w = await kernel();
mkdirSync(OUT, { recursive: true });
const rows: string[] = [];
for (const c of cases) {
  const t0 = performance.now();
  const ours = c.build(w);
  const ourMs = performance.now() - t0;
  writeFileSync(join(OUT, `${c.name}.btd.stl`), stlBytes(ours.getMesh()));
  const refPath = join(OUT, `${c.name}.scad.stl`);
  const scadMs = renderScad(c, refPath);
  const ref = readStl(w, refPath);
  const va = ours.volume(), vb = ref.volume();
  const extra = ours.subtract(ref).volume(), missing = ref.subtract(ours).volume();
  const ba = ours.boundingBox(), bb = ref.boundingBox();
  const bbox = Math.max(...[0, 1, 2].flatMap((i) => [Math.abs(ba.min[i] - bb.min[i]), Math.abs(ba.max[i] - bb.max[i])]));
  rows.push([
    c.name,
    `vol ${va.toFixed(2)} / ${vb.toFixed(2)} (${((100 * (va - vb)) / vb).toFixed(4)}%)`,
    `symdiff ${(extra + missing).toFixed(4)} mm3`,
    `bbox ${bbox.toFixed(4)} mm`,
    `tris ${ours.numTri()} / ${ref.numTri()}`,
    `time ${ourMs.toFixed(0)} ms / ${scadMs.toFixed(0)} ms`,
  ].join('  '));
}
console.log(rows.join('\n'));
