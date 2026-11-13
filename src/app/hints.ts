// The plan's hint line says what a press would do. It's written for a mouse and keyboard; for a finger the same line says
// tap, not click, and leaves out the keys (there's no Esc, right button or D on a phone).
export function forFingers(hint: string): string {
  return hint
    .replace(/^Click \(or Enter\) to put it down/, 'Drag it into place (a tap moves it there), then Put down')
    .replace(' · arrows move it · R / Shift+R turn it · M mirrors it', ' · the bar below turns, mirrors and nudges it')
    .replace(' · Enter ends it · Backspace takes the last back', ' · Done ends it')
    .replace(' · [ ] pick another · Tab its handles · Enter lays track on', '')
    .replace(' · hold Alt for no snapping', '')
    .replace(/hold Alt to (?:move (?:this|this one|the selected ones) alone|leave (?:them|it))/, 'Move alone (below) leaves what is joined')
    .replace(' · Esc cancels', '')
    .replace(' · Esc or right-click stops · right-drag pans', ' · drag to aim, lift to lay · hold still or tap Stop to end · two fingers pan and zoom')
    .replace(/(:|,| ·) Esc puts it back/, '')
    .replace(' · D to draw', ' · tap Draw to lay track · hold on empty ground, then drag, to box-select')
    .replace('press D (or ✎ Draw)', 'tap ✎ Draw')
    .replace('keep clicking', 'keep tapping')
    .replace(/\bClick\b/g, 'Tap')
    .replace(/\bclick\b/g, 'tap')
    .replace(/\bright-click\b/g, 'tap');
}
