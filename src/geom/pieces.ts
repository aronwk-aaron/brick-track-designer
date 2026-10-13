// Spike pieces: the two rails of a straight or a curve.
import type { Wasm } from './kernel';
import { railSection, sweepArc, sweepStraight } from './rail';

export const STUD = 8;

export interface RailsSpec {
  kind: 'straight' | 'curve';
  gaugeStuds: number;      // studs between the rails (4 = LEGO)
  lengthStuds: number;     // straight
  radiusStuds: number;     // curve, of the centre line
  angle: number;           // curve, degrees, + = left
}

export function buildRails(w: Wasm, s: RailsSpec) {
  const g = ((s.gaugeStuds + 1) * STUD) / 2;
  const segments = Math.max(8, Math.ceil(Math.abs(s.angle) / 360 * 1024));
  return w.Manifold.union([-g, g].map((o) =>
    s.kind === 'straight'
      ? sweepStraight(w, railSection(w, o), s.lengthStuds * STUD)
      : sweepArc(w, railSection(w, o), s.radiusStuds * STUD, s.angle, segments)));
}
