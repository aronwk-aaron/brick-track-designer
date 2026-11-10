import { describe, expect, it } from 'vitest';
import { forFingers } from '../src/app/hints';

describe('the plan hint for a finger', () => {
  it('says tap for click', () => {
    expect(forFingers('Click a grid point to start a track')).toBe('Tap a grid point to start a track');
    expect(forFingers('Click to carry the track on · drag to reshape it')).toBe('Tap to carry the track on · drag to reshape it');
  });
  it('drops the keys and the right button', () => {
    expect(forFingers('Click to lay track · keep clicking to go on · Esc or right-click stops · right-drag pans')).toBe('Tap to lay track · keep tapping to go on · tap Select to stop · two fingers pan and zoom');
    expect(forFingers('Release to reshape · drop on another end to join · Esc puts it back')).toBe('Release to reshape · drop on another end to join');
    expect(forFingers("Can't bend the track this way: release to keep the last good shape, Esc puts it back")).toBe("Can't bend the track this way: release to keep the last good shape");
    expect(forFingers('Click a track to select it, drag it to move it · drag an end to reshape it · D to draw')).toBe('Tap a track to select it, drag it to move it · drag an end to reshape it · tap Draw to lay track');
    expect(forFingers('No track yet: press D (or ✎ Draw) to lay some')).toBe('No track yet: tap ✎ Draw to lay some');
  });
});
