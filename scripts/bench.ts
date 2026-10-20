// First-build timings of the templates (each in a fresh cache), with the time
// spent in each build stage. Usage: tsx scripts/bench.ts [template substring]
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { readFileSync } from 'node:fs';
import { TEMPLATES } from '../src/app/design';

const w = await kernel();
const only = process.argv[2];
const designs = only?.endsWith('.json') ? { [only]: JSON.parse(readFileSync(only, 'utf8')) } : TEMPLATES;
for (const [name, d] of Object.entries(designs)) {
  if (only && !only.endsWith('.json') && !name.includes(only)) continue;
  const t0 = performance.now(); let last = t0, lastWhat = 'start';
  const stages: string[] = [];
  const b = buildDesign(w, { ...d, name: `${name}-${Math.random()}` } as never, (what) => {
    const t = performance.now(); if (process.env.BENCH) console.log(`  ${(t - t0).toFixed(0)} ms: ${what}`); stages.push(`${lastWhat} ${(t - last).toFixed(0)}`); last = t; lastWhat = what;
  });
  const t = performance.now(); stages.push(`${lastWhat} ${(t - last).toFixed(0)}`);
  console.log(`${name}: ${(t - t0).toFixed(0)} ms  [${stages.join(' | ')}]  ${b.info.switches} switches, ${b.info.pieces} parts${b.info.warnings.length ? ` (${b.info.warnings.join('; ')})` : ''}`);
}
