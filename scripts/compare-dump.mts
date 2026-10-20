// Builds design variants and writes their parts (as assembled, and as
// printed) for the comparison viewer (scripts/compare-view.html), under
// compare/.data/<name>.json + .bin.
// npx tsx scripts/compare-dump.mts <name> <template name | design.json | crossover> <options JSON> [...more triples]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { kernel } = await import(root + '/src/geom/kernel.ts');
const { buildDesign } = await import(root + '/src/app/build.ts');
const { TEMPLATES } = await import(root + '/src/app/design.ts');
// (the assembly tests' crossover: two parallel tracks and a crossover between them)
const crossover = { version: 1, gaugeStuds: 4, routes: [
  { name: 'A', x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] },
  { name: 'B', x: 16, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 64 }] },
  { name: 'X', x: 0, y: 8, heading: 0, segs: [{ kind: 'curve', radius: 40, angle: -22.5 }, { kind: 'curve', radius: 40, angle: 22.5 }] },
] };
// several variants in one run: <name> <source> [options JSON] [<name> <source> <options JSON> ...]
const args = process.argv.slice(2);
const w = await kernel();
for (let i = 0; i < args.length; i += 3) await dump(args[i], args[i + 1], args[i + 2]);
async function dump(name: string, src: string, opts?: string) {
const d = structuredClone(src === 'crossover' ? crossover : src.endsWith('.json') ? JSON.parse(readFileSync(src, 'utf8')) : TEMPLATES[src]);
d.options = { printBedX: 2000, printBedY: 2000, ...(d.options ?? {}), ...(opts ? JSON.parse(opts) : {}) };
const b = buildDesign(w, d);
// each part: its mesh as assembled (world) and as printed (from its STL)
const stlTris = (stl: Uint8Array) => {
  const dv = new DataView(stl.buffer, stl.byteOffset, stl.byteLength), n = dv.getUint32(80, true), out = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
  return out;
};
const chunks: Float32Array[] = [], parts: { name: string; color: number; world: [number, number]; print: [number, number] }[] = [];
let off = 0;
const push = (a: Float32Array): [number, number] => { chunks.push(a); const r: [number, number] = [off, a.length]; off += a.length; return r; };
for (const p of b.pieces) parts.push({ name: p.name, color: p.color, world: push(p.positions), print: push(stlTris(p.stl)) });
const all = new Float32Array(off); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
mkdirSync(root + '/compare/.data', { recursive: true });
writeFileSync(`${root}/compare/.data/${name}.bin`, Buffer.from(all.buffer));
writeFileSync(`${root}/compare/.data/${name}.json`, JSON.stringify({ parts, warnings: b.info.warnings, options: d.options }));
console.log(name, parts.map((p) => p.name).join(' '), b.info.warnings.length ? `warnings: ${b.info.warnings.join('; ')}` : '');
}
