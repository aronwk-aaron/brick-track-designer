// A 3MF of several parts (from their binary STLs, in their print frames):
// each its own named object, on the bed, packed in rows; a part that won't
// fit what's left of one bed starts another beside it. Orca Slicer (and the
// others) opens it with the parts where they are, to arrange as it likes.
import { zip } from './zip';

interface Part { name: string; stl: Uint8Array }

/** The STL's triangles as welded vertices and indices, its lowest point at z 0 and centred in x and y. */
function meshOf(stl: Uint8Array) {
  const dv = new DataView(stl.buffer, stl.byteOffset, stl.byteLength), n = dv.getUint32(80, true);
  const verts: number[] = [], tris: number[] = [], at = new Map<string, number>();
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let k = 0; k < 3; k++) {
      const x = dv.getFloat32(o + k * 12, true), y = dv.getFloat32(o + k * 12 + 4, true), z = dv.getFloat32(o + k * 12 + 8, true);
      const key = `${x},${y},${z}`;
      let id = at.get(key);
      if (id === undefined) {
        id = verts.length / 3; at.set(key, id); verts.push(x, y, z);
        mn[0] = Math.min(mn[0], x); mn[1] = Math.min(mn[1], y); mn[2] = Math.min(mn[2], z);
        mx[0] = Math.max(mx[0], x); mx[1] = Math.max(mx[1], y); mx[2] = Math.max(mx[2], z);
      }
      tris.push(id);
    }
  }
  const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2;
  for (let i = 0; i < verts.length; i += 3) { verts[i] -= cx; verts[i + 1] -= cy; verts[i + 2] -= mn[2]; }
  return { verts, tris, w: mx[0] - mn[0], d: mx[1] - mn[1] };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const f = (x: number) => +x.toFixed(4);

/** The parts as one 3MF on beds bedX x bedY (mm). */
export function threeMF(parts: Part[], bedX: number, bedY: number): Uint8Array {
  const gap = 5, meshes = parts.map((p) => ({ ...meshOf(p.stl), name: p.name }));
  // (shelves: biggest first, left to right, then the next row up; a new bed beside the last when one's full)
  const order = meshes.map((_, i) => i).sort((a, b) => meshes[b].d - meshes[a].d);
  const place: [number, number][] = [];
  let bed = 0, x = gap, y = gap, row = 0;
  for (const i of order) {
    const m = meshes[i];
    if (x + m.w > bedX - gap && x > gap) { x = gap; y += row + gap; row = 0; }
    if (y + m.d > bedY - gap && y > gap) { bed++; x = gap; y = gap; row = 0; }
    place[i] = [bed * (bedX + 20) + x + m.w / 2, y + m.d / 2];
    x += m.w + gap; row = Math.max(row, m.d);
  }
  const objects = meshes.map((m, i) => {
    const vs: string[] = [], ts: string[] = [];
    for (let k = 0; k < m.verts.length; k += 3) vs.push(`<vertex x="${f(m.verts[k])}" y="${f(m.verts[k + 1])}" z="${f(m.verts[k + 2])}"/>`);
    for (let k = 0; k < m.tris.length; k += 3) ts.push(`<triangle v1="${m.tris[k]}" v2="${m.tris[k + 1]}" v3="${m.tris[k + 2]}"/>`);
    return `<object id="${i + 1}" name="${esc(m.name)}" type="model"><mesh><vertices>${vs.join('')}</vertices><triangles>${ts.join('')}</triangles></mesh></object>`;
  });
  const items = meshes.map((_, i) => `<item objectid="${i + 1}" transform="1 0 0 0 1 0 0 0 1 ${f(place[i][0])} ${f(place[i][1])} 0"/>`);
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Application">Brick Track Designer</metadata>
<resources>${objects.join('\n')}</resources>
<build>${items.join('')}</build>
</model>`;
  const types = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  const te = new TextEncoder();
  return zip([
    { name: '[Content_Types].xml', data: te.encode(types) },
    { name: '_rels/.rels', data: te.encode(rels) },
    { name: '3D/3dmodel.model', data: te.encode(model) },
  ]);
}
