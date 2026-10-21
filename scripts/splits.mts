// The solver's splits of a design (after orienting its routes), with their toes in studs, and each route's ends.
// npx tsx scripts/splits.mts <design.json> <solver options JSON>
import { readFileSync } from 'node:fs';
const R = new URL('../src/', import.meta.url).pathname;
const { toRoutes } = await import(R + 'app/design.ts');
const { solve } = await import(R + 'route/solver.ts');
const { routePose } = await import(R + 'route/route.ts');
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { orient } = await import(R + 'app/build.ts'); const routes = orient(toRoutes(d).filter((r: any) => r.segments.length));
const sol = solve(routes, JSON.parse(process.argv[3]));
for (const sp of sol.splits) { const s0 = sp.merge ? sp.spans[0][1] : sp.spans[0][0], q = routePose(routes[sp.routes[0]], s0); console.log(JSON.stringify(sp.routes), sp.merge ? 'merge' : 'split', 'toe', (q[0] / 8).toFixed(1), (q[1] / 8).toFixed(1)); }
for (const [k, r] of routes.entries()) { const e = routePose(r, (await import(R + 'route/route.ts')).routeLength(r)); console.log(k, r.id ?? '', 'start', r.start.map((x: number) => +(x / 8).toFixed(1)), 'end', e.map((x: number, i: number) => +(i < 2 ? x / 8 : x).toFixed(1))); }
