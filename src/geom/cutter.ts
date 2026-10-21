// Cutting a finished piece along straight lines (baseplate edges, or to fit
// the print bed), joined the way LEGO track pieces are: every rail crossing a
// cut gets interlocking rail-end tongues (the track connectors'), turned to
// the rail's heading, with their breakaway supports, and the bed snap pegs
// and C-clips (switch.scad's base splitting, for any line and any piece).
// The joints (jointKit, railCrossings, pickSpots) are shared with the stepped
// cuts along the stud grid (pathsplit.ts, via pathJoints).
import { M, R, T, type CS, type Man, type Scad } from './scad';
import { arena, flat } from './kernel';
import { PLATE_H, type Track } from './track';
import type { Route } from '../route/route';
import { railPoint, routeLat, routeLength, routePose } from '../route/route';

export type Joint = 'lego' | 'dovetail' | 'butt' | 'axle';
/** A cut: through point p, along unit direction d; span: only the stretch from p + span[0] d to p + span[1] d gets couplers (a tile's edge, so the tiles either side agree). */
export interface CutLine { p: [number, number]; d: [number, number]; span?: [number, number]; /** this cut's own joint (baseplate edges: 'axle', peg and clip where the bed's too thin) */ joint?: Joint;
  /** a cut along the track (the plate-style way): interlocking fingers two studs wide and two deep, on the stud grid, instead of a straight cut */
  comb?: boolean }

const deg = (r: number) => (r * 180) / Math.PI;

/** A cut's frame: u along d from p, v across it (+v: the far side, n, d turned left); place: a joint part made in the frame (the cut along x, the far side +y) put at u. */
export function cutFrame(p: [number, number], d: [number, number]) {
  const n: [number, number] = [-d[1], d[0]];
  const phi = deg(Math.atan2(-n[0], n[1]));               // heading of +y in the cut's frame
  const toLocal = (q: [number, number]): [number, number] => [(q[0] - p[0]) * d[0] + (q[1] - p[1]) * d[1], (q[0] - p[0]) * n[0] + (q[1] - p[1]) * n[1]];
  const at = (u: number, v = 0): [number, number] => [p[0] + u * d[0] + v * n[0], p[1] + u * d[1] + v * n[1]];
  const place = (m: Man, u: number) => T(R(m, [0, 0, phi]), [p[0] + u * d[0], p[1] + u * d[1], 0]);
  return { p, d, n, phi, toLocal, at, place };
}
export type CutFrame = ReturnType<typeof cutFrame>;
/** A rail crossing a cut: [u, its heading in the cut's frame, rail type (-1 left, +1 right, as seen crossing to +v)]. */
export type RailCross = [number, number, number];

/**
 * The joint parts, in a cut's frame, for a piece whose underside is at bz:
 * the peg and clip, the dovetail, the axle hole, the rail-end tongues; what
 * each takes away at the cut (both sides) and adds on each side.
 */
export function jointKit(s: Scad, t: Track, bz: number) {
  const cz0 = 0, ch = PLATE_H - cz0;
  const cube = (size: [number, number, number], at: [number, number, number]) => T(s.cube(size), at);
  const couplerSocket = () => T(s.cylinder(ch + 1, 2.1, 1.9, 32), [0, 0, cz0 - 0.5]);
  const couplerNotch = () => T(t.attachPoly(ch + 1), [-4, -0.11, cz0 - 0.5]);
  const couplerPeg = () => s.difference(s.union([T(s.cylinder(ch, 1, 1, 32), [0, 1.8, cz0]), T(s.cylinder(ch, 1.9, 2.1, 32), [0, 0, cz0])]), [T(s.cylinder(ch + 1, 0.8, 0.8, 32), [0, 0, cz0 - 0.5])]);
  const couplerTab = () => s.difference(T(M(s.extrude(s.polygon([[-0.3, 0], [1.7, 1.9], [6.3, 1.9], [8.3, 0]]), ch), [0, 1, 0]), [-4, 0.3, cz0]), [couplerSocket()]);
  // dovetail (joint 'dovetail'): a tab on the far side reaching back into a
  // socket on the near side, through the bed (and any ballast) from the
  // bottom up; 0.15 mm clear all round
  const tail = (grow: number) => T(s.extrude(s.polygon([[-2.2 - grow, 0.01], [2.2 + grow, 0.01], [3.6 + grow, -4.5 - grow], [-3.6 - grow, -4.5 - grow]]), PLATE_H - bz + (grow ? 2 : 0)), [0, 0, bz - (grow ? 1 : 0)]);
  // axle (joint 'axle'): a LEGO cross-axle hole across the cut, two studs
  // deep each side, in the solid between the underside's hollow and the top
  // of the bed, for an axle (4 studs long) to pin the parts together;
  // 0.1 mm over a LEGO axle's 4.8 x 1.8 cross
  const axleZ = (bz + t.o.studH + 0.2 + PLATE_H) / 2, axleFits = PLATE_H - (bz + t.o.studH + 0.2) >= 5.4;
  const axleHole = () => {
    const cross = s.w.CrossSection.union([s.square([4.9, 1.9], true), s.square([1.9, 4.9], true)]);
    return T(R(T(s.extrude(cross, 2 * 2 * 8 + 0.4), [0, 0, -(2 * 8 + 0.2)]), [90, 0, 0]), [0, 0, axleZ]);
  };
  const cutTongue = (type: number, z0: number) => s.union([
    T(type < 0 ? t.railEndpointLeft() : t.railEndpointRight(), [-4, -4, 0]),
    type < 0 ? T(t.railSupport(3, 3.23 - z0), [-3.3, -3, z0]) : T(t.railSupport(4, 2.08 - z0), [-2.2, -3, z0]),
  ]);
  /** The coupler a cut gets: cut flat, pinned with axles where they fit, or nothing (never a peg and clip: nothing sticks out); an axle joint where the piece is too thin for the hole, peg and clip. */
  const kindOf = (joint: Joint, flatRails: boolean): Joint => (flatRails ? (axleFits ? 'axle' : 'butt') : joint === 'axle' && !axleFits ? 'lego' : joint);
  /** Rail-end tongues where rails cross it (not cut flat, nor butted). */
  const tongues = (joint: Joint, flatRails: boolean) => joint !== 'butt' && !flatRails;
  /** What a coupler takes away at the cut, both sides. */
  const couplerCut = (k: Joint): Man[] => (k === 'lego' ? [couplerNotch(), couplerSocket()] : k === 'dovetail' ? [tail(0.15)] : k === 'axle' ? [axleHole()] : []);
  /** What it adds on side (+1: the far side, -1: the near). */
  const couplerPart = (k: Joint, side: number): Man | undefined => (k === 'lego' ? (side > 0 ? couplerPeg() : R(couplerTab(), [0, 0, 180])) : k === 'dovetail' && side > 0 ? tail(0) : undefined);
  /** How far a coupler reaches: along the cut either way, and across it to the near side and to the far side (mm). */
  const couplerReach = (k: Joint): [number, number, number] => (k === 'lego' ? [4.5, 2.3, 3] : k === 'dovetail' ? [3.8, 4.7, 0.2] : k === 'axle' ? [2.5, 16.3, 16.3] : [0, 0, 0]);
  /** A rail-end tongue joint at a crossing r: what it takes away (both sides), and adds on a side. */
  const tongueCut = (r: RailCross) => R(cube([8, 8, 30], [-4, -4, -1]), [0, 0, r[1]]);
  const tonguePart = (r: RailCross, side: number) => R(cutTongue(side > 0 ? r[2] : -r[2], -0.02), [0, 0, r[1] + (side < 0 ? 180 : 0)]);
  // (the levels an axle hole must be in solid at, and the wall it keeps round it: 1.2 mm, three perimeters)
  const axleWall = 1.2, axleLevels = [axleZ, axleZ + 2.45 + axleWall, axleZ - 2.45 - axleWall];
  return { axleFits, axleZ, axleWall, axleLevels, kindOf, tongues, couplerCut, couplerPart, couplerReach, tongueCut, tonguePart };
}

/**
 * Rails crossing a cut (frame f), between u lo and hi: where each rail of the
 * routes goes from one side to the other, and has rail there (railStrip: a
 * slice through the rails near the cut; none where a loose blade lies on the bed).
 */
export function railCrossings(s: Scad, routes: Route[], G: number, f: CutFrame, railStrip: CS, lo = -Infinity, hi = Infinity, noTongue?: (q: [number, number]) => boolean): RailCross[] {
  const rails: RailCross[] = [];
  routes.forEach((rt) => {
    const len = routeLength(rt), step = 0.5;
    for (const o of [-G, G]) {
      let prev = f.toLocal(railPoint(rt, 0, o))[1];
      for (let sx = step; sx <= len + 1e-9; sx += step) {
        const v = f.toLocal(railPoint(rt, Math.min(sx, len), o))[1];
        if ((prev < 0) !== (v < 0)) {
          let a = sx - step, b = Math.min(sx, len);
          for (let k = 0; k < 40; k++) { const m = (a + b) / 2; if ((f.toLocal(railPoint(rt, m, o))[1] < 0) === (prev < 0)) a = m; else b = m; }
          const q = railPoint(rt, a, o), h = routePose(rt, a)[2] - f.phi, hn = ((h + 540) % 360) - 180, u = f.toLocal(q)[0];
          // (a route crossing to -y: seen from the far side its rails swap)
          const fwd = Math.abs(hn) <= 90;
          // (rail all along where its tongues go, 4 mm each side: not by a loose blade's heel either, a baseplate edge just past it, say)
          const hr = (routePose(rt, a)[2] * Math.PI) / 180, along = (d: number): [number, number] => [q[0] - d * Math.sin(hr), q[1] + d * Math.cos(hr)];
          if (u >= lo && u <= hi && !noTongue?.(q) && [0, -4.5, 4.5].every((d) => s.w.CrossSection.square([1.2, 1.2], true).translate(along(d)).intersect(railStrip).area() > 0.4)) rails.push([u, fwd ? hn : hn + 180, fwd ? Math.sign(o) : -Math.sign(o)]);
        }
        prev = v;
      }
    }
  });
  return rails;
}

/** Is there floor (cross-section fl) all over the square of half-side r round q? */
export const floorAt = (s: Scad, fl: CS, q: [number, number], r: number) => s.w.CrossSection.square([2 * r, 2 * r], true).translate(q).intersect(fl).area() > 4 * r * r * 0.95;

/**
 * Where couplers go along a cut, from u lo to hi in 0.5 mm steps: on each
 * stretch where ok(u), up to 3, from its middle out, at least 16 mm apart.
 */
export function pickSpots(lo: number, hi: number, ok: (u: number) => boolean): number[] {
  const out: number[] = [];
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const mid = (run[0] + run[run.length - 1]) / 2, got: number[] = [];
    for (const u of [...run].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid)))
      if (got.length < 3 && got.every((g2) => Math.abs(g2 - u) >= 16)) got.push(u);
    out.push(...got); run = [];
  };
  for (let u = lo; u <= hi; u += 0.5) { if (ok(u)) run.push(u); else flush(); }
  flush();
  return out;
}

/**
 * Where axles go along a cut (Aaron: at least two across every split, as
 * far apart as they'll go, for the firmest hold): of the spots where ok(u),
 * between each pair of breaks (where other cuts cross this one: each stretch
 * between them joins a different pair of parts), the two furthest apart,
 * then more in the widest gaps while a gap's over 80 mm (10 studs).
 */
export function spreadSpots(lo: number, hi: number, ok: (u: number) => boolean, breaks: number[] = [], clearOfBreak = 4): number[] {
  const out: number[] = [], bs = [lo - 1, ...breaks.filter((b) => b > lo && b < hi).sort((a, b) => a - b), hi + 1];
  for (let k = 0; k + 1 < bs.length; k++) {
    const cand: number[] = [];
    for (let u = k === 0 ? lo : bs[k] + clearOfBreak; u <= (k + 2 === bs.length ? hi : bs[k + 1] - clearOfBreak) + 1e-9; u += 0.5) if (ok(u)) cand.push(u);
    if (!cand.length) continue;
    const got = cand.length > 1 && cand[cand.length - 1] - cand[0] >= 8 ? [cand[0], cand[cand.length - 1]] : [cand[Math.floor(cand.length / 2)]];
    for (;;) {
      got.sort((a, b) => a - b);
      let gi = -1, gw = 80;
      for (let i = 0; i + 1 < got.length; i++) if (got[i + 1] - got[i] > gw) { gw = got[i + 1] - got[i]; gi = i; }
      if (gi < 0 || got.length >= 6) break;
      const mid = (got[gi] + got[gi + 1]) / 2, best = cand.filter((u) => u - got[gi] >= 16 && got[gi + 1] - u >= 16).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
      if (best === undefined) break;
      got.push(best);
    }
    out.push(...got);
  }
  return out;
}

/**
 * Cut body along the lines into cells (each the part of the piece between
 * neighbouring lines), joints added. routes: the piece's routes (for the
 * rails and the bed), in the same frame as body.
 */
/** flatRails: cut flat: the rails straight across with no tongues, and no peg and clip (nothing sticks out, nothing to support). */
/** noTongue: where no rail-end tongue may go (beside loose blades: a set of points' stretch), the rail cut plain there. */
export function cutPiece(s: Scad, t: Track, body: Man, routes: Route[], lines: CutLine[], joint: Joint = 'lego', flatRails = false, noTongue?: (q: [number, number]) => boolean): Man[] {
  if (!lines.length) return [body];
  const G = t.c.railOffset, half = t.c.sleeperLen / 2;
  const kit = jointKit(s, t, body.boundingBox().min[2]);

  // where the piece has floor (a slice through its bed), for the couplers
  const floor = body.slice(1.0);
  // (and where it has rail: none where a loose blade lies on the bed, so no rail-end tongue there)
  const railSl = body.slice(PLATE_H + 4.5);
  // (an axle hole all in solid, at its height: it may pass under a rail, inside the bed)
  // (an axle hole all in solid with a wall round it: at its height, and above and below it by its half-height and a
  // wall more, so it's clear of the ballast's steps (and the hollow underneath) and doesn't break out of them or leave
  // a skin too thin to print over it)
  const axleSls = kit.axleFits ? kit.axleLevels.map((z) => body.slice(z)) : undefined;
  const fb = body.boundingBox(), reachAll = Math.hypot(fb.max[0] - fb.min[0], fb.max[1] - fb.min[1]) + Math.hypot(fb.min[0], fb.min[1]) + Math.hypot(fb.max[0], fb.max[1]);
  // ---- each line's frame, rail crossings and coupler spots ----
  const frames = lines.map((L) => {
    const f = cutFrame(L.p, L.d);
    // rails crossing the line (a comb cut has no rail joints: the rails run along it, or are cut plain where one crosses)
    const band = s.w.CrossSection.square([2 * reachAll, 14], true).rotate(deg(Math.atan2(L.d[1], L.d[0]))).translate(L.p);
    const rails = L.comb ? [] : railCrossings(s, routes, G, f, railSl.intersect(band), -Infinity, Infinity, noTongue);
    // coupler spots: on the bed along the line, 9 clear of every rail, at least 16 apart, up to 3 per stretch of bed
    // (on the bed, and with floor all round the peg on both sides of the cut)
    // (the floor near the line only: testing spots against the whole piece's
    // floor took minutes on a big layout)
    const strip = floor.intersect(band);
    const onBed = (u: number) => {
      const q = f.at(u);
      return routes.some((rt) => Math.abs(routeLat(rt, q)) <= half - 5) && floorAt(s, strip, f.at(u, 2.5), 2.5) && floorAt(s, strip, f.at(u, -2.5), 2.5);
    };
    // (along the whole of the piece the line crosses: by the rails crossing it missed a cut that runs along between tracks, crossing none)
    const ends = [[fb.min[0], fb.min[1]], [fb.max[0], fb.min[1]], [fb.min[0], fb.max[1]], [fb.max[0], fb.max[1]]].map(([x, y]) => (x - L.p[0]) * L.d[0] + (y - L.p[1]) * L.d[1]);
    const us = rails.map((r) => r[0]), lo = L.span ? L.span[0] : Math.min(...us, ...ends) - 1, hi = L.span ? L.span[1] : Math.max(...us, ...ends) + 1;
    // (no couplers on a comb; a flat cut's are axle holes, nothing sticking out, where the bed's thick enough for one)
    const kind = kit.kindOf(L.joint ?? joint, flatRails);
    const W2 = kit.axleWall, axleOk = (u: number) => { const [a, n0, n1] = kit.couplerReach('axle'), b = s.polygon([f.at(u - a - W2, -n0 - W2), f.at(u + a + W2, -n0 - W2), f.at(u + a + W2, n1 + W2), f.at(u - a - W2, n1 + W2)]); return axleSls!.every((sl) => b.intersect(sl).area() > b.area() * 0.99); };
    // (where the other cuts cross this one: its stretches between them join different parts; an axle kept its
    // length and a bit clear of them, or it'd run into the axles across the other cut (and out of its face))
    const breaks = lines.flatMap((L2) => { const cr = L.d[0] * L2.d[1] - L.d[1] * L2.d[0]; return L2 === L || Math.abs(cr) < 1e-9 ? [] : [((L2.p[0] - L.p[0]) * L2.d[1] - (L2.p[1] - L.p[1]) * L2.d[0]) / cr]; });
    const couplers = L.comb || kind === 'butt' ? [] : kind === 'axle'
      // (an axle anywhere there's solid all along it: in the ballast between tracks too, not only by a track)
      ? spreadSpots(lo, hi, (u) => floorAt(s, strip, f.at(u, 2.5), 2.5) && floorAt(s, strip, f.at(u, -2.5), 2.5) && axleOk(u), breaks, kit.couplerReach('axle')[0] + kit.couplerReach('axle')[1] + 2)
      : pickSpots(lo, hi, (u) => onBed(u) && us.every((r) => Math.abs(u - r) >= 9));
    return { L, ...f, rails, couplers, kind: kit.kindOf(L.joint ?? joint, flatRails), tongues: kit.tongues(L.joint ?? joint, flatRails) };
  });

  // material removed at every cut: the rails round each joint, the notches and sockets on the far side
  const removals = s.union(frames.flatMap((f) => [
    ...(f.tongues ? f.rails.map((r) => f.place(kit.tongueCut(r), r[0])) : []),
    ...f.couplers.flatMap((u) => kit.couplerCut(f.kind).map((m) => f.place(m, u))),
  ]));
  const cutBody = s.difference(body, [removals]);

  // cells: by which side of each line a point is
  // cut the piece by each line in turn, keeping the parts that hold any of it
  // (each cut's leftovers, and the parts before it, let go as it goes, each part a solid of its own (kernel.ts flat):
  // on a small bed a big piece has many cuts, and every stage of it kept to the end ran the kernel out of memory)
  let parts: Man[] = [cutBody];
  for (const f of frames) {
    const prev = parts;
    parts = arena(s.w, () => prev.flatMap((m) => (f.L.comb ? combSplit(f, m) : m.splitByPlane([f.n[0], f.n[1], 0], f.n[0] * f.L.p[0] + f.n[1] * f.L.p[1])).filter((c) => c.volume() > 300)).map((c) => flat(s.w, c)), (r) => r); // (not a sliver of print supports)
    for (const m of prev) if (m !== body && !parts.includes(m) && !(m as unknown as { isDeleted(): boolean }).isDeleted()) m.delete();
  }
  // (rather than a plane: the far side's fingers, 16 mm wide and reaching
  // 8 mm either side of the line, their faces on the stud grid; 0.1 mm clear)
  function combSplit(f: typeof frames[number], m: Man): Man[] {
    const bb = m.boundingBox(), reachU = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) + Math.hypot(bb.min[0] - f.L.p[0], bb.min[1] - f.L.p[1]) + 32;
    // (the finger edges at multiples of 16 along the line from the grid's origin: the line's point is on the grid)
    const u0 = -Math.ceil(reachU / 16) * 16, pts: [number, number][] = [[u0, 2000]];
    for (let u = u0, k = Math.round(u0 / 16); u < -u0; u += 16, k++) { const y = ((k % 2) + 2) % 2 === 0 ? 8 : -8; pts.push([u, y], [u + 16, y]); }
    pts.push([-u0, 2000]);
    const far2d = (grow: number) => s.polygon(pts).offset(grow, 'Miter', 10);
    const prism = (grow: number) => f.place(T(s.extrude(far2d(grow), 400), [0, 0, -200]), 0);
    return [s.intersection(m, prism(0)), s.difference(m, [prism(0.1)])];
  }
  const cells: Man[] = [];
  for (const cell of parts) {
    // which side of each line the cell is on (from a point of it off the line), and its joints on the lines it meets
    const mesh = cell.getMesh(), vp = mesh.vertProperties, np = mesh.numProp;
    const sideOf = (f: typeof frames[number]) => {
      const far = f.L.comb ? 9 : 0.05; // (past a comb's fingers)
      for (let k = 0; k < vp.length; k += np) { const v = f.toLocal([vp[k], vp[k + 1]])[1]; if (Math.abs(v) > far) return v > 0 ? 1 : -1; }
      return 1;
    };
    const sides = frames.map(sideOf);
    const cb = cell.boundingBox();
    const inCell = (q: [number, number]) => q[0] >= cb.min[0] - 6 && q[0] <= cb.max[0] + 6 && q[1] >= cb.min[1] - 6 && q[1] <= cb.max[1] + 6
      && frames.every((g2, k) => { const v = g2.toLocal(q)[1]; return Math.abs(v) < 1e-6 || (v > 0) === (sides[k] > 0); });
    const joints: Man[] = [];
    frames.forEach((f, k) => {
      const side = sides[k];
      if (f.tongues) for (const r of f.rails) if (inCell(f.at(r[0]))) joints.push(f.place(kit.tonguePart(r, side), r[0]));
      for (const u of f.couplers) {
        if (!inCell(f.at(u))) continue;
        const part = kit.couplerPart(f.kind, side);
        if (part) joints.push(f.place(part, u));
      }
    });
    // (and nothing loose: bits under a few mm3 a cut left over)
    cells.push(tidy(s, joints.length ? s.union([cell, ...joints]) : cell));
  }
  return cells;
}

/** A part with nothing loose: the bits under a few mm3 a cut left over dropped. */
export function tidy(s: Scad, whole: Man): Man {
  const bits = flat(s.w, whole).decompose(); // (on a flat copy: kernel.ts flat)
  return bits.length > 1 ? s.union(bits.filter((m) => m.volume() > 5)) : whole;
}

/** A straight run of a stepped cut: from p along unit d for len mm. */
export interface Run { p: [number, number]; d: [number, number]; len: number }

/**
 * Joints along a stepped cut (pathsplit.ts): each straight run of the path
 * joined as a straight cut there would be, where there's room: couplers on
 * the bed with floor all round them, clear of the run's ends and of the
 * other runs, 9 mm clear of every rail and 16 mm of each other; rail-end
 * tongues where a rail crosses a run clear of its ends (else that rail is
 * cut plain). Side +1: left of the runs (d turned left). Returns what to
 * take away from body before it's split, and what each side gets.
 */
export function pathJoints(s: Scad, t: Track, body: Man, routes: Route[], runs: Run[], joint: Joint, flatRails: boolean, noTongue?: (q: [number, number]) => boolean) {
  const G = t.c.railOffset, half = t.c.sleeperLen / 2;
  const kit = jointKit(s, t, body.boundingBox().min[2]);
  const kind = kit.kindOf(joint, flatRails), tongues = kit.tongues(joint, flatRails), [ra, rn0, rn1] = kit.couplerReach(kind);
  const floor = body.slice(1.0), railSl = body.slice(PLATE_H + 4.5);
  // (an axle hole all in solid, at its height: not into a hollow, a pocket, or another cut's hole)
  const solids = kind === 'axle' ? kit.axleLevels.map((z) => body.slice(z)) : [floor], wall = kind === 'axle' ? kit.axleWall : 1;
  const fs = runs.map((r) => ({ ...cutFrame(r.p, r.d), len: r.len }));
  // (each run as points a mm apart, to keep the joints clear of the other runs)
  const pts = fs.map((f) => Array.from({ length: Math.ceil(f.len) + 1 }, (_, k) => f.at(Math.min(k, f.len))));
  /** A joint's box at u on run k (a mm along it either way, n0 to the near side, n1 to the far): within the run, clear of its ends and the other runs by a mm and a half. */
  const clear = (k: number, u: number, a: number, n0: number, n1: number) => u - a >= 1.5 && u + a <= fs[k].len - 1.5
    && pts.every((ps, j) => j === k || ps.every((q) => { const [lu, lv] = fs[k].toLocal(q); return Math.abs(lu - u) > a + 1.5 || lv < -n0 - 1.5 || lv > n1 + 1.5; }));
  const box = (k: number, u: number, a: number, n0: number, n1: number) => s.polygon([fs[k].at(u - a, -n0), fs[k].at(u + a, -n0), fs[k].at(u + a, n1), fs[k].at(u - a, n1)]);
  const filled = (cs: CS, k: number, u: number, a: number, n0: number, n1: number) => { const b = box(k, u, a, n0, n1); return b.intersect(cs).area() > b.area() * 0.99; };
  const cut: Man[] = [], add: [Man[], Man[]] = [[], []];
  let couplers = 0, nTongues = 0;
  // the rails crossing each run (where they have rail: none under a loose blade)
  const rails = fs.map((f) => {
    const band = s.polygon([f.at(-10, -7), f.at(f.len + 10, -7), f.at(f.len + 10, 7), f.at(-10, 7)]);
    return railCrossings(s, routes, G, f, railSl.intersect(band), 0, f.len, noTongue);
  });
  const railPts = rails.flatMap((rs, k) => rs.map((r) => fs[k].at(r[0])));
  if (tongues) rails.forEach((rs, k) => {
    for (const r of rs) {
      // (the joint's 8 mm square, turned to the rail: how far it reaches along the run and across it)
      const h = (r[1] * Math.PI) / 180, e = 4 * (Math.abs(Math.cos(h)) + Math.abs(Math.sin(h)));
      // (too near a turn, or another rail's joint (where rails meet at a crossing): the rail cut plain)
      const q = fs[k].at(r[0]);
      if (!clear(k, r[0], e, e, e) || railPts.some((p) => p !== q && Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6 && Math.hypot(p[0] - q[0], p[1] - q[1]) < 12)) continue;
      cut.push(fs[k].place(kit.tongueCut(r), r[0]));
      add[0].push(fs[k].place(kit.tonguePart(r, 1), r[0])); add[1].push(fs[k].place(kit.tonguePart(r, -1), r[0]));
      nTongues++;
    }
  });
  const got: [number, number][] = [];
  const place = (k: number, u: number) => {
    const q = fs[k].at(u);
    got.push(q); couplers++;
    cut.push(...kit.couplerCut(kind).map((m) => fs[k].place(m, u)));
    for (const [i, side] of [[0, 1], [1, -1]] as const) { const m = kit.couplerPart(kind, side); if (m) add[i].push(fs[k].place(m, u)); }
  };
  if (kind === 'axle') {
    // (axles as far apart as they'll go over the whole cut: the two furthest apart, then each next the furthest from those taken, while 64 mm clear)
    const cand: [number, number, [number, number]][] = [];
    fs.forEach((f, k) => {
      // (anywhere there's solid all along it: in the ballast between tracks too, not only by a track)
      const ok = (u: number) => clear(k, u, ra, rn0, rn1)
        && floorAt(s, floor, f.at(u, 2.5), 2.5) && floorAt(s, floor, f.at(u, -2.5), 2.5) && solids.every((sl) => filled(sl, k, u, ra + wall, rn0 + wall, rn1 + wall));
      for (let u = 0; u <= f.len + 1e-9; u += 1) if (ok(u)) cand.push([k, u, f.at(u)]);
    });
    const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const taken: typeof cand = [];
    if (cand.length) {
      let best: [number, number] = [0, 0], bd = -1;
      for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) { const dd = dist(cand[i][2], cand[j][2]); if (dd > bd) { bd = dd; best = [i, j]; } }
      taken.push(cand[best[0]]); if (bd >= 8) taken.push(cand[best[1]]);
      while (taken.length < 6) {
        let pick = -1, pd = 64;
        cand.forEach((c, i) => { const dd = Math.min(...taken.map((t2) => dist(t2[2], c[2]))); if (dd > pd) { pd = dd; pick = i; } });
        if (pick < 0) break;
        taken.push(cand[pick]);
      }
    }
    for (const [k, u] of taken) place(k, u);
  } else if (kind !== 'butt') fs.forEach((f, k) => {
    const ok = (u: number) => {
      const q = f.at(u);
      return railPts.every((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) >= 9) && clear(k, u, ra, rn0, rn1)
        && routes.some((rt) => Math.abs(routeLat(rt, q)) <= half - 5) && floorAt(s, floor, f.at(u, 2.5), 2.5) && floorAt(s, floor, f.at(u, -2.5), 2.5)
        && solids.every((sl) => filled(sl, k, u, ra + wall, rn0 + wall, rn1 + wall));
    };
    for (const u of pickSpots(0, f.len, ok)) {
      const q = f.at(u);
      if (got.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 16)) continue;
      place(k, u);
    }
  });
  return { cut: cut.length ? s.union(cut) : undefined, add, couplers, tongues: nTongues };
}
