import { writeFileSync } from 'node:fs';
import { kernel } from '../src/geom/kernel';
import { buildDesign } from '../src/app/build';
import { TEMPLATES } from '../src/app/design';
const w = await kernel();
for (const [n, bp] of [['Left switch (LEGO)', 32], ['22.5° crossing', 32]] as const) {
  const t = performance.now();
  const b = buildDesign(w, { ...TEMPLATES[n], options: { baseplate: bp } });
  console.log(n, bp, (performance.now() - t).toFixed(0), 'ms', b.info.warnings, b.pieces.map((p) => p.name).join(' '));
  b.pieces.forEach((p, k) => writeFileSync(`parity/out/bp-${k}.stl`, p.stl));
}
