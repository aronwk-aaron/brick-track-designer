// The template browser: a dialog of cards (a plan picture, a name, what it is and its size), in sections, with search,
// filters, stars and the last ones used. What each card says, its sections and its filters come from templatecatalog.ts;
// this only shows them. Pictures are drawn when a card scrolls into view.
import { type Design, TEMPLATES } from './design';
import { deleteMine, importMine, listMine, type Mine, renameMine, type StorageLike, usedText } from './mytemplates';
import {
  GAUGES, KIND_LABEL, RANGES, type Range, type Card, type Filters, type Gauge, type Kind, type PlanPicture, type System,
  buildCatalog, cardFor, cardsOf, catalog, countOf, describe, filterCards, filtering, kindsOf, noFilters, planPicture, radiiOf, sectionsOf,
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
/** What the browser needs from the page for My templates: where they're kept, the design to save, a yes/no and a typed name. */
export interface MineHooks {
  storage(): StorageLike | undefined;
  /** Save the whole design as a template (asks its name): the reason if it didn't, else undefined */
  saveWhole(): string | undefined;
  ask(text: string, yes: string, no: string): Promise<boolean>;
  askName(label: string, def: string): string | null;
}
export function initTemplateBrowser(pick: (name: string) => Promise<boolean>, add: (name: string) => boolean, mineHooks?: MineHooks, hasRoutes: () => boolean = () => true) {
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
  /** My templates as last read: by their card name ("mine:" + id) */
  const mineDesigns = new Map<string, Design>();
  let mineNote = '';

  // ---- what's kept: names that are no longer templates are dropped
  const keep = (names: string[]) => [...new Set(names.flatMap((n) => { const c = cardFor(infos, n); return c ? [c.name] : []; }))];
  const load = () => { stars = keep(readList(STARS)); recent = keep(readList(RECENT)).slice(0, RECENT_MAX); };

  // ---- filter chips
  type Axis = 'kinds' | 'gauges' | 'systems' | 'radii' | 'ranges';
  const chip = (axis: Axis, value: Kind | Gauge | System | Range | number, label: string) => {
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
    row('Range', RANGES.filter((r) => r === 'Mine' || cards.some((c) => c.range === r)).map((r) => chip('ranges', r, r)));
    row('Radius', radiiOf(cards).map((r) => chip('radii', r, `R${r}`)));
  }
  function syncChips() {
    for (const b of chipsEl.querySelectorAll<HTMLButtonElement>('button')) {
      const set = filters[b.dataset.axis as Axis] as ReadonlySet<unknown>;
      b.setAttribute('aria-pressed', String([...set].some((v) => String(v) === b.dataset.value)));
    }
    clearBtn.disabled = !filtering(filters);
    const on = filters.kinds.size + filters.gauges.size + filters.systems.size + filters.radii.size + filters.ranges.size;
    filtersBtn.textContent = on ? `Filters (${on})` : 'Filters';
  }

  // ---- cards
  function drawPicture(el: HTMLElement) {
    if (el.firstChild) return;
    const name = el.dataset.name!;
    let svg = pictures.get(name);
    if (svg === undefined) { const d = TEMPLATES[name] ?? mineDesigns.get(name); svg = d ? pictureSvg(planPicture(d)) : ''; if (!name.startsWith('mine:')) pictures.set(name, svg); }
    el.innerHTML = svg;
  }
  const choose = async (name: string) => {
    if (!(await pick(name))) return;
    const c = cardFor(infos, name);
    if (c) { recent = [c.name, ...recent.filter((n) => n !== c.name)].slice(0, RECENT_MAX); writeList(RECENT, recent); }
    dlg.close();
  };
  const addChoose = (name: string) => {
    if (!add(name)) return;
    const c = cardFor(infos, name);
    if (c) { recent = [c.name, ...recent.filter((n) => n !== c.name)].slice(0, RECENT_MAX); writeList(RECENT, recent); }
    dlg.close();
  };
  /** What a click does: add to the design when it has routes, else open (Shift+click: the other). Said once at the top of the browser. */
  let addsFirst = true;
  const hintText = () => (addsFirst ? 'Click adds to your design · Shift+click opens it alone' : 'Click opens it · Shift+click adds it to a design');
  /** The hand last chosen on each card this session (by the card's name). */
  const hands = new Map<string, 'left' | 'right'>();
  const act = (tpl: string, what: 'add' | 'open') => (what === 'add' ? addChoose(tpl) : void choose(tpl));
  const primaryOf = (): 'add' | 'open' => (addsFirst ? 'add' : 'open');
  /** A small text button at a card's bottom edge. */
  const mini = (label: string, cls: string, title: string, f: (e: MouseEvent) => void) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.title = title; b.setAttribute('aria-label', title);
    b.addEventListener('click', (e) => { e.stopPropagation(); f(e); });
    return b;
  };
  function cardEl(c: Card): HTMLElement {
    const el = document.createElement('div'); el.className = 'tcard'; el.dataset.card = c.name; el.tabIndex = 0; el.setAttribute('role', 'button');
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
    const pic = document.createElement('div'); pic.className = 'tpic';
    const name = document.createElement('div'); name.className = 'tname'; name.textContent = c.title;
    const sub = document.createElement('div'); sub.className = 'tsub';
    const bar = document.createElement('div'); bar.className = 'tact';
    const addB = mini('Add', 'tadd', '', () => act(cur, 'add')), openB = mini('Open', 'tpick', '', () => act(cur, 'open'));
    bar.append(addB, openB);
    // (a pair of hands: one at a time, a small switch over the picture; the picture, size and buttons follow the one chosen)
    const left = c.twin ? (c.hand === 'left' ? c.name : c.twin) : c.name, right = c.twin ? (c.hand === 'left' ? c.twin : c.name) : c.name;
    let cur = c.twin && hands.get(c.name) === 'right' ? right : left;
    const seg = c.twin ? document.createElement('div') : undefined;
    const update = () => {
      const info = infos.find((i) => i.name === cur) ?? c;
      pic.dataset.name = cur; pic.replaceChildren(); drawPicture(pic);
      sub.textContent = describe(info);
      const p = primaryOf(), what = (a: 'add' | 'open') => (a === 'add' ? `Add ${cur} to the design: it follows the pointer, a click puts it down` : `Open ${cur}: it replaces the design on the plan`);
      el.title = `${p === 'add' ? 'Click: add' : 'Click: open'} ${cur}${addsFirst ? ' to your design' : ''} · Shift+click: ${p === 'add' ? 'open it alone' : 'add it to a design'}`;
      el.setAttribute('aria-label', `${c.twin ? `${c.title}, ${cur === left ? 'left' : 'right'} hand` : cur}: ${p === 'add' ? 'add to your design (Shift+Enter opens it alone)' : 'open (Shift+Enter adds it to a design)'}`);
      addB.title = what('add'); addB.setAttribute('aria-label', what('add')); openB.title = what('open'); openB.setAttribute('aria-label', what('open'));
      addB.dataset.template = cur; openB.dataset.template = cur; el.dataset.template = cur;
      seg?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.hand === 'left') === (cur === left))));
    };
    if (seg) {
      seg.className = 'tseg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Hand');
      for (const [h, t] of [['left', left], ['right', right]] as const) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = h === 'left' ? 'Left' : 'Right'; b.dataset.hand = h; b.title = `Show the ${h}-hand one`;
        b.addEventListener('click', (e) => { e.stopPropagation(); cur = t; hands.set(c.name, h); update(); });
        seg.append(b);
      }
    }
    // (the whole card is the primary action)
    el.addEventListener('click', (e) => act(cur, (primaryOf() === 'add') !== e.shiftKey ? 'add' : 'open'));
    const top = document.createElement('div'); top.className = 'ttop'; top.append(pic, ...(seg ? [seg] : []));
    el.append(star, top, name, sub, bar);
    update();
    if (observer) observer.observe(pic);
    return el;
  }

  // ---- My templates: saved in this browser; a card each, with Open and Add to design, and Rename, Export and Delete
  const download = (name: string, d: Design) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = `${name.replace(/[^\w.-]+/g, '-')}.btd.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const mineInfo = (m: Mine): Card => {
    const base = m.design ? buildCatalog({ [m.name]: m.design }, [['My templates', [m.name]]])[0] : undefined;
    return { ...(base ?? { group: 'My templates', kind: 'feature' as Kind, gauge: 'none' as Gauge, system: 'train' as System, length: 0, width: 0, routes: 0, section: 'My templates' }), name: `mine:${m.id}`, title: m.name, hand: 'none', twin: undefined, range: 'Mine', mine: true, ...(m.damaged && { damaged: m.damaged }) };
  };
  function mineCardEl(c: Card): HTMLElement {
    const el = document.createElement('div'); el.className = 'tcard mine'; el.dataset.card = c.name; el.tabIndex = 0; el.setAttribute('role', 'button');
    const pic = document.createElement('div'); pic.className = 'tpic'; pic.dataset.name = c.name;
    const name = document.createElement('div'); name.className = 'tname'; name.textContent = c.title;
    const sub = document.createElement('div'); sub.className = 'tsub'; sub.textContent = c.damaged ? `Damaged: ${c.damaged}` : describe(c);
    const bar = document.createElement('div'); bar.className = 'tact';
    const id = c.name.slice(5), hooks = mineHooks!;
    if (!c.damaged) {
      const addB = mini('Add', 'tadd', `Add ${c.title} to the design: it follows the pointer, a click puts it down`, () => act(c.name, 'add')), openB = mini('Open', 'tpick', `Open ${c.title}: it replaces the design on the plan`, () => act(c.name, 'open'));
      addB.dataset.template = c.name; openB.dataset.template = c.name; el.dataset.template = c.name;
      bar.append(addB, openB);
      const p = primaryOf();
      el.title = `${p === 'add' ? 'Click: add' : 'Click: open'} ${c.title}${addsFirst ? ' to your design' : ''} · Shift+click: ${p === 'add' ? 'open it alone' : 'add it to a design'}`;
      el.setAttribute('aria-label', `${c.title}: ${p === 'add' ? 'add to your design (Shift+Enter opens it alone)' : 'open (Shift+Enter adds it to a design)'}`);
      el.addEventListener('click', (e) => act(c.name, (p === 'add') !== e.shiftKey ? 'add' : 'open'));
    } else el.setAttribute('aria-label', `${c.title}: damaged`);
    // (Rename, Export and Delete behind a ⋯)
    const more = mini('⋯', 'tmore', 'More: rename, export, delete', () => { menu.hidden = !menu.hidden; });
    more.setAttribute('aria-haspopup', 'menu');
    const menu = document.createElement('div'); menu.className = 'tmenu'; menu.hidden = true; menu.setAttribute('role', 'menu');
    const item = (label: string, cls: string, f: () => void) => { const b = mini(label, `tmi ${cls}`, label, () => { menu.hidden = true; f(); }); b.setAttribute('role', 'menuitem'); return b; };
    if (!c.damaged) {
      menu.append(
        item('Rename', 'trename', () => { const v = hooks.askName('Name the template:', c.title); if (v !== null && v.trim()) { const r = renameMine(hooks.storage(), id, v); mineNote = r.ok ? '' : `Not renamed: ${r.why}`; render(); } }),
        item('Export', 'texport', () => { const d = mineDesigns.get(c.name); if (d) download(c.title, d); }),
      );
    }
    menu.append(item('Delete', 'tdelete', () => void hooks.ask(`Delete the template "${c.title}"? It can't be undone.`, 'Delete it', 'Keep it').then((yes) => { if (!yes) return; const r = deleteMine(hooks.storage(), id); mineNote = r.ok ? '' : `Not deleted: ${r.why}`; render(); })));
    bar.append(more); bar.append(menu);
    const top = document.createElement('div'); top.className = 'ttop'; top.append(pic);
    el.append(top, name, sub, bar);
    if (!c.damaged) { if (observer) observer.observe(pic); else drawPicture(pic); }
    return el;
  }
  /** The My templates group, first in the list: its cards, what's used, Import…, and why not where nothing can be kept. */
  function mineGroup(): Card[] {
    if (!mineHooks) return [];
    const list = listMine(mineHooks.storage());
    mineDesigns.clear();
    for (const m of list.entries) if (m.design) mineDesigns.set(`mine:${m.id}`, m.design);
    const cards = list.entries.map(mineInfo), shown = filterCards(cards, filters);
    if (filtering(filters) && !shown.length) return [];
    const h = document.createElement('h3'); h.id = 'tpl-s-mine'; h.append('My templates'); const n = document.createElement('span'); n.className = 'n'; n.textContent = String(shown.length); h.append(n);
    body.append(h);
    if (!filtering(filters)) {
      const bar = document.createElement('div'); bar.className = 'mine-bar';
      if (list.unavailable) { const p = document.createElement('span'); p.className = 'mine-note'; p.textContent = `${list.unavailable}.`; bar.append(p); }
      else {
        const imp = document.createElement('button'); imp.type = 'button'; imp.textContent = 'Import…'; imp.title = 'Read .btd.json files into My templates';
        const file = document.createElement('input'); file.type = 'file'; file.accept = '.json,.btd.json'; file.multiple = true; file.hidden = true; file.id = 'tpl-import';
        imp.addEventListener('click', () => file.click());
        file.addEventListener('change', async () => {
          const notes: string[] = [];
          for (const f of [...(file.files ?? [])]) { const r = importMine(mineHooks!.storage(), await f.text(), f.name); if (!r.ok) notes.push(r.why); }
          mineNote = notes.length ? `Not imported: ${notes.join('; ')}` : ''; render();
        });
        const used = document.createElement('span'); used.className = 'mine-note'; used.textContent = usedText(list);
        bar.append(imp, file, used);
      }
      if (mineNote) { const p = document.createElement('span'); p.className = 'mine-note warn'; p.setAttribute('role', 'status'); p.textContent = mineNote; bar.append(p); }
      body.append(bar);
    }
    if (!shown.length) { const e = document.createElement('div'); e.className = 'mine-empty'; e.textContent = list.unavailable ? '' : 'Nothing saved yet. Save as template… keeps this design (or the selected tracks) here.'; if (e.textContent) body.append(e); return shown; }
    const g = document.createElement('div'); g.className = 'grid'; g.setAttribute('role', 'group'); g.setAttribute('aria-labelledby', h.id);
    for (const c of shown) g.append(mineCardEl(c));
    body.append(g);
    return shown;
  }

  // ---- the whole list, drawn again as the search or a filter changes
  function render() {
    observer?.disconnect();
    body.replaceChildren();
    const mineShown = mineGroup();
    const shown = filterCards(cards, filters);
    const total = infos.length, n = shown.reduce((a, c) => a + countOf(c), 0);
    countEl.textContent = `${n + mineShown.length} of ${total + mineShown.length}`;
    clearBtn.disabled = !filtering(filters);
    if (!shown.length && mineShown.length) return;
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
      if (recent.length) {
        section('recent', 'Recent', byName(recent));
        // (under the recent cards: forget them; stars and the templates themselves stay)
        const bar = document.createElement('div'); bar.className = 'mine-bar';
        const clr = document.createElement('button'); clr.type = 'button'; clr.id = 'tpl-recent-clear';
        clr.textContent = 'Clear recent'; clr.title = 'Forget the recently used templates (starred ones stay starred)';
        clr.addEventListener('click', () => { recent = []; writeList(RECENT, recent); render(); document.getElementById('tpl-search')?.focus(); });
        bar.append(clr); body.append(bar);
      }
    }
    const last: { v?: string } = {};
    for (const s of sectionsOf(shown)) section(s.id, s.title, s.cards, s.parent, last);
  }

  // ---- the keys: arrows move between cards (Tab goes through every button)
  function firstOf(card: Element) { return card as HTMLElement; }
  body.addEventListener('keydown', (e) => {
    // (Enter on a card does its main action, Shift+Enter the other; on a button, what the button says)
    if (e.key === 'Enter' && (e.target as HTMLElement).classList.contains('tcard')) {
      e.preventDefault(); (e.target as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: e.shiftKey })); return;
    }
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
    if (e.key === 'ArrowDown') { const t = body.querySelector<HTMLElement>('.tcard'); if (t) { e.preventDefault(); t.focus(); } }
    else if (e.key === 'Escape' && search.value) { e.stopPropagation(); e.preventDefault(); search.value = ''; filters = { ...filters, query: '' }; render(); }
  });
  search.addEventListener('input', () => { filters = { ...filters, query: search.value }; syncChips(); render(); });
  clearBtn.addEventListener('click', () => { filters = noFilters(); search.value = ''; syncChips(); render(); search.focus(); });

  // (a ⋯ menu closes on a click anywhere else)
  body.addEventListener('click', (e) => body.querySelectorAll<HTMLElement>('.tmenu').forEach((m) => { if (!m.parentElement?.contains(e.target as Node)) m.hidden = true; }));

  // ---- Save as template… in the header: the whole design
  const saveBtn = document.getElementById('tpl-save') as HTMLButtonElement | null;
  saveBtn?.addEventListener('click', () => { const why = mineHooks?.saveWhole(); mineNote = why ? `Not saved: ${why}` : ''; render(); });

  // ---- open and close
  $('tpl-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { const r = dlg.getBoundingClientRect(); if (e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dlg.close(); });
  $('templates-open').addEventListener('click', () => {
    if (dlg.open) return;
    if (!built) {
      built = true; infos = catalog(); cards = cardsOf(infos); buildChips();
      if (typeof IntersectionObserver !== 'undefined') observer = new IntersectionObserver((es) => { for (const en of es) if (en.isIntersecting) { drawPicture(en.target as HTMLElement); observer!.unobserve(en.target); } }, { root: body, rootMargin: '200px' });
    }
    addsFirst = hasRoutes(); $('tpl-hint').textContent = hintText();
    load(); syncChips(); render();
    dlg.showModal();
    body.scrollTop = 0;
    // (a keyboard is only brought up on a phone by touching the box)
    if (matchMedia('(pointer: fine)').matches) { search.focus(); search.select(); } else $('tpl-close').focus();
  });
}
