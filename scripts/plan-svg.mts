// A top-down drawing of a design's track pieces: slices through the
// sleepers (grey), the studs on them (dark), the rails (blue), as an SVG.
// npx tsx scripts/plan-svg.mts <design.json | template name> <out.svg> [options JSON]  (PARTS=1: colour each part; CLASH=1: ring moving parts that are in the track)
import { readFileSync, writeFileSync } from 'node:fs';
const R = '/home/aronwk/Documents/git/brick-track-designer/src/';
const { kernel } = await import(R + 'geom/kernel.ts');
const { buildDesign } = await import(R + 'app/build.ts');
const { TEMPLATES } = await import(R + 'app/design.ts');
const w = await kernel();
const arg = process.argv[2], d = arg.endsWith('.json') ? JSON.parse(readFileSync(arg, 'utf8')) : structuredClone(TEMPLATES[arg]);
d.options = { printBedX: 2000, printBedY: 2000, ...(d.options ?? {}), ...(process.argv[4] ? JSON.parse(process.argv[4]) : {}) };
const b = buildDesign(w, d);
const man = (p: any) => { const P = p.positions, mesh = new w.Mesh({ numProp: 3, vertProperties: new Float32Array(P), triVerts: new Uint32Array(P.length / 3).map((_, i) => i) }); mesh.merge(); return new w.Manifold(mesh); };
const track = w.Manifold.union(b.pieces.filter((p: any) => !/points|throw|lever|bracket|lid/.test(p.name)).map(man));
const moving = b.pieces.filter((p: any) => /points|throw/.test(p.name)).map(man);
const bb = track.boundingBox(), sc = 4, pad = 10;
const X = (x: number) => ((x - bb.min[0]) * sc + pad).toFixed(1), Y = (y: number) => ((bb.max[1] - y) * sc + pad).toFixed(1);
const path = (cs: any, fill: string, extra = '') => `<path fill-rule="evenodd" fill="${fill}" ${extra} d="${(cs.toPolygons() as number[][][]).map((p) => 'M' + p.map(([x, y]) => `${X(x)},${Y(y)}`).join('L') + 'Z').join('')}"/>`;
const z = (k: string, dflt: number) => Number(process.env[k] ?? dflt);
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${(bb.max[0] - bb.min[0]) * sc + 2 * pad}" height="${(bb.max[1] - bb.min[1]) * sc + 2 * pad}" style="background:#fff">`,
  // (PARTS=1: each part its own colour, to see the cuts)
  ...(process.env.PARTS ? b.pieces.filter((p: any) => !/points|throw|lever|bracket|lid/.test(p.name)).map((p: any, k: number) => path(man(p).slice(z('ZBED', 2)), `hsl(${(k * 137) % 360} 45% 75%)`, 'stroke="#333" stroke-width="0.6"'))
    : [path(track.slice(z('ZBED', 2)), '#c9c9c4')]),
  path(track.slice(z('ZSTUD', 4.2)), '#555'),
  path(track.slice(z('ZRAIL', 8.5)), '#2b6fd0'),
  ...moving.map((m: any) => path(m.slice(z('ZMOV', 7)), 'rgba(230,120,30,0.6)')),
  // (CLASH=1: where a moving part is in the track as assembled, ringed in red)
  ...(process.env.CLASH ? moving.flatMap((m: any) => { const x = m.intersect(track); if (x.volume() < 0.5) return []; const q = x.boundingBox(), r = Math.max(q.max[0] - q.min[0], q.max[1] - q.min[1]) * sc / 2 + 14; return [path(x.project(), '#e00'), `<circle cx="${X((q.min[0] + q.max[0]) / 2)}" cy="${Y((q.min[1] + q.max[1]) / 2)}" r="${r.toFixed(1)}" fill="none" stroke="#e00" stroke-width="3"/>`]; }) : []),
  `<g stroke="#e33" stroke-width="0.5">${Array.from({ length: Math.ceil((bb.max[0] - bb.min[0]) / 8) + 2 }, (_, k) => { const x = Math.floor(bb.min[0] / 8) * 8 + k * 8; return `<line x1="${X(x)}" y1="0" x2="${X(x)}" y2="6"/>`; }).join('')}</g>`,
  '</svg>'];
writeFileSync(process.argv[3], svg.join('\n'));
console.log('pieces', b.pieces.map((p: any) => p.name).join(' '));
