import { describe, expect, it } from 'vitest';
import { forFingers } from '../src/app/hints';

describe('the plan hint for a finger', () => {
  it('says tap for click', () => {
    expect(forFingers('Click a grid point to start a track')).toBe('Tap a grid point to start a track');
    expect(forFingers('Click to carry the track on · drag to reshape it')).toBe('Tap to carry the track on · drag to reshape it');
  });
  it('drops the keys and the right button', () => {
    expect(forFingers('Click to lay track · keep clicking to go on · Esc or right-click stops · right-drag pans')).toBe('Tap to lay track · keep tapping to go on · drag to aim, lift to lay · hold still or tap Stop to end · two fingers pan and zoom');
    expect(forFingers('Release to reshape · drop on another end to join · Esc puts it back')).toBe('Release to reshape · drop on another end to join');
    expect(forFingers("Can't bend the track this way: release to keep the last good shape, Esc puts it back")).toBe("Can't bend the track this way: release to keep the last good shape");
    expect(forFingers('Click a track to select it, drag it to move it · drag an end to reshape it · D to draw')).toBe('Tap a track to select it, drag it to move it · drag an end to reshape it · tap Draw to lay track · hold on empty ground, then drag, to box-select');
    expect(forFingers('Click (or Enter) to put it down · arrows move it · R / Shift+R turn it · M mirrors it · hold Alt for no snapping · Esc cancels')).toBe('Drag it into place (a tap moves it there), then Put down · the bar below turns, mirrors and nudges it');
    expect(forFingers('No track yet: press D (or ✎ Draw) to lay some')).toBe('No track yet: tap ✎ Draw to lay some');
  });
  it('points a selected cut, path, sleeper or rail edit at the touch bar, not at keys', () => {
    expect(forFingers('Cut across the track selected · drag it along the track, or press an arrow key (a stud; Shift: eight) · Delete removes it'))
      .toBe("Cut across the track selected · drag it along the track, or with the bar's arrows · Delete (on the bar) removes it");
    expect(forFingers('Cut path selected · drag a corner or the path · arrow keys move it a stud · Delete removes it · its joint is on its card'))
      .toBe("Cut path selected · drag a corner or the path · the bar's arrows move it a stud · Delete (on the bar) removes it · its joint is on its card");
    expect(forFingers('Sleeper selected · drag it along the track, or press an arrow key · Delete takes it out · longer, turned, without studs: on its card'))
      .toBe("Sleeper selected · drag it along the track, or with the bar's arrows · Delete (on the bar) takes it out · longer, turned, without studs: on its card");
    for (const h of ['2 cuts selected · drag one to move them all, or press an arrow key · Delete takes them out · Esc lets go']) expect(forFingers(h)).not.toMatch(/arrow key|Esc/);
  });
});

import { segsStuds } from '../src/app/canvas';
describe('the length of segments', () => {
  it('adds straights and arcs', () => {
    expect(segsStuds([{ kind: 'straight', studs: 16 }, { kind: 'curve', radius: 40, angle: 90 }])).toBeCloseTo(16 + 20 * Math.PI, 6);
    expect(segsStuds([{ kind: 'curve', radius: 24, angle: -180 }])).toBeCloseTo(24 * Math.PI, 6);
  });
});
