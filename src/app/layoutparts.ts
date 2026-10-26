// A design as parts for a layout designer (BlueBrick and the Collaborative
// Brick Layout Designer built on it): one library part per printed track part, as
// built and cut to the print bed (the moving parts drawn on the part they sit
// in), each a top-down picture at 8 px a stud with its connection points
// where the track leaves it, and a set placing them all as designed.
//
// The library's frame: studs, x right, y DOWN (screen), a part's connection
// points from the middle of its picture, their angles the way the track goes
// out (degrees, from +x towards +y, so clockwise on screen). The design's:
// mm, y up. A set's sub-part sits with the middle of its outline (its hull,
// here the picture's box: no <hull> is written) at its position.
import { type Design, isMono, STUD, toRoutes } from './design';
import { routeLength, routePose, type Route } from '../route/route';
import { gifBytes } from '../geom/gif';

/** What the export needs of a built piece. */
export interface PieceLike { name: string; color: number; positions: Float32Array }

/** Connection types in the library's parts (BlueBrick's ids). */
export const CONNECTION_TYPE = { rail: '1', monorail: '3' } as const;
/** The connection type where a route leaves a part: a monorail route's ends and joints are type 3, so they only snap to monorail. */
export function connectionType(design: Design, routeIndex: number): string {
  const r = design.routes[routeIndex];
  return r && isMono(r) ? CONNECTION_TYPE.monorail : CONNECTION_TYPE.rail;
}

export const PX_PER_STUD = 8;
const SS = 2;                    // (samples a pixel each way, for the picture and the parts' outlines)
const MM_PER_PX = STUD / PX_PER_STUD;

export interface LayoutConnection { type: string; x: number; y: number; angle: number }
export interface LayoutPart {
  /** the library key, <design>.<part> */
  id: string; piece: string; description: string;
  /** the moving parts drawn on it */
  guests: string[];
  /** its picture's box, whole studs in the design (mm) */
  box: [number, number, number, number];
  /** the picture's middle in the library's frame (studs, y down): where the set puts it */
  centre: [number, number];
  width: number; height: number; gif: Uint8Array;
  /** its connection points, studs from the picture's middle, y down */
  connections: LayoutConnection[];
}
export interface LayoutExport { folder: string; prefix: string; parts: LayoutPart[]; setId: string; files: { name: string; data: Uint8Array }[] }

/** A moving part (drawn on the track part it sits in, not a layout part of its own). */
export const isMovingPart = (name: string) => /lid|holddown|bracket|lever|throw|points|spring/.test(name);

/** A name as it may go in a library key (letters, digits, - and _). */
export const keyName = (s: string) => s.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'track';

// ---------- the pictures ----------

interface Raster {
  /** mm: the samples' box (x0, y1 its top-left: the picture's top row is the design's top) */
  x0: number; y1: number; w: number; h: number;
  z: Float32Array; shade: Float32Array; col: Int16Array;
  /** samples the track part itself covers (not its moving parts): where it is, to find which part a point of track is on */
  own: Uint8Array;
}

/** Each piece's triangles that face up, filled into the raster from above (the highest wins), shaded as the 3D view lights them. */
function fill(r: Raster, pos: Float32Array, col: number, own: boolean, zr: [number, number]) {
  const step = MM_PER_PX / SS, L = [0.3, -0.4, 0.7], ln = Math.hypot(L[0], L[1], L[2]);
  for (let t = 0; t + 8 < pos.length; t += 9) {
    const ax = pos[t], ay = pos[t + 1], az = pos[t + 2], bx = pos[t + 3], by = pos[t + 4], bz = pos[t + 5], cx = pos[t + 6], cy = pos[t + 7], cz = pos[t + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nz <= 1e-9) continue; // (facing down or on edge: unseen from above)
    const nl = Math.hypot(nx, ny, nz);
    const lam = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / (nl * ln));
    // (samples: i across from x0, j down from y1, at their middles)
    const toI = (x: number) => (x - r.x0) / step - 0.5, toJ = (y: number) => (r.y1 - y) / step - 0.5;
    const pa = [toI(ax), toJ(ay)], pb = [toI(bx), toJ(by)], pc = [toI(cx), toJ(cy)];
    const i0 = Math.max(0, Math.ceil(Math.min(pa[0], pb[0], pc[0]))), i1 = Math.min(r.w - 1, Math.floor(Math.max(pa[0], pb[0], pc[0])));
    const j0 = Math.max(0, Math.ceil(Math.min(pa[1], pb[1], pc[1]))), j1 = Math.min(r.h - 1, Math.floor(Math.max(pa[1], pb[1], pc[1])));
    if (i0 > i1 || j0 > j1) continue;
    const d = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1]);
    if (Math.abs(d) < 1e-12) continue;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const w1 = ((i - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (j - pa[1])) / d;
      const w2 = ((pb[0] - pa[0]) * (j - pa[1]) - (i - pa[0]) * (pb[1] - pa[1])) / d;
      const w0 = 1 - w1 - w2;
      if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
      const k = j * r.w + i;
      if (own) r.own[k] = 1;
      const z = w0 * az + w1 * bz + w2 * cz;
      if (z <= r.z[k]) continue;
      r.z[k] = z; r.col[k] = col;
      // (lit as the 3D view: the sky light and the sun, the higher a bit brighter, so the rails stand out on the bed)
      const hi = zr[1] > zr[0] ? (z - zr[0]) / (zr[1] - zr[0]) : 1;
      r.shade[k] = (0.5 + 0.5 * lam) * (0.72 + 0.28 * hi);
    }
  }
}

const LEVELS = 16;
/** The raster down to the picture: a pixel shown where most of its samples are covered, in the colour most of them are, shaded to one of LEVELS. */
function picture(r: Raster, colours: number[]): { width: number; height: number; gif: Uint8Array } {
  const W = r.w / SS, H = r.h / SS, idx = new Uint8Array(W * H);
  const palette: [number, number, number][] = [[255, 255, 255]];
  const slot = new Map<string, number>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tally = new Map<number, { n: number; s: number }>();
    let covered = 0;
    for (let b = 0; b < SS; b++) for (let a = 0; a < SS; a++) {
      const k = (y * SS + b) * r.w + x * SS + a, c = r.col[k];
      if (c < 0) continue;
      covered++;
      const e = tally.get(c) ?? { n: 0, s: 0 }; e.n++; e.s += r.shade[k]; tally.set(c, e);
    }
    if (covered * 2 < SS * SS) continue; // (see-through)
    let best = -1, bn = 0, bs = 0;
    for (const [c, e] of tally) if (e.n > bn) { best = c; bn = e.n; bs = e.s / e.n; }
    const level = Math.max(0, Math.min(LEVELS - 1, Math.round(bs * (LEVELS - 1))));
    const key = `${best}:${level}`;
    let p = slot.get(key);
    if (p === undefined) {
      const rgb = colours[best], f = level / (LEVELS - 1);
      p = palette.length; slot.set(key, p);
      palette.push([((rgb >> 16) & 0xff) * f, ((rgb >> 8) & 0xff) * f, (rgb & 0xff) * f].map((v) => Math.round(Math.min(255, v * 1.15))) as [number, number, number]);
    }
    idx[y * W + x] = p;
  }
  return { width: W, height: H, gif: gifBytes(W, H, idx, palette, 0) };
}

// ---------- where the track leaves each part ----------

/** The library's angle (degrees, y down) of a direction in the design (y up). */
const libAngle = (dx: number, dy: number) => {
  const a = (Math.atan2(-dy, dx) * 180) / Math.PI;
  return Math.round((a <= -180 + 1e-9 ? a + 360 : a) * 1e4) / 1e4;
};
const dirAt = (rt: Route, s: number): [number, number] => { const h = (routePose(rt, s)[2] * Math.PI) / 180; return [-Math.sin(h), Math.cos(h)]; };
const ptAt = (rt: Route, s: number): [number, number] => { const p = routePose(rt, s); return [p[0], p[1]]; };

/**
 * The layout parts of a built design: its track parts (pieces whose names
 * aren't moving parts'), their pictures, connection points and the set.
 * name: the design's name (the folder and the parts' keys).
 */
export function layoutParts(design: Design, pieces: PieceLike[], name = design.name || 'track-piece'): LayoutExport {
  const folder = name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'track-piece';
  const prefix = keyName(name);
  const track = pieces.filter((p) => !isMovingPart(p.name)), moving = pieces.filter((p) => isMovingPart(p.name));
  if (!track.length) throw new Error('nothing built to export');
  const box3 = (ps: Float32Array) => {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < ps.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], ps[i + k]); b[k + 3] = Math.max(b[k + 3], ps[i + k]); }
    return b;
  };
  const tBoxes = track.map((p) => box3(p.positions));
  // (each moving part on the track part under its middle: the one whose box has it, the smallest such, else the nearest)
  const guests = track.map(() => [] as PieceLike[]);
  for (const m of moving) {
    const b = box3(m.positions), c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2];
    let host = -1, area = Infinity;
    tBoxes.forEach((tb, k) => { const a = (tb[3] - tb[0]) * (tb[4] - tb[1]); if (c[0] >= tb[0] && c[0] <= tb[3] && c[1] >= tb[1] && c[1] <= tb[4] && a < area) { host = k; area = a; } });
    if (host < 0) host = tBoxes.reduce((best, tb, k) => (best < 0 || Math.hypot((tb[0] + tb[3]) / 2 - c[0], (tb[1] + tb[4]) / 2 - c[1]) < Math.hypot((tBoxes[best][0] + tBoxes[best][3]) / 2 - c[0], (tBoxes[best][1] + tBoxes[best][4]) / 2 - c[1]) ? k : best), -1);
    guests[host].push(m);
  }
  let zMin = Infinity, zMax = -Infinity;
  for (const b of tBoxes) { zMin = Math.min(zMin, b[2]); zMax = Math.max(zMax, b[5]); }
  const colours: number[] = [];
  const colourOf = (c: number) => { let k = colours.indexOf(c); if (k < 0) { k = colours.length; colours.push(c); } return k; };

  // the rasters (each part's box on whole studs of the design's grid)
  const rasters = track.map((p, k) => {
    const all = [tBoxes[k], ...guests[k].map((g) => box3(g.positions))];
    const x0 = Math.floor(Math.min(...all.map((b) => b[0])) / STUD - 1e-6) * STUD, x1 = Math.ceil(Math.max(...all.map((b) => b[3])) / STUD + 1e-6) * STUD;
    const y0 = Math.floor(Math.min(...all.map((b) => b[1])) / STUD - 1e-6) * STUD, y1 = Math.ceil(Math.max(...all.map((b) => b[4])) / STUD + 1e-6) * STUD;
    const w = Math.round(((x1 - x0) / MM_PER_PX) * SS), h = Math.round(((y1 - y0) / MM_PER_PX) * SS);
    const r: Raster = { x0, y1, w, h, z: new Float32Array(w * h).fill(-Infinity), shade: new Float32Array(w * h), col: new Int16Array(w * h).fill(-1), own: new Uint8Array(w * h) };
    fill(r, p.positions, colourOf(p.color), true, [zMin, zMax]);
    for (const g of guests[k]) fill(r, g.positions, colourOf(g.color), false, [zMin, zMax]);
    return { r, box: [x0, y0, x1, y1] as [number, number, number, number] };
  });
  /** The track parts covering a point of the design (mm), from above. */
  const partsAt = (q: [number, number]) => {
    const out: number[] = [];
    rasters.forEach(({ r, box }, k) => {
      if (q[0] < box[0] || q[0] >= box[2] || q[1] <= box[1] || q[1] > box[3]) return;
      const i = Math.floor((q[0] - r.x0) / (MM_PER_PX / SS)), j = Math.floor((r.y1 - q[1]) / (MM_PER_PX / SS));
      if (i >= 0 && i < r.w && j >= 0 && j < r.h && r.own[j * r.w + i]) out.push(k);
    });
    return out;
  };

  const conns: { part: number; at: [number, number]; dir: [number, number]; type: string }[] = [];
  const routes = toRoutes(design).map((rt, i) => ({ rt, i, L: routeLength(rt) })).filter((x) => x.rt.segments.length && x.L > 1e-6);
  const STEP = 0.5, MIN_RUN = 3;
  /** Along a route, the runs of track on one part only (shorter ones, where two parts' joints overlap or a part's corner is clipped, left out). */
  const runsOf = (rt: Route, L: number) => {
    const n = Math.max(1, Math.ceil(L / STEP)), runs: { part: number; s0: number; s1: number }[] = [];
    for (let k = 0; k <= n; k++) {
      const s = (L * k) / n, on = partsAt(ptAt(rt, s)), part = on.length === 1 ? on[0] : -1;
      const last = runs[runs.length - 1];
      if (last && last.part === part && last.s1 >= s - L / n - 1e-9) { last.s1 = s; continue; }
      runs.push({ part, s0: s, s1: s });
    }
    const kept = runs.filter((u) => u.part >= 0 && u.s1 - u.s0 >= MIN_RUN);
    const merged: typeof kept = [];
    for (const u of kept) { const m = merged[merged.length - 1]; if (m && m.part === u.part) m.s1 = u.s1; else merged.push({ ...u }); }
    return merged;
  };
  const routeRuns = routes.map(({ rt, L }) => runsOf(rt, L));
  // joints between parts along each route: halfway across the gap between one part's run and the next's
  routes.forEach(({ rt, i }, ri) => {
    const runs = routeRuns[ri], type = connectionType(design, i);
    for (let k = 1; k < runs.length; k++) {
      const s = (runs[k - 1].s1 + runs[k].s0) / 2, at = ptAt(rt, s), d = dirAt(rt, s);
      conns.push({ part: runs[k - 1].part, at, dir: d, type }, { part: runs[k].part, at, dir: [-d[0], -d[1]], type });
    }
  });
  // the routes' ends: free ends (on no other track) are where the track leaves its part; ends joined end to end at a cut, joints
  const ends = routes.flatMap(({ rt, i, L }, ri) => [0, 1].map((e) => {
    const s = e ? L : 0, d = dirAt(rt, s);
    const runs = routeRuns[ri], run = e ? runs[runs.length - 1] : runs[0];
    return { ri, i, at: ptAt(rt, s), out: (e ? d : [-d[0], -d[1]]) as [number, number], part: run && (e ? L - run.s1 : run.s0) < 20 ? run.part : -1 };
  }));
  const near = (a: [number, number], b: [number, number], tol = 1) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
  ends.forEach((e, k) => {
    if (e.part < 0) return;
    // (on another route, past its ends: a branch off it, or a route ending on it, inside the trackwork)
    const onOther = routes.some(({ rt, L }, rj) => {
      if (rj === e.ri) return false;
      const n = Math.max(1, Math.ceil(L));
      for (let m = 0; m <= n; m++) { const s = (L * m) / n; if (s > 2 && s < L - 2 && near(ptAt(rt, s), e.at, 1.5)) return true; }
      return false;
    });
    if (onOther) return;
    const joined = ends.find((f, j) => j !== k && near(f.at, e.at) && f.out[0] * e.out[0] + f.out[1] * e.out[1] < -0.99);
    if (joined) {
      if (joined.part >= 0 && joined.part !== e.part) conns.push({ part: e.part, at: e.at, dir: e.out, type: connectionType(design, e.i) });
      return;
    }
    conns.push({ part: e.part, at: e.at, dir: e.out, type: connectionType(design, e.i) });
  });

  const parts: LayoutPart[] = track.map((p, k) => {
    const { r, box } = rasters[k], img = picture(r, colours);
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    const mine: LayoutConnection[] = [];
    for (const c of conns.filter((q) => q.part === k)) {
      const x = (c.at[0] - cx) / STUD, y = -(c.at[1] - cy) / STUD, angle = libAngle(c.dir[0], c.dir[1]);
      // (the same point twice, as where two routes leave a switch's toe together: once)
      if (mine.some((m) => m.type === c.type && Math.hypot(m.x - x, m.y - y) < 1 / STUD && Math.abs(((m.angle - angle + 540) % 360) - 180) < 2)) continue;
      mine.push({ type: c.type, x: round(x), y: round(y), angle });
    }
    return {
      id: `${prefix}.${keyName(p.name)}`, piece: p.name, description: `${name}: ${p.name}`, guests: guests[k].map((g) => g.name),
      box, centre: [round(cx / STUD), round(-cy / STUD)], width: img.width, height: img.height, gif: img.gif, connections: mine,
    };
  });
  const setId = `${prefix}.whole`;
  return { folder, prefix, parts, setId, files: files(name, folder, prefix, parts, setId) };
}

const round = (v: number) => Math.round(v * 1e4) / 1e4 + 0; // (+0: no -0)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A part's XML (BlueBrick's <part>). */
export function partXml(p: LayoutPart, sortingKey: string): string {
  const n = p.connections.length, mod = (v: number) => Math.round((((v % 360) + 360) % 360) * 1e4) / 1e4;
  const cs = p.connections.map((c, k) => {
    const next = p.connections[(k + 1) % n], prev = p.connections[(k - 1 + n) % n];
    return `\t\t<connexion>
\t\t\t<type>${c.type}</type>
\t\t\t<position>
\t\t\t\t<x>${c.x}</x>
\t\t\t\t<y>${c.y}</y>
\t\t\t</position>
\t\t\t<angle>${c.angle}</angle>
\t\t\t<angleToPrev>${mod(prev.angle - c.angle)}</angleToPrev>
\t\t\t<angleToNext>${mod(c.angle - next.angle)}</angleToNext>
\t\t\t<nextConnexionPreference>${(k + 1) % n}</nextConnexionPreference>
\t\t</connexion>\n`;
  }).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<part>
\t<Author>Brick Track Designer</Author>
\t<Description>
\t\t<en>${esc(p.description)}</en>
\t</Description>
\t<SortingKey>${esc(sortingKey)}</SortingKey>
${n ? `\t<ConnexionList>\n${cs}\t</ConnexionList>\n` : ''}</part>
`;
}

/** The set placing every part as designed (BlueBrick's <group>): each at its picture's middle, unturned. */
export function setXml(name: string, parts: LayoutPart[]): string {
  // (around the middle of them all)
  const xs = parts.flatMap((p) => [p.centre[0] - p.width / PX_PER_STUD / 2, p.centre[0] + p.width / PX_PER_STUD / 2]);
  const ys = parts.flatMap((p) => [p.centre[1] - p.height / PX_PER_STUD / 2, p.centre[1] + p.height / PX_PER_STUD / 2]);
  const ox = (Math.min(...xs) + Math.max(...xs)) / 2, oy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const subs = parts.map((p) => `\t\t<SubPart id="${esc(p.id)}">
\t\t\t<position>
\t\t\t\t<x>${round(p.centre[0] - ox)}</x>
\t\t\t\t<y>${round(p.centre[1] - oy)}</y>
\t\t\t</position>
\t\t\t<angle>0</angle>
\t\t</SubPart>\n`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<group>
\t<Author>Brick Track Designer</Author>
\t<Description>
\t\t<en>${esc(name)} (all ${parts.length} part${parts.length === 1 ? '' : 's'}, as designed)</en>
\t</Description>
\t<SortingKey>0</SortingKey>
\t<CanUngroup>true</CanUngroup>
\t<SubPartList>
${subs}\t</SubPartList>
</group>
`;
}

export const README = (name: string, folder: string, prefix: string, setId: string) => `${name}: layout parts
${'='.repeat(name.length + 14)}

Made with Brick Track Designer. The folder "${folder}" is a parts library for
the Collaborative Brick Layout Designer (and BlueBrick): one part for each
printed track part of the design, as cut for the print bed (the points,
throws and levers drawn on the part they go in), each with its connection
points where the track leaves it, so they snap together and onto other track.
The set "${setId}" puts all of them down as designed.

Collaborative Brick Layout Designer (desktop 1.4.0 or later)
  1. Tools > Parts > Add Parts from a Zip..., and choose this zip: it's
     unpacked into the imports folder and the parts reloaded.
     (Or unzip it somewhere to keep it, then Tools > Parts > Parts
     Folders..., Add..., choose the "${folder}" folder, OK.)
  2. The parts are in the Parts panel under the category "${folder}".
     Drag "${name} (all ... parts, as designed)" onto the map for the whole
     design, or the parts one at a time.
  After exporting again (the design changed), add the new zip the same way
  (or unzip over the old folder and use Tools > Parts > Reload Parts): maps
  using the parts show the new ones.
  Sharing through a server: "Upload to server..." (the server window's Parts
  tab) sends these parts from whichever parts folder they're in, and the set
  too where the server takes sets; the web version places the set as one
  group.
  Checking the joins: bld-render --check-connections <this zip> lists the
  parts' connection points that pair up, the open ends, and any that nearly
  meet but don't.

BlueBrick
  Copy the "${folder}" folder into BlueBrick's "parts" folder (beside
  "Track", "Custom" and so on) and restart BlueBrick (or reload the part
  library).

The parts' names are "${prefix}.<part>": save a different design under a
name of its own before exporting it, or its parts take the place of these.
`;

function files(name: string, folder: string, prefix: string, parts: LayoutPart[], setId: string) {
  const enc = new TextEncoder(), out: { name: string; data: Uint8Array }[] = [];
  const pad = String(parts.length).length;
  parts.forEach((p, k) => {
    out.push({ name: `${folder}/${p.id}.xml`, data: enc.encode(partXml(p, `${String(k + 1).padStart(pad, '0')} ${p.piece}`)) });
    out.push({ name: `${folder}/${p.id}.gif`, data: p.gif });
  });
  out.push({ name: `${folder}/${setId}.set.xml`, data: enc.encode(setXml(name, parts)) });
  // (as BlueBrick's part packages have: the list of its files, and its version)
  const list = out.map((f) => f.name.slice(folder.length + 1)).sort();
  out.push({ name: `${folder}/_partlist.txt`, data: enc.encode(list.join('\r\n') + '\r\n') });
  out.push({ name: `${folder}/config/About.txt`, data: enc.encode(`version=1.0\r\nThe parts of the track design "${name}", made with Brick Track Designer.\r\n`) });
  out.push({ name: 'README.txt', data: enc.encode(README(name, folder, prefix, setId).replace(/\n/g, '\r\n')) });
  return out;
}
