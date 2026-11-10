// The template browser: a dialog of cards (a plan picture, a name, what it is and its size), in sections, with search,
// filters, stars and the last ones used. What each card says, its sections and its filters come from templatecatalog.ts;
// this only shows them. Pictures are drawn when a card scrolls into view.
import { TEMPLATES } from './design';
import {
  GAUGES, KIND_LABEL, type Card, type Filters, type Gauge, type Kind, type PlanPicture, type System,
  cardFor, cardsOf, catalog, countOf, describe, filterCards, filtering, kindsOf, noFilters, planPicture, radiiOf, sectionsOf,
} from './templatecatalog';

const STARS = 'btd-template-stars', RECENT = 'btd-template-recent', RECENT_MAX = 8;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const readList = (key: string): string[] => {
  try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
};
const writeList = (key: string, v: string[]) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage off: fine */ } };

const NS = 'http://www.w3.org/2000/svg';
const num = (v: number) => String(Math.round(v * 100) / 100);
/** A picture's svg: a wide stroke for the track, thin lines for the rails (a monorail: one beam). y is up on the plan, down in svg. */
export function pictureSvg(p: PlanPicture): string {
  const [x0, y0, x1, y1] = p.box, pad = 3;
  const path = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${num(x)} ${num(-y)}`).join('L')}`;
  const bits: string[] = [];
  for (const l of p.lines) {
    if (l.mono) bits.push(`<path class="beam" stroke-width="2" d="${path(l.centre)}"/>`);
    else bits.push(`<path class="bed" stroke-width="${num(l.gauge + 2)}" d="${path(l.centre)}"/>`);
  }
  for (const l of p.lines) for (const r of l.rails) bits.push(`<path class="rail" stroke-width="0.8" d="${path(r)}"/>`);
  return `<svg xmlns="${NS}" viewBox="${num(x0 - pad)} ${num(-y1 - pad)} ${num(x1 - x0 + 2 * pad)} ${num(y1 - y0 + 2 * pad)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${bits.join('')}</svg>`;
}

/**
 * Sets the browser up. pick(name) puts the template on the plan, asking first if the design has changes in no file; it
 * says whether it did (the browser then closes; if not, it stays open).
 */
export function initTemplateBrowser(pick: (name: string) => Promise<boolean>) {
  const dlg = $<HTMLDialogElement>('tpl-dlg'), body = $('tpl-body'), search = $<HTMLInputElement>('tpl-search');
  const chipsEl = $('tpl-chips'), countEl = $('tpl-count'), clearBtn = $<HTMLButtonElement>('tpl-clear');
  const filtersBtn = $<HTMLButtonElement>('tpl-filters');
  // (on a phone the filters fold away behind a button: they'd fill the screen)
  filtersBtn.addEventListener('click', () => { const open = !chipsEl.classList.contains('open'); chipsEl.classList.toggle('open', open); filtersBtn.setAttribute('aria-expanded', String(open)); });
  let infos = catalog(), cards: Card[] = [], built = false;
  let filters: Filters = noFilters();
  let stars: string[] = [], recent: string[] = [];
  let observer: IntersectionObserver | undefined;
  const pictures = new Map<string, string>();

  // ---- what's kept: names that are no longer templates are dropped
  const keep = (names: string[]) => [...new Set(names.flatMap((n) => { const c = cardFor(infos, n); return c ? [c.name] : []; }))];
  const load = () => { stars = keep(readList(STARS)); recent = keep(readList(RECENT)).slice(0, RECENT_MAX); };

  // ---- filter chips
  type Axis = 'kinds' | 'gauges' | 'systems' | 'radii';
  const chip = (axis: Axis, value: Kind | Gauge | System | number, label: string) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.axis = axis; b.dataset.value = String(value); b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      const set = new Set(filters[axis] as ReadonlySet<unknown>);
      if (!set.delete(value)) set.add(value);
      filters = { ...filters, [axis]: set };
      syncChips(); render();
    });
    return b;
  };
  function buildChips() {
    chipsEl.replaceChildren();
    const row = (title: string, chips: HTMLElement[]) => {
      if (chips.length < 2) return;
      const r = document.createElement('div'); r.className = 'crow'; r.setAttribute('role', 'group'); r.setAttribute('aria-label', title);
      const b = document.createElement('b'); b.textContent = title; r.append(b, ...chips); chipsEl.append(r);
    };
    row('Kind', kindsOf(cards).map((k) => chip('kinds', k, KIND_LABEL[k])));
    row('Gauge', GAUGES.filter((g) => cards.some((c) => c.gauge === g)).map((g) => chip('gauges', g, ({ standard: 'Standard', narrow: 'Narrow', dual: 'Dual', mixed: 'Mixed', none: '' } as Record<Gauge, string>)[g])));
    row('Track', (['train', 'monorail'] as const).filter((s) => cards.some((c) => c.system === s)).map((s) => chip('systems', s, s === 'train' ? 'Train' : 'Monorail')));
    row('Radius', radiiOf(cards).map((r) => chip('radii', r, `R${r}`)));
  }
  function syncChips() {
    for (const b of chipsEl.querySelectorAll<HTMLButtonElement>('button')) {
      const set = filters[b.dataset.axis as Axis] as ReadonlySet<unknown>;
      b.setAttribute('aria-pressed', String([...set].some((v) => String(v) === b.dataset.value)));
    }
    clearBtn.disabled = !filtering(filters);
    const on = filters.kinds.size + filters.gauges.size + filters.systems.size + filters.radii.size;
    filtersBtn.textContent = on ? `Filters (${on})` : 'Filters';
  }

  // ---- cards
  function drawPicture(el: HTMLElement) {
    if (el.firstChild) return;
    const name = el.dataset.name!;
    let svg = pictures.get(name);
    if (svg === undefined) { svg = pictureSvg(planPicture(TEMPLATES[name])); pictures.set(name, svg); }
    el.innerHTML = svg;
  }
  const choose = async (name: string) => {
    if (!(await pick(name))) return;
    const c = cardFor(infos, name);
    if (c) { recent = [c.name, ...recent.filter((n) => n !== c.name)].slice(0, RECENT_MAX); writeList(RECENT, recent); }
    dlg.close();
  };
  function cardEl(c: Card): HTMLElement {
    const el = document.createElement('div'); el.className = `tcard${c.twin ? '' : ' single'}`; el.dataset.card = c.name;
    const star = document.createElement('button'); star.type = 'button'; star.className = 'tstar'; star.textContent = '★';
    const starred = stars.includes(c.name);
    star.setAttribute('aria-pressed', String(starred)); star.title = starred ? 'Starred: press to take the star off' : 'Star it: it goes in the Starred section at the top';
    star.setAttribute('aria-label', `Star ${c.title}`);
    star.addEventListener('click', (e) => {
      e.stopPropagation();
      stars = stars.includes(c.name) ? stars.filter((n) => n !== c.name) : [c.name, ...stars];
      writeList(STARS, stars);
      const key = c.name, at = [...body.querySelectorAll<HTMLElement>('.tstar')].indexOf(star);
      render();
      // (the sections moved under the star: the focus goes to the same card's star)
      const again = body.querySelector<HTMLElement>(`.tcard[data-card="${CSS.escape(key)}"] .tstar`) ?? body.querySelectorAll<HTMLElement>('.tstar')[at];
      again?.focus({ preventScroll: true });
    });
    const pic = document.createElement('div'); pic.className = 'tpic'; pic.dataset.name = c.name;
    const name = document.createElement('div'); name.className = 'tname'; name.textContent = c.title;
    const sub = document.createElement('div'); sub.className = 'tsub'; sub.textContent = describe(c);
    const act = document.createElement('div'); act.className = 'tact';
    const button = (label: string, tpl: string, aria: string) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tpick'; b.textContent = label; b.dataset.template = tpl; b.setAttribute('aria-label', aria); b.title = aria;
      b.addEventListener('click', (e) => { e.stopPropagation(); void choose(tpl); });
      return b;
    };
    if (c.twin) act.append(button('Left', c.hand === 'left' ? c.name : c.twin, `${c.title}, left hand`), button('Right', c.hand === 'left' ? c.twin : c.name, `${c.title}, right hand`));
    else { act.append(button('Use', c.name, `Use ${c.name}`)); el.addEventListener('click', () => void choose(c.name)); }
    el.append(star, pic, name, sub, act);
    if (observer) observer.observe(pic); else drawPicture(pic);
    return el;
  }

  // ---- the whole list, drawn again as the search or a filter changes
  function render() {
    observer?.disconnect();
    body.replaceChildren();
    const shown = filterCards(cards, filters);
    const total = infos.length, n = shown.reduce((a, c) => a + countOf(c), 0);
    countEl.textContent = `${n} of ${total}`;
    clearBtn.disabled = !filtering(filters);
    if (!shown.length) {
      const e = document.createElement('div'); e.id = 'tpl-empty';
      e.textContent = 'No template fits the search and the filters. Press Clear to start again.';
      body.append(e);
      return;
    }
    const section = (id: string, title: string, cs: Card[], parent?: string, lastParent?: { v?: string }) => {
      if (parent && lastParent && lastParent.v !== parent) { const h = document.createElement('h2'); h.textContent = parent; body.append(h); lastParent.v = parent; }
      const h = document.createElement('h3'); h.id = `tpl-s-${id.replace(/\W+/g, '-')}`;
      h.append(title); const c = document.createElement('span'); c.className = 'n'; c.textContent = String(cs.length); h.append(c);
      const g = document.createElement('div'); g.className = 'grid'; g.setAttribute('role', 'group'); g.setAttribute('aria-labelledby', h.id);
      for (const x of cs) g.append(cardEl(x));
      body.append(h, g);
    };
    if (!filtering(filters)) {
      const byName = (names: string[]) => names.flatMap((nm) => cards.find((c) => c.name === nm) ?? []);
      if (stars.length) section('starred', 'Starred', byName(stars));
      if (recent.length) section('recent', 'Recent', byName(recent));
    }
    const last: { v?: string } = {};
    for (const s of sectionsOf(shown)) section(s.id, s.title, s.cards, s.parent, last);
  }

  // ---- the keys: arrows move between cards (Tab goes through every button)
  function firstOf(card: Element) { return card.querySelector<HTMLElement>('.tpick'); }
  body.addEventListener('keydown', (e) => {
    const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    const cur = (e.target as HTMLElement).closest('.tcard');
    if (!dir || !cur || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    const all = [...body.querySelectorAll('.tcard')], r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best: Element | undefined, score = Infinity;
    for (const c of all) {
      if (c === cur) continue;
      const r = c.getBoundingClientRect(), dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const along = dir[0] ? dx * dir[0] : dy * dir[1], across = dir[0] ? Math.abs(dy) : Math.abs(dx);
      if (along <= 4) continue;
      const s = across * 4 + along;   // (the nearest in line first)
      if (s < score) { score = s; best = c; }
    }
    // (past the first or last row of a sideways move: the previous or next card in the list)
    if (!best && dir[0]) best = all[all.indexOf(cur) + dir[0]];
    if (best) { const t = firstOf(best); t?.focus(); t?.scrollIntoView({ block: 'nearest' }); }
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { const t = body.querySelector<HTMLElement>('.tpick'); if (t) { e.preventDefault(); t.focus(); } }
    else if (e.key === 'Escape' && search.value) { e.stopPropagation(); e.preventDefault(); search.value = ''; filters = { ...filters, query: '' }; render(); }
  });
  search.addEventListener('input', () => { filters = { ...filters, query: search.value }; syncChips(); render(); });
  clearBtn.addEventListener('click', () => { filters = noFilters(); search.value = ''; syncChips(); render(); search.focus(); });

  // ---- open and close
  $('tpl-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { const r = dlg.getBoundingClientRect(); if (e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dlg.close(); });
  $('templates-open').addEventListener('click', () => {
    if (dlg.open) return;
    if (!built) {
      built = true; infos = catalog(); cards = cardsOf(infos); buildChips();
      if (typeof IntersectionObserver !== 'undefined') observer = new IntersectionObserver((es) => { for (const en of es) if (en.isIntersecting) { drawPicture(en.target as HTMLElement); observer!.unobserve(en.target); } }, { root: body, rootMargin: '200px' });
    }
    load(); syncChips(); render();
    dlg.showModal();
    body.scrollTop = 0;
    // (a keyboard is only brought up on a phone by touching the box)
    if (matchMedia('(pointer: fine)').matches) { search.focus(); search.select(); } else $('tpl-close').focus();
  });
}
