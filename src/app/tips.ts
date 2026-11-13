// A touch screen has no hover, so a tip (an element's title) never shows there. Here a finger (or a pen) held on anything with
// a tip shows it in a bubble, and the press then does nothing else; a tap on something with a tip that does nothing itself
// (a label's words, a note) shows it too. A mouse is left to the browser's own tips.
const HOLD_MS = 500, SHOW_MS = 7000;
/** What a tap works itself: its tip is only shown for a held finger. */
const ACTS = 'button, a, input, select, textarea, summary, [role=button], [role=menuitem], [role=tab], label, canvas, .tcard';

export function touchTips() {
  const tip = document.createElement('div');
  tip.id = 'touchtip'; tip.setAttribute('role', 'tooltip'); tip.popover = 'manual'; tip.hidden = true;
  document.body.append(tip);
  let hold: number | undefined, gone: number | undefined, at: [number, number] = [0, 0], swallow = false;
  const hide = () => { clearTimeout(gone); if (tip.hidden) return; tip.hidden = true; try { tip.hidePopover(); } catch { /* (not shown) */ } };
  const show = (el: HTMLElement, text: string) => {
    tip.textContent = text; tip.hidden = false;
    try { tip.hidePopover(); tip.showPopover(); } catch { /* (no popover: shown in place) */ }
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    const y = r.top - h - 8 >= 8 ? r.top - h - 8 : Math.min(r.bottom + 8, innerHeight - h - 8);
    tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.style.margin = '0';
    clearTimeout(gone); gone = window.setTimeout(hide, SHOW_MS);
  };
  const titled = (t: EventTarget | null) => {
    const el = t instanceof Element ? t.closest<HTMLElement>('[title]') : null;
    return el && el.title.trim() && el.id !== 'track' ? el : null;
  };
  addEventListener('pointerdown', (e) => {
    hide(); clearTimeout(hold); swallow = false;
    if (e.pointerType === 'mouse') return;
    const el = titled(e.target);
    if (!el) return;
    at = [e.clientX, e.clientY];
    hold = window.setTimeout(() => { hold = undefined; swallow = true; show(el, el.title); navigator.vibrate?.(10); }, HOLD_MS);
  }, true);
  addEventListener('pointermove', (e) => { if (hold !== undefined && Math.hypot(e.clientX - at[0], e.clientY - at[1]) > 10) { clearTimeout(hold); hold = undefined; } }, true);
  const up = () => { clearTimeout(hold); hold = undefined; };
  addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
  // (the click after a held finger: only the tip, not the button pressed as well; a plain tap on a tip that does nothing itself: the tip)
  addEventListener('click', (e) => {
    if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); return; }
    if ((e as PointerEvent).pointerType === 'mouse' || !matchMedia('(pointer: coarse)').matches) return;
    const el = titled(e.target);
    if (el && !(e.target as Element).closest(ACTS)) show(el, el.title);
  }, true);
  // (a held finger is a right click too, on some tablets: no menu over the tip)
  addEventListener('contextmenu', (e) => { if (swallow || !tip.hidden) e.preventDefault(); }, true);
  addEventListener('scroll', hide, true);
}
