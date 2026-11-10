// The snap clamp (throwAction 'snap'): what keeps the points set, and lets a train trail through rigid blades.
//
// A toggle, as a light switch's: two short links, one each side of the slider along the track, each pressed
// between a knife edge on the slider (a post of diamond section, its two points along the track) and a knife seat
// on a spring. With the slider in the middle of its travel the links stand square to it, squeezed most; either side
// of that they lean, and their push has a part along the slider that carries it on to its end and holds it there.
// One link each side, so their pushes across the slider cancel: it isn't pressed on its tunnel's side.
//
// The spring is one flat C: a spine along the track beside the slider's post, an arm across at each end, a finger
// back in from each arm's end to its link. The links' push bends the spine all along (the arm's length is its
// lever), so the spring is soft for its size and the links are squeezed by a millimetre or so, not a few tenths:
// a print a little out changes the force by a fifth, not all of it. (The over-centre spring, a meander each way
// from a ring on the slider's post to a ring on a pin, has more slack in its rings, 0.3 at each, than it's squeezed
// by, 0.35: as drawn it's loose at both ends. Squeezed harder it would do no better: its halves are one with their
// middle ring, so each must bend as the post moves, and that takes more than their push along the slider gives
// (3.5 N of squeeze each to break even, 1% strain and more); and the rings turn on pins 4 across, where a friction
// of 0.3 can lean their push a millimetre off line, as far as the post moves. Rings on pins can't be made to work
// at this travel: switch/base.ts ocOn.)
//
// The links rock on knife edges (a point in a wider notch), so nothing slides as they lean: no friction to lose
// the push to. Each link is a ring round its finger's end, which is a bar across (it can't come out through the
// ring's opening): the clamp prints as one part, flat, its links loose in it. It lies in a pocket in the bed
// between the blades, over two bosses that keep it in place; it's sprung open over the slider's post. Sprung
// blades' plates leave no room between them: there it lies on the lever's arm, between the stock rail and the
// lever, the same way.
//
// Units: mm, N, MPa. Its own frame: the origin where the post is in the middle of its travel, u along the slider
// (the way it moves), w along the track; the spine at u = -arm.

export type P2 = [number, number];

export const SNAP = {
  /** the plastic's stiffness the spring's worked out for (PLA; PETG's about 2000: the force less by a third) */
  E: 3000,
  /** each link's push at rest (the slider at either end) */
  F: 0.6,
  /** the spring: its beams' width (in plan, the way they bend) and its height; the arm's length (spine to the links' line) */
  t: 0.8, h: 2, arm: 4.7,
  /** the fingers' width, their necks', and the bar across each one's end (half its length; how deep along the finger) */
  fingerW: 1.6, neckW: 0.8, tipHw: 1.7, tipD: 1.1,
  /** the knife seat in the bar's end: how deep, and the notches' half angle (the knives' is 45) */
  seat: 0.3, vHalf: 70,
  /** a link: its ring (inside radius, wall), its nose to the slider's post (half width), its least length (knife to knife) and the most it leans, degrees */
  ringIn: 2.5, ringWall: 0.8, noseHw: 0.8, linkMin: 4.5, rock: 15,
  /** as printed: the links turned this far each way (their noses clear of each other), and off their knives by this much */
  printRock: 17, printGap: 0.4,
  /** the slider's post: a diamond, this far from its middle to each point */
  knife: 1.1,
  /** the arms carried on past the fingers, out beyond the links' rings by this much: something to hold it by, and the links inside its outline */
  past: 0.2,
  /** the bosses on the bed, in the corners between spine, arm and finger: their snap caps' overhang and height */
  capOver: 0.4, capH: 0.6,
};

/** A clamp's sizes for a slider's travel T (mm) and the clearance c. */
export function snapGeo(T: number, c: number) {
  const S = SNAP, s = T / 2, EI = (S.E * S.h * S.t ** 3) / 12;
  // (the links long enough to lean no more than rock at the travel's ends)
  const link = Math.max(S.linkMin, s / Math.sin((S.rock * Math.PI) / 180));
  /** where a link's knife on its finger is, along the track from the slider's line, with the post s0 off the middle */
  const yHead = (s0: number) => S.knife + Math.sqrt(link * link - s0 * s0);
  const ringOut = S.ringIn + S.ringWall, yEnd = yHead(s);
  // (the bosses: in the bay between the spine and each finger, the clearance each side)
  const bossR = (S.arm - S.t / 2 - S.fingerW / 2) / 2 - c;
  // (half the spine: out past the link's ring and the boss beside the finger)
  const half = yEnd + ringOut + c + 2 * bossR + 2 * c + S.t / 2;
  // (how far each finger's knife gives per newton: the arm as a cantilever, and the spine's bend turning it)
  const give = (S.arm ** 3 / 3 + S.arm ** 2 * half) / EI;
  const squeeze = S.F * give, fMid = S.F * (1 + (yHead(0) - yEnd) / squeeze);
  const strain = (f: number) => (f * S.arm * (S.t / 2)) / EI;
  return {
    T, link, yHead, yEnd, ringOut, bossR, half, EI, give,
    /** how far each link's squeezed at rest; the push with the slider in the middle */
    squeeze, fMid,
    /** the spine's strain at rest and in the middle (it's the same all along it) */
    strainRest: strain(S.F), strainMid: strain(fMid),
    /** what holds the slider at each end (N), and so what pushes it over */
    hold: (2 * S.F * s) / link,
    boss: [-S.arm + S.t / 2 + c + bossR, half - S.t / 2 - c - bossR] as P2,
    /** the room it needs: across (from the spine's back to the links' rings, or the post at its travel's end) and along the track, each way from the post */
    back: S.arm + S.t / 2, front: Math.max(ringOut + S.past, s + S.knife), along: half + S.t / 2,
  };
}
export type SnapGeo = ReturnType<typeof snapGeo>;

/**
 * The spring's upper half (the lower is its mirror): its beams' middle line from the spine's middle to the arm's
 * end, then where its finger ends, at its link's knife. on: sprung open on the slider's post, s0 from the middle of
 * its travel (as designed: the spine straight). Else as printed, free: the bend the links' push takes out of it
 * put in, backwards, all along (the spine bowed, the arms turned in).
 */
export function snapHalf(g: SnapGeo, on: number | undefined): { line: P2[]; head: P2; dir: P2 } {
  const S = SNAP;
  if (on !== undefined) return { line: [[-S.arm, 0], [-S.arm, g.half], [0, g.half]], head: [0, g.yHead(on)], dir: [0, -1] };
  let th = Math.PI / 2, q: P2 = [-S.arm, 0];
  const line: P2[] = [q], go = (len: number, n: number, moment: (at: number) => number) => {
    for (let k = 0; k < n; k++) {
      const ds = len / n;
      th -= (moment((k + 0.5) * ds) / g.EI) * ds;
      q = [q[0] + ds * Math.cos(th), q[1] + ds * Math.sin(th)];
      line.push(q);
    }
  };
  go(g.half, 24, () => S.F * S.arm);
  th -= Math.PI / 2;
  go(S.arm, 10, (at) => S.F * (S.arm - at));
  th -= Math.PI / 2;
  const len = g.half - g.yEnd, dir: P2 = [Math.cos(th), Math.sin(th)];
  return { line, head: [q[0] + len * dir[0], q[1] + len * dir[1]], dir };
}
