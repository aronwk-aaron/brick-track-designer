// A 2D plan view of a solution as SVG: the rails, the flangeway grooves cut
// into them, the check rails, the rail crossings and where routes split.
import { type Route, railPoint, railPolyline, routeLength } from './route';
import type { Solution } from './solver';

export interface PlanOptions { gauge: number; headHw: number; scale: number; margin: number }
const DEF: PlanOptions = { gauge: 40, headHw: 1.25, scale: 3, margin: 20 };

export function planSvg(routes: Route[], sol: Solution, opts: Partial<PlanOptions> = {}): string {
  const o = { ...DEF, ...opts }, g = o.gauge / 2;
  const rails = routes.flatMap((rt, i) => [-1, 1].map((sd) => ({ i, sd, pts: railPolyline(rt, sd * g, 1) })));
  const xs = rails.flatMap((r) => r.pts.map((p) => p[1])), ys = rails.flatMap((r) => r.pts.map((p) => p[2]));
  const x0 = Math.min(...xs) - o.margin, x1 = Math.max(...xs) + o.margin;
  const y0 = Math.min(...ys) - o.margin, y1 = Math.max(...ys) + o.margin;
  // SVG y runs down: flip, so +y (along the track) is up the page.
  const P = (x: number, y: number) => `${((x - x0) * o.scale).toFixed(2)},${((y1 - y) * o.scale).toFixed(2)}`;
  const line = (pts: [number, number][], stroke: string, w: number, extra = '') =>
    `<polyline points="${pts.map(([x, y]) => P(x, y)).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="butt" ${extra}/>`;
  const sub = (i: number, off: number, s0: number, s1: number) => {
    const n = Math.max(2, Math.ceil((s1 - s0) / 1));
    return Array.from({ length: n + 1 }, (_, k) => railPoint(routes[i], s0 + ((s1 - s0) * k) / n, off));
  };
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${((x1 - x0) * o.scale).toFixed(0)}" height="${((y1 - y0) * o.scale).toFixed(0)}" style="background:#fbfbf8">`);
  // centre lines
  routes.forEach((rt, i) => out.push(line(sub(i, 0, 0, routeLength(rt)), '#c8c8c0', 1, 'stroke-dasharray="6 4"')));
  // rails, heads to scale
  for (const r of rails) out.push(line(r.pts.map((p) => [p[1], p[2]]), '#4a5560', 2 * o.headHw * o.scale));
  // grooves (where other routes' flanges cut through), over the rail
  for (const gr of sol.grooves) out.push(line(sub(gr.route, gr.side * g, gr.s0, gr.s1), '#e0452b', 2 * o.headHw * o.scale * 0.6));
  // check rails
  for (const c of sol.checkRails) out.push(line(sub(c.route, c.offset + c.width / 2, c.s0, c.s1), '#2b6fe0', c.width * o.scale));
  // crossings and splits
  for (const c of sol.crossings) {
    const [x, y] = P(c.point[0], c.point[1]).split(',');
    out.push(`<circle cx="${x}" cy="${y}" r="${o.scale * 1.6}" fill="none" stroke="#111" stroke-width="1.2"><title>${c.angle.toFixed(1)}°</title></circle>`);
  }
  for (const sp of sol.splits) {
    const [x, y] = P(...railPoint(routes[sp.routes[0]], sp.s, 0)).split(',');
    out.push(`<rect x="${Number(x) - 5}" y="${Number(y) - 5}" width="10" height="10" fill="#f0b400"><title>split ${sp.routes.join('/')} at ${sp.s.toFixed(1)}mm</title></rect>`);
  }
  out.push('</svg>');
  return out.join('\n');
}
