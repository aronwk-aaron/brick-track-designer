// The plan's hint line says what a press would do. It's written for a mouse and keyboard; for a finger the same line says
// tap, not click, and leaves out the keys (there's no Esc, right button or D on a phone).
export function forFingers(hint: string): string {
  return hint
    .replace(' · hold Alt for no snapping', '')
    .replace(' · Esc cancels', '')
    .replace(' · Esc or right-click stops · right-drag pans', ' · tap Select to stop · two fingers pan and zoom')
    .replace(/(:|,| ·) Esc puts it back/, '')
    .replace(' · D to draw', ' · tap Draw to lay track')
    .replace('press D (or ✎ Draw)', 'tap ✎ Draw')
    .replace('keep clicking', 'keep tapping')
    .replace(/\bClick\b/g, 'Tap')
    .replace(/\bclick\b/g, 'tap')
    .replace(/\bright-click\b/g, 'tap');
}
