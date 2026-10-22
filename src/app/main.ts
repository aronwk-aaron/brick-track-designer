// The editor: routes on the left (in studs and degrees), the plan view and the
// 3D piece on the right, rebuilt in a worker as you edit.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Design, type DRoute, type DSeg, OPTION_DEFAULTS, type PieceOptions, RAIL_DEFAULTS, TEMPLATES, type Trackwork, endOf, freeName, isMono } from './design';
import { TrackCanvas, type OverlayItem, leverSide, leverSlides, typingIn } from './canvas';
import { describe } from './planner';
import type { Piece } from './build';
import { zip } from '../geom/zip';
import { layoutParts } from './layoutparts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const routesEl = $('routes'), infoEl = $('info'), errEl = $('error');
const STORE = 'btd-design';

// ---------- the document ----------
let design: Design = load() ?? { version: 1, gaugeStuds: 4, routes: [] };
// Undo history: designs as JSON, the current one last.
const history: string[] = [JSON.stringify(design)], future: string[] = [];

function load(): Design | undefined {
  try { const s = localStorage.getItem(STORE); return s ? JSON.parse(s) as Design : undefined; } catch { return undefined; }
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(design)); } catch { /* storage off: fine */ } }

// ---------- the form ----------
const num = (v: number, set: (n: number) => void, step = 1, label = '') => {
  const i = document.createElement('input');
  i.type = 'number'; i.step = String(step); i.value = String(Math.round(v * 1000) / 1000); i.title = label; // (shown to 3 places: the full value's kept till it's changed)
  i.addEventListener('change', () => { const n = Number(i.value); if (Number.isFinite(n)) { set(n); changed(); } });
  return i;
};
const btn = (text: string, fn: () => void, title = '') => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.title = title;
  b.addEventListener('click', () => { fn(); changed(true); });
  return b;
};
const field = (label: string, ...els: HTMLElement[]) => {
  const d = document.createElement('label'); d.className = 'field';
  const s = document.createElement('span'); s.textContent = label; d.append(s, ...els); return d;
};

function segRow(r: DRoute, k: number): HTMLElement {
  const sg = r.segs[k], row = document.createElement('div'); row.className = 'seg';
  if (sg.kind === 'straight') row.append(field('Straight, studs', num(sg.studs, (n) => { sg.studs = n; }, 1)));
  else row.append(field('Curve: radius, studs', num(sg.radius, (n) => { (sg as Extract<DSeg, { kind: 'curve' }>).radius = n; }, 8)),
    field('angle ° (+ left)', num(sg.angle, (n) => { (sg as Extract<DSeg, { kind: 'curve' }>).angle = n; }, 0.5)));
  row.append(btn('✕', () => { r.segs.splice(k, 1); }, 'Remove this segment'));
  return row;
}

type Choice = { v: string; t: string; tip: string; con?: string };
const LEFT_OUT = 'Left out within a sleeper length of another track (switches, crossings, a track close alongside).';
/** A route card's bridge guard rails and dual gauge (straight.scad's guard_* and dual_* settings): off by default, always shown, greyed out with the reason when they don't apply. */
function extraRailFields(r: DRoute, body: HTMLElement) {
  const d = { ...RAIL_DEFAULTS, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) } as typeof RAIL_DEFAULTS & DRoute;
  const opt = (off: string | undefined) => {
    const wrap = document.createElement('div'); body.append(wrap);
    const note = (txt: string, color = 'var(--muted)', bold = false) => {
      const n = document.createElement('small'); n.className = 'desc'; n.style.color = color; if (bold) n.style.fontWeight = '600'; n.textContent = txt; wrap.append(n);
    };
    const end = () => { if (off) { note(`Locked: ${off}.`, 'var(--warn)', true); for (const el of wrap.querySelectorAll<HTMLElement>('.field span, small.desc')) if (!el.textContent?.startsWith('Locked')) el.style.opacity = '0.5'; } };
    return { wrap, note, end };
  };
  const pick = (label: string, cur: string, def: string, choices: Choice[], set: (v: string) => void, off?: string, help?: string) => {
    const { wrap, note, end } = opt(off);
    const sel = document.createElement('select'); sel.disabled = !!off;
    for (const ch of choices) { const op = new Option(`${ch.t}${ch.v === def ? ' (default)' : ''}`, ch.v); op.title = [ch.tip, ch.con && `Drawback: ${ch.con}`].filter(Boolean).join(' '); sel.append(op); }
    sel.value = cur;
    sel.addEventListener('change', () => { set(sel.value); changed(true); });
    const f = field(label, sel); f.classList.add('stack'); wrap.append(f);
    const ch = choices.find((c) => c.v === cur);
    if (ch?.tip) note(ch.tip);
    if (ch?.con) note(`Drawback: ${ch.con}`, 'var(--ink)');
    if (help) note(help);
    end();
  };
  const studs = (label: string, v: number, def: number, step: number, min: number, max: number, set: (n: number) => void, help: string, off?: string) => {
    const { wrap, note, end } = opt(off);
    const i = num(v, (n) => { const x = Math.min(max, Math.max(min, n)); set(x); i.value = String(x); }, step, help); i.min = String(min); i.max = String(max); i.disabled = !!off;
    wrap.append(field(label, i));
    note(`${help} Range ${min} to ${max}, default ${def}.`);
    end();
  };
  const ends = (none: Choice, at: (where: string) => string, con?: string): Choice[] => [none,
    { v: 'start', t: 'Start', tip: at('the start (where the route was drawn from)'), con },
    { v: 'end', t: 'End', tip: at('the end'), con },
    { v: 'both', t: 'Both ends', tip: at('both ends'), con }];
  const gOff = r.guardRails ? undefined : 'only with Guard rails on';
  pick('Guard rails', r.guardRails ? 'on' : 'off', 'off', [
    { v: 'off', t: 'Off', tip: 'Just the two running rails.' },
    { v: 'on', t: 'On', tip: 'A guard rail just inside each running rail, as on bridges, to keep a derailed train on the track.', con: 'More to print. Fewer studs between the rails.' }],
  (v) => { r.guardRails = v === 'on' || undefined; }, undefined, LEFT_OUT);
  pick('Guard rail points', d.guardRailEnds, RAIL_DEFAULTS.guardRailEnds, ends(
    { v: 'none', t: 'None', tip: 'The guard rails run to both ends, with rail ends that join the next piece\'s guard rails.' },
    (w) => `The guard rails curve in to a point on the centre line at ${w}, as where a bridge starts.`),
  (v) => { r.guardRailEnds = v as DRoute['guardRailEnds']; }, gOff);
  studs('Guard rail gap, studs', d.guardRailGapStuds, RAIL_DEFAULTS.guardRailGapStuds, 0.05, 0.45, 1.25, (n) => { r.guardRailGapStuds = n; }, 'From each running rail\'s head to its guard rail. Real bridges: about a sixth of the gauge.', gOff);
  const pOff = gOff ?? (d.guardRailEnds === 'none' ? 'only with Guard rail points set' : undefined);
  studs('Point length, studs', d.guardRailTaperStuds, RAIL_DEFAULTS.guardRailTaperStuds, 1, 2, 24, (n) => { r.guardRailTaperStuds = n; }, 'From the point to where the guard rails run parallel. Shorter on a route too short for it.', pOff);
  pick('Point shape', d.guardRailTaperShape, RAIL_DEFAULTS.guardRailTaperShape, [
    { v: 'straight', t: 'Straight', tip: 'Straight in from the point, bent where they meet the parallel guard rails, as on real bridges.' },
    { v: 'curve', t: 'Curve', tip: 'One smooth curve from the point into the parallel guard rails.', con: 'Wider sooner, so fewer studs near the point.' }],
  (v) => { r.guardRailTaperShape = v as DRoute['guardRailTaperShape']; }, pOff);
  studs('Nose ramp, studs', d.guardRailNoseRampStuds, RAIL_DEFAULTS.guardRailNoseRampStuds, 0.25, 0, 5, (n) => { r.guardRailNoseRampStuds = n; }, 'The point\'s nose slopes from just above the bed up to the rail top over this length, so anything dragging rides over it. 0: no slope.', pOff);
  const gs = design.gaugeStuds, dOff = r.dualGauge ? undefined : 'only with Dual gauge on';
  pick('Dual gauge', r.dualGauge ? 'on' : 'off', 'off', [
    { v: 'off', t: 'Off', tip: 'One gauge.' },
    { v: 'on', t: 'On', tip: 'A third rail, so trains of a narrower gauge run on it and one running rail.', con: 'More to print. No studs near the third rail.' }],
  (v) => { r.dualGauge = v === 'on' || undefined; }, undefined, LEFT_OUT);
  studs('Narrow gauge, studs', d.dualGaugeStuds, RAIL_DEFAULTS.dualGaugeStuds, 1, 1, 9, (n) => { r.dualGaugeStuds = Math.round(n); }, 'Studs between the narrow gauge\'s rails (2: LEGO narrow gauge).', dOff);
  if (r.dualGauge && d.dualGaugeStuds >= gs) {
    const n = document.createElement('small'); n.className = 'desc'; n.style.fontWeight = '600';
    n.textContent = `Not built: the narrow gauge must be less than the track's ${gs} studs, so there is no third rail.`; body.append(n);
  }
  pick('Shared rail', d.dualShared, RAIL_DEFAULTS.dualShared, [
    { v: 'right', t: 'Right', tip: 'Both gauges use the right running rail, facing along the route as drawn.' },
    { v: 'left', t: 'Left', tip: 'Both gauges use the left running rail, facing along the route as drawn.' }],
  (v) => { r.dualShared = v as DRoute['dualShared']; }, dOff);
  pick('Ends meeting single gauge', d.dualPlainEnds, RAIL_DEFAULTS.dualPlainEnds, ends(
    { v: 'none', t: 'None', tip: 'The third rail has rail ends at both ends, to join the next dual-gauge piece.' },
    (w) => `The third rail stops short at ${w}, clear of a single-gauge piece's end connector.`, 'Narrow-gauge trains can\'t run on past that end.'),
  (v) => { r.dualPlainEnds = v as DRoute['dualPlainEnds']; }, dOff);
}

// Which route cards are open (by index); the selected one always is.
const openCards = new Set<number>();

function render() {
  routesEl.replaceChildren();
  $('routes-title').textContent = design.routes.length ? `Routes (${design.routes.length})` : 'Routes';
  $('empty').hidden = design.routes.length > 0;
  if (!design.routes.length) {
    const e = document.createElement('div'); e.className = 'empty';
    e.textContent = 'No track yet. Draw on the grid, pick a template, or add a route by numbers.';
    routesEl.append(e);
  }
  design.routes.forEach((r, i) => {
    const box = document.createElement('details'); box.className = 'route';
    const sel = i === canvas?.selected;
    if (sel) box.classList.add('selected');
    box.open = sel || openCards.has(i);
    const sum = document.createElement('summary');
    const title = document.createElement('b'); title.textContent = r.name || `Route ${i + 1}`;
    const what = document.createElement('span'); what.textContent = r.segs.length ? describe(r.segs) : 'empty';
    sum.append(title, what);
    sum.addEventListener('click', (e) => {
      e.preventDefault();
      if (sel) { openCards.delete(i); canvas.selected = undefined; }
      else { openCards.add(i); canvas.selected = i; }
      render(); canvas.draw();
    });
    const body = document.createElement('div'); body.className = 'body';
    const name = document.createElement('input'); name.value = r.name; name.type = 'text';
    // (routes are known by their names, in the trackwork and the switches: no two the same)
    name.addEventListener('change', () => {
      const v = name.value.trim();
      if (!v || design.routes.some((q, j) => j !== i && q.name === v)) { name.value = r.name; setStatus(infoEl.textContent ?? '', v ? `There's already a route called ${v}: names must differ` : 'A route needs a name', false, true); return; }
      r.name = v; changed(true);
    });
    body.append(field('Name', name),
      field('Start x, studs', num(r.x, (n) => { r.x = n; }, 1)),
      field('Start y, studs', num(r.y, (n) => { r.y = n; }, 1)),
      field('Heading ° (0 = up, + = left)', num(r.heading, (n) => { r.heading = n; }, 22.5)));
    {
      // (what runs on it: train track or the monorail beam)
      const sys = document.createElement('select');
      sys.append(new Option('Train track', 'train'), new Option('Monorail', 'monorail'));
      sys.value = isMono(r) ? 'monorail' : 'train';
      sys.title = 'Train track, or LEGO monorail: the 4-stud beam with a rack down the middle.';
      sys.addEventListener('change', () => { if (sys.value === 'monorail') r.system = 'monorail'; else delete r.system; changed(true); renderOptions(); });
      body.append(field('Track', sys));
    }
    r.segs.forEach((_, k) => body.append(segRow(r, k)));
    // (each end: an ordinary end connector, or a buffer stop)
    for (const [prop, label] of [['startEnd', 'Starts in'], ['endEnd', 'Ends in']] as const) {
      const es = document.createElement('select');
      for (const [v, t] of [['connector', 'An end connector'], ['buffer', 'A buffer stop']]) es.append(new Option(t, v));
      es.value = r[prop] ?? 'connector';
      es.title = 'An ordinary end connector, to join more track, or a buffer stop: the rails run into two posts joined by a buffer beam, its last two studs (the Buffer stops settings)';
      es.addEventListener('change', () => { if (es.value === 'buffer') r[prop] = 'buffer'; else delete r[prop]; changed(true); });
      const f = field(label, es); f.classList.add('stack'); body.append(f);
    }
    // (a branch, i.e. a switch's: its lever's side, where it branches; shown once the plan knows it's one)
    const id = r.name || String(i), items = canvas?.overlay?.items ?? [];
    const keys = new Set(items.filter((it) => it.kind === 'points' && !it.cand && (it.routes ?? []).slice(1).includes(id)).map((it) => it.key));
    if (keys.size || (r.throwSide && r.throwSide !== 'auto')) {
      const sel = document.createElement('select');
      const opt = design.options?.throwSide ?? 'auto';
      for (const [v, t] of [['auto', opt === 'auto' ? 'Auto: away from this branch' : `As the Piece options say (${opt})`], ['left', 'Left'], ['right', 'Right']]) sel.append(new Option(t, v));
      sel.value = r.throwSide ?? 'auto';
      sel.title = 'Which side the lever goes at the points where this track branches off another, as you face along them from their toe';
      sel.addEventListener('change', () => { r.throwSide = sel.value as DRoute['throwSide']; changed(true); });
      const f = field('Lever side where it branches', sel); f.classList.add('stack'); body.append(f);
      const hand = [...keys].filter((k) => design.trackwork?.throw?.[k]?.side);
      if (hand.length) {
        const n = document.createElement('small'); n.className = 'desc';
        n.textContent = `The lever${keys.size > 1 ? 's' : ''} here ${hand.length > 1 ? 'were' : 'was'} dragged across by hand, which wins: set its Side back to Auto in the Trackwork panel for this to apply.`;
        body.append(n);
      }
    }
    extraRailFields(r, body);
    const add = document.createElement('div'); add.className = 'row';
    add.append(
      btn('+ Straight', () => r.segs.push({ kind: 'straight', studs: 16 })),
      btn('+ Curve L', () => r.segs.push({ kind: 'curve', radius: 40, angle: 22.5 })),
      btn('+ Curve R', () => r.segs.push({ kind: 'curve', radius: 40, angle: -22.5 })),
    );
    const more = document.createElement('div'); more.className = 'row';
    more.append(
      btn('New route from its end', () => { const e = endOf(design, i); design.routes.push({ name: freeName(design, 'R'), ...e, segs: [{ kind: 'straight', studs: 16 }], ...(isMono(r) && { system: 'monorail' as const }) }); }),
      btn('Delete', () => { design.routes.splice(i, 1); if (canvas.selected === i) canvas.selected = undefined; openCards.clear(); }),
    );
    more.lastElementChild!.className = 'danger';
    body.append(add, more);
    box.append(sum, body);
    routesEl.append(box);
  });
}

// ---------- building ----------
// (one build at a time; a build still going when a newer one is asked for is
// given a second to finish, then the worker is replaced, so a slow build of
// a big layout never holds up the next change)
const newWorker = () => { const w2 = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }); w2.onmessage = onBuilt; return w2; };
let worker: Worker;
let fatalRetry = -1;
let seq = 0, started = 0, pieces: Piece[] = [], timer: number | undefined, restartCheck: number | undefined;
/** The 3D view and the downloads: building (a newer design than the pieces), out of date (stopped, or the last build failed), or up to date. */
let building = false, stale = false;
/** The first build of the design as last let go of (a lever dropped is held where it was put on the plan till then). */
let settleFrom = 0;
const hasTrack = () => design.routes.some((r) => r.segs.length > 0);
function requestBuild() {
  clearTimeout(timer);
  const id = ++seq;
  // (nothing to build: no need to ask the worker, which would only say so)
  if (!hasTrack()) {
    buildDone(); stale = false; pieces = []; showPieces(pieces); canvas.overlay = undefined; updateLegend(); canvas.draw(); renderTrackwork([]); refreshOptions();
    setStatus('Nothing to build yet: draw some track, or pick a template.');
    return;
  }
  worker.postMessage({ id, design: structuredClone(design) });
  buildStarted();
  clearTimeout(restartCheck);
  restartCheck = window.setTimeout(() => {
    if (started >= id || id !== seq) return;
    worker.terminate(); worker = newWorker();
    worker.postMessage({ id, design: structuredClone(design) });
  }, 1000);
}
/** Stop the build that's going (a big layout taking its time): the 3D view stays as it was, out of date, till Rebuild. */
function stopBuild() {
  clearTimeout(timer); clearTimeout(restartCheck);
  seq++; worker.terminate(); worker = newWorker();
  buildDone(); stale = true;
  setStatus('Build stopped: the 3D view and the downloads are of the design before your last changes.', '', true);
}

/** The status line under the 3D view: what was built (info), what's wrong or worth knowing (problem), and Rebuild when it's out of date. */
function setStatus(info: string, problem = '', rebuild = false, warn = false) {
  infoEl.textContent = info; errEl.textContent = problem; errEl.classList.toggle('warn', warn);
  $('rebuild').hidden = !rebuild;
  $('view3d').classList.toggle('stale', stale);
  updateExports();
}
/** The downloads: only of an up-to-date build. */
function updateExports() {
  const why = building ? 'Wait for the build to finish' : !pieces.length ? 'Nothing built yet' : stale ? 'The 3D view is out of date: rebuild first' : '';
  const tips: Record<string, string> = {
    'export-stl': 'Download the parts for printing as STL (a zip when there are several)',
    'export-layout': 'Download a parts library for the layout designer (a zip): one part per printed track part, each with its picture and connection points, and a set of them all as designed. Help says how to load it',
  };
  for (const id of ['export-stl', 'export-layout']) {
    const b = $<HTMLButtonElement>(id); b.disabled = !!why;
    b.title = why ? `${why}` : tips[id];
  }
}

/** The design changed: save it and rebuild. record: an undo step (not while a drag or a draw is still going on). */
function changed(rerender = false, record = true) {
  const json = JSON.stringify(design);
  if (record && json !== history[history.length - 1]) { history.push(json); future.length = 0; if (history.length > 200) history.shift(); }
  if (record) settleFrom = seq + 1; // (the next build is of the design as let go of)
  save();
  updateLegend();
  if (rerender) render();
  canvas?.draw();
  updateHistoryButtons();
  clearTimeout(timer);
  timer = window.setTimeout(requestBuild, 150);
  building = true; updateExports();
}

// The build status, in the status line while it builds: what the worker is doing, and for how long.
let buildT0 = 0, buildTick: number | undefined;
function buildStarted() {
  buildT0 = performance.now(); building = true; updateExports();
  $('buildstatus').hidden = false; $('build-what').textContent = 'Building…'; $('build-time').textContent = ''; $('build-bar').style.width = '0%';
  clearInterval(buildTick);
  buildTick = window.setInterval(() => { $('build-time').textContent = `${((performance.now() - buildT0) / 1000).toFixed(1)} s`; }, 100);
}
function buildDone() { clearInterval(buildTick); $('buildstatus').hidden = true; building = false; updateExports(); }
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function onBuilt(e: MessageEvent) {
  const d = e.data;
  started = Math.max(started, d.id);
  if (d.id !== seq) return;          // an older build
  // (the trackwork, ahead of the pieces: the plan and the Trackwork panel can be worked on while they build)
  if (d.early) { canvas.overlay = d.early; if (d.id >= settleFrom) canvas.settled(); updateLegend(); canvas.draw(); renderTrackwork(d.early.items ?? []); refreshOptions(); refreshRoutes(); return; }
  if (d.progress) { $('build-what').textContent = `${d.progress}…`; $('build-bar').style.width = `${Math.round((d.frac ?? 0) * 100)}%`; return; }
  if (d.fatal && fatalRetry !== d.id) { fatalRetry = d.id; worker.terminate(); worker = newWorker(); worker.postMessage({ id: d.id, design: structuredClone(design) }); return; }
  buildDone();
  // (the plan keeps the trackwork it was sent; the 3D view the last pieces that built, greyed)
  if (d.error) { stale = pieces.length > 0; setStatus('', `Can't build this: ${d.error}${stale ? ' (the 3D view shows the last design that built)' : ''}`); return; }
  stale = false;
  canvas.overlay = d.overlay; if (d.id >= settleFrom) canvas.settled();
  updateLegend();
  canvas.draw();
  pieces = d.pieces;
  showPieces(pieces);
  showIssues(d.overlay.issues ?? []);
  renderTrackwork(d.overlay.items ?? []);
  refreshOptions(); refreshRoutes();
  const i = d.info;
  const trackwork = [i.switches && plural(i.switches, 'switch', 'switches'), i.crossings && plural(i.crossings, 'rail crossing'), i.checkRails && plural(i.checkRails, 'check rail')].filter(Boolean).join(', ');
  setStatus(`${trackwork ? `${trackwork} · ` : ''}${plural(i.pieces, 'part')} · ${i.size.map((v: number) => v.toFixed(0)).join(' × ')} mm · ${(i.volume / 1000).toFixed(1)} cm³ · built in ${(i.ms / 1000).toFixed(1)} s`,
    (i.warnings as string[]).join('; '), false, true);
}
worker = newWorker();
$('build-stop').addEventListener('click', stopBuild);
$('rebuild').addEventListener('click', () => { stale = false; setStatus(''); requestBuild(); });

// ---------- 3D view ----------
const view = $('view3d');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
view.append(renderer.domElement);
const scene = new THREE.Scene();
const cssColor = (v: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback;
scene.background = new THREE.Color(cssColor('--view-bg', '#f4f4f2'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { scene.background = new THREE.Color(cssColor('--view-bg', '#f4f4f2')); redraw3d(); });
const camera = new THREE.PerspectiveCamera(35, 1, 1, 10000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
// (drawn only when something's changed: drawing every frame regardless kept the page busy, and the plan's zoom lagged)
let dirty3d = true;
const redraw3d = () => { dirty3d = true; };
controls.addEventListener('change', redraw3d);
controls.zoomToCursor = true; // (zooming toward the mouse, as the plan does)
scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(300, -400, 700); scene.add(sun);
const under = new THREE.DirectionalLight(0xffffff, 0.9); under.position.set(-300, 400, -700); scene.add(under);
let meshes: THREE.Mesh[] = [], framed = false;
let lastNames = '';
const sphereOf = () => new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere());
const group = new THREE.Group();
scene.add(group);

/** Show the pieces as assembled: the track grey, moving parts in their colours. */
// What the 3D view shows (Track, Points, Throws, Levers buttons), remembered.
const shown = new Set(['track', 'points', 'throw', 'lever', 'supports']);
try { const v = localStorage.getItem('btd-shown'); if (v) { shown.clear(); for (const k of JSON.parse(v) as string[]) shown.add(k); } } catch { /* fine */ }
const kindOf = (name: string) => (/lid/.test(name) ? 'cassette' : /holddown/.test(name) ? 'hold' : /bracket/.test(name) ? 'bracket' : /lever/.test(name) ? 'lever' : /throw/.test(name) ? 'throw' : /points/.test(name) ? 'points' : 'track');
let meshKinds: string[] = [];
// Exploded view: each part pulled out from the middle (the moving parts lifted too), to see where they separate.
let meshCentres: THREE.Vector3[] = [];
const explodeEl = $<HTMLInputElement>('explode');
function applyExplode() {
  redraw3d();
  const e = Number(explodeEl.value), all = new THREE.Vector3();
  meshCentres.forEach((c) => all.add(c)); if (meshCentres.length) all.divideScalar(meshCentres.length);
  // (track parts spread out from the middle; each moving part goes with the track part it sits in, and lifts straight up out of it)
  const boxes = meshes.map((m) => m.geometry.boundingBox!);
  const spread = (k: number) => new THREE.Vector3((meshCentres[k].x - all.x) * e * 0.5, (meshCentres[k].y - all.y) * e * 0.5, 0);
  const trackIdx = meshKinds.map((kd, k) => (kd === 'track' ? k : -1)).filter((k) => k >= 0);
  meshes.forEach((m, k) => {
    if (meshKinds[k] === 'track') { m.position.copy(spread(k)); return; }
    const c = meshCentres[k];
    let host = trackIdx.find((t) => c.x >= boxes[t].min.x && c.x <= boxes[t].max.x && c.y >= boxes[t].min.y && c.y <= boxes[t].max.y);
    if (host === undefined) host = trackIdx.reduce((best, t) => (best < 0 || meshCentres[t].distanceTo(c) < meshCentres[best].distanceTo(c) ? t : best), -1);
    const off = host !== undefined && host >= 0 ? spread(host) : spread(k);
    // (as they're put together, each lifted clear of the last: the plate-style slider down into its opening, then the
    // blades on it, the bracket on its studs, the lever into it; on tines, the slider and points from underneath,
    // or with the layered points from above under the lid)
    const fdb = design.options?.mechStyle !== 'tines';
    const fromTop = design.options?.pointsModule === 'layers' && (design.options?.ballast ?? 'none') !== 'none';
    const lift: Record<string, number> = fdb ? { throw: 35, points: 70, hold: 90, cassette: 90, bracket: 50, lever: 110 }
      : { throw: fromTop ? 15 : -30, points: fromTop ? 25 : -18, cassette: 45, bracket: 30, lever: 60 };
    m.position.set(off.x, off.y, e * (lift[meshKinds[k]] ?? 40));
  });
}
explodeEl.addEventListener('input', applyExplode);
const showKind = (k: string) => (k === 'cassette' ? 'track' : k === 'bracket' ? 'lever' : k === 'hold' ? 'points' : k);
function applyShown() {
  redraw3d();
  meshes.forEach((m, k) => { m.visible = shown.has(showKind(meshKinds[k])); const sp = m.getObjectByName('supports'); if (sp) sp.visible = shown.has('supports'); });
  // (only the buttons for parts there are; Explode only with parts to pull apart)
  const kinds = new Set(meshKinds.map(showKind));
  document.querySelectorAll<HTMLButtonElement>('#views .show').forEach((b) => { b.classList.toggle('on', shown.has(b.dataset.show!)); if (b.dataset.show !== 'supports') b.hidden = !kinds.has(b.dataset.show!) || kinds.size < 2; });
  $('views-sep2').hidden = kinds.size < 2;
  $('show-supports').hidden = !meshes.some((m) => m.getObjectByName('supports'));
  explodeEl.disabled = meshes.length < 2; explodeEl.parentElement!.title = meshes.length < 2 ? 'One part: nothing to pull apart' : 'Pull the parts apart to see where they separate';
  for (const id of ['view-top', 'view-under', 'view-frame']) $<HTMLButtonElement>(id).disabled = !meshes.length;
}
document.querySelectorAll<HTMLButtonElement>('#views .show').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.show!; if (shown.has(k)) shown.delete(k); else shown.add(k);
  try { localStorage.setItem('btd-shown', JSON.stringify([...shown])); } catch { /* fine */ }
  applyShown();
}));
applyShown();
// What's wrong (the build's issues, where they are): red rings round them in the 3D view too, as on the plan, a
// post up from each so it's seen over the track.
const issueGroup = new THREE.Group();
scene.add(issueGroup);
function showIssues(list: { at: [number, number]; r: number }[]) {
  for (const m of [...issueGroup.children]) { issueGroup.remove(m); const mm = m as THREE.Mesh; mm.geometry.dispose(); (mm.material as THREE.Material).dispose(); }
  const top = meshes.length ? new THREE.Box3().setFromObject(group).max.z : 10;
  for (const is of list) {
    const r = Math.max(8, is.r), mat = () => new THREE.MeshBasicMaterial({ color: 0xe02828, transparent: true, opacity: 0.9, depthTest: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, Math.max(0.8, r / 60), 8, 64), mat());
    ring.position.set(is.at[0], is.at[1], top + 1);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 30, 8), mat());
    post.rotation.x = Math.PI / 2; post.position.set(is.at[0], is.at[1], top + 16);
    const head = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), mat());
    head.position.set(is.at[0], is.at[1], top + 32);
    for (const m of [ring, post, head]) { m.renderOrder = 10; issueGroup.add(m); }
  }
  redraw3d();
}
function showPieces(list: Piece[]) {
  for (const m of meshes) { group.remove(m); m.traverse((o) => { const mm = o as THREE.Mesh; if (mm.geometry) { mm.geometry.dispose(); (mm.material as THREE.Material).dispose(); } }); }
  meshes = list.map((p) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.55, metalness: 0.15 }));
    // (its breakaway print supports, in their own colour, shown or hidden with the Supports button; they move with it)
    if (p.supports?.length) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(p.supports, 3));
      sg.computeVertexNormals();
      const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0xe0a030, roughness: 0.6 }));
      sm.name = 'supports';
      m.add(sm);
    }
    group.add(m);
    return m;
  });
  meshKinds = list.map((p) => kindOf(p.name));
  meshCentres = meshes.map((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox!.getCenter(new THREE.Vector3()); });
  applyShown(); applyExplode();
  if (!list.length) { framed = false; lastNames = ''; lastSphere = undefined; return; } // (nothing to frame: frame the next pieces afresh)
  const bs = sphereOf();
  // (a different set of pieces, e.g. a switch appearing: frame again)
  const names = list.map((p) => p.name).join();
  if (names !== lastNames) { lastNames = names; lastSphere = undefined; }
  // Frame the piece the first time, and again when it has grown, shrunk or
  // moved a lot, keeping the direction you are looking from.
  const moved = !lastSphere || bs.center.distanceTo(lastSphere.center) > lastSphere.radius * 0.35
    || Math.abs(bs.radius - lastSphere.radius) > lastSphere.radius * 0.35;
  if (!framed || moved) frame(bs, framed);
  framed = true;
}
let lastSphere: THREE.Sphere | undefined;
function frame(bs: THREE.Sphere, keepDirection: boolean) {
  const dir = keepDirection ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(0.6, -1.2, 1.1).normalize();
  controls.target.copy(bs.center);
  camera.position.copy(bs.center).add(dir.multiplyScalar(bs.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(1, 1 / camera.aspect)));
  controls.update();
  lastSphere = bs.clone();
}
function resize() {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); redraw3d();
}
new ResizeObserver(resize).observe(view);
// Top or underside view, from the side you're looking from.
const look = (under: boolean) => {
  if (!meshes.length) return; const bs = sphereOf();
  const d = camera.position.clone().sub(controls.target);
  d.z = Math.abs(d.z) * (under ? -1 : 1);
  if (Math.hypot(d.x, d.y) < 1e-6) d.y = -1;
  camera.position.copy(controls.target).add(d);
  frame(bs, true);
};
$('view-top').addEventListener('click', () => look(false));
$('view-under').addEventListener('click', () => look(true));
$('view-frame').addEventListener('click', () => { if (meshes.length) frame(sphereOf(), true); });
renderer.domElement.addEventListener('dblclick', () => { if (meshes.length) frame(sphereOf(), true); });
renderer.setAnimationLoop(() => { if (!dirty3d) return; dirty3d = false; renderer.render(scene, camera); });

// ---------- toolbar ----------
const tpl = $<HTMLSelectElement>('template');
for (const name of Object.keys(TEMPLATES)) tpl.append(new Option(name, name));
tpl.addEventListener('change', () => {
  if (!tpl.value) return;
  design = structuredClone(TEMPLATES[tpl.value]); tpl.value = ''; replaced(); framed = false; changed(true); canvas.fit();
});
$('add-route').addEventListener('click', () => {
  design.routes.push({ name: nextName(), x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] });
  canvas.setSelection([design.routes.length - 1]); // (its card open, to type its numbers)
  changed(true);
});
/** The legend: only what's on the plan now. */
function updateLegend() {
  const o = canvas?.overlay, its = o?.items ?? [];
  const has = (k: string) => its.some((it) => it.kind === k);
  const show = (id: string, on: boolean) => { const el = document.getElementById(id); if (el) el.hidden = !on; };
  show('legend-ballast', (design.options?.ballast ?? 'none') !== 'none');
  show('legend-baseplate', (design.options?.baseplate ?? 0) > 0);
  show('legend-grooves', !!o?.grooves.length); show('legend-checks', !!o?.checkRails.length); show('legend-crossings', !!o?.crossings.length);
  show('legend-points', its.some((it) => it.kind === 'points' && !it.off && !it.cand));
  show('legend-points-off', its.some((it) => it.kind === 'points' && it.off));
  show('legend-points-cand', its.some((it) => it.kind === 'points' && it.cand));
  show('legend-levers', has('throw'));
  show('legend-grip', !!o?.grips?.length);
  show('legend-hint', [...document.querySelectorAll<HTMLElement>('#legend-rows [data-layer]')].some((el) => !el.hidden));
}
/** A different design (a template, a file, undo or redo): the toolbar and the forms show it, nothing selected. */
function replaced() {
  canvas.setSelection([]); openCards.clear(); twSig = ''; renderOptions();
}

const download = (blob: Blob, name: string) => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
// One piece: its STL; several (a switch and its moving parts): a zip of them.
$('export-stl').addEventListener('click', () => {
  if (!pieces.length || building || stale) return;
  const base = fileBase();
  if (pieces.length === 1) download(new Blob([pieces[0].stl as BlobPart], { type: 'model/stl' }), `${base}.stl`);
  else download(new Blob([zip(pieces.map((p) => ({ name: `${base}-${p.name}.stl`, data: p.stl }))) as BlobPart], { type: 'application/zip' }), `${base}.zip`);
});
// The parts as a parts library for the layout designer (layoutparts.ts): a zip of the library's folder and a README.
$('export-layout').addEventListener('click', () => {
  if (!pieces.length || building || stale) return;
  try {
    const x = layoutParts(design, pieces, fileBase());
    download(new Blob([zip(x.files) as BlobPart], { type: 'application/zip' }), `${fileBase()}-layout-parts.zip`);
  } catch (err) { setStatus(infoEl.textContent ?? '', `Couldn't make the layout parts: ${err instanceof Error ? err.message : err}`); }
});
// The design's name (asked on Save): what it saves and downloads under.
const fileBase = () => (design.name || 'track-piece').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'track-piece';
$('save').addEventListener('click', () => {
  const name = prompt('Save the design as:', design.name || 'track-piece');
  if (name === null) return;
  // (the name isn't the track: kept, without a rebuild or an undo step)
  design.name = name.trim() || undefined; history[history.length - 1] = JSON.stringify(design); save();
  download(new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' }), `${fileBase()}.btd.json`);
});
const loadInput = $<HTMLInputElement>('load-file');
$('load').addEventListener('click', () => loadInput.click());
loadInput.addEventListener('change', async () => {
  const f = loadInput.files?.[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text()) as Design;
    if (!d || !Array.isArray(d.routes)) throw new Error("it isn't a track design (.btd.json)");
    d.version = 1; if (!Number.isFinite(d.gaugeStuds)) d.gaugeStuds = 4;
    design = d; replaced(); framed = false; changed(true); canvas.fit();
  } catch (err) { setStatus('', `Couldn't open ${f.name}: ${err instanceof Error ? err.message : err}`); }
  loadInput.value = '';
});

// ---------- the track canvas ----------
const hintEl = $('hint'), coordsEl = $('coords');
const radiusSel = $<HTMLSelectElement>('radius');
radiusSel.append(new Option('Curves: free', '-1', true, true));
radiusSel.append(new Option('Curves: LEGO radii', '0'));
for (const r of [24, 32, 40, 48, 56, 64, 72, 88, 104, 120]) radiusSel.append(new Option(`Curves: R${r}`, String(r)));
// (remembered: it's how you like to draw, not part of the design)
try { const v = localStorage.getItem('btd-radius'); if (v && [...radiusSel.options].some((op) => op.value === v)) radiusSel.value = v; } catch { /* fine */ }
radiusSel.addEventListener('change', () => { try { localStorage.setItem('btd-radius', radiusSel.value); } catch { /* fine */ } });
// What Draw lays: train track or monorail (beside the curves picker; remembered, as the curves are)
const systemSel = document.createElement('select');
systemSel.id = 'system'; systemSel.title = 'What Draw lays: train track or LEGO monorail. A branch drawn off a track is the same as that track.';
systemSel.append(new Option('Track: train', 'train'), new Option('Track: monorail', 'monorail'));
try { const v = localStorage.getItem('btd-system'); if (v === 'monorail') systemSel.value = v; } catch { /* fine */ }
systemSel.addEventListener('change', () => { try { localStorage.setItem('btd-system', systemSel.value); } catch { /* fine */ } });
radiusSel.after(systemSel);
const canvas = new TrackCanvas($<HTMLCanvasElement>('track'), {
  design: () => design,
  changed: (commit) => changed(commit, commit), // (one undo step per finished action, none for each mouse move)
  select: () => { render(); updateSelbar(); },
  radius: () => Number(radiusSel.value),
  system: () => (systemSel.value === 'monorail' ? 'monorail' : 'train'),
  leaveDraw: () => setMode('select'),
  status: (hint, at) => {
    hintEl.textContent = hint;
    coordsEl.textContent = at ? `x ${at[0]}, y ${at[1]} studs` : '';
  },
});
// Plan layers on and off: click one in the legend (remembered).
try { const v = localStorage.getItem('btd-hidden'); if (v) for (const k of JSON.parse(v) as string[]) canvas.hidden.add(k); } catch { /* fine */ }
document.querySelectorAll<HTMLElement>('#legend [data-layer]').forEach((el) => {
  const k = el.dataset.layer!;
  el.title = 'Click to show or hide this on the plan';
  el.classList.toggle('off', canvas.hidden.has(k));
  el.addEventListener('click', () => {
    if (canvas.hidden.has(k)) canvas.hidden.delete(k); else canvas.hidden.add(k);
    el.classList.toggle('off', canvas.hidden.has(k));
    try { localStorage.setItem('btd-hidden', JSON.stringify([...canvas.hidden])); } catch { /* fine */ }
    canvas.draw();
  });
});
// (the legend folded away, remembered)
const legendEl = $('legend');
const foldLegend = (on: boolean) => { legendEl.classList.toggle('folded', on); $('legend-fold').textContent = on ? '+' : '–'; try { localStorage.setItem('btd-legend', on ? '0' : '1'); } catch { /* fine */ } };
try { foldLegend(localStorage.getItem('btd-legend') === '0'); } catch { /* fine */ }
$('legend-fold').addEventListener('click', () => foldLegend(!legendEl.classList.contains('folded')));
canvas.draw();
(window as unknown as { btdCanvas: unknown }).btdCanvas = canvas; // (for the browser checks)
const setMode = (m: 'draw' | 'select') => {
  canvas.mode = m; canvas.stopDrawing();
  $('mode-draw').classList.toggle('on', m === 'draw'); $('mode-select').classList.toggle('on', m === 'select');
};
$('mode-draw').addEventListener('click', () => setMode('draw'));
$('mode-select').addEventListener('click', () => setMode('select'));
$('fit').addEventListener('click', () => canvas.fit());
// Show or hide the 3D preview (remembered in the browser).
const mainEl = document.querySelector('main')!;
const set3d = (on: boolean) => {
  mainEl.classList.toggle('no3d', !on);
  // (the status line, with the build's progress, goes with the plan while the 3D view is hidden)
  (on ? $('view3d') : $('plan')).append($('buildstatus'), $('status'));
  $('toggle-3d').classList.toggle('on', on);
  try { localStorage.setItem('btd-3d', on ? '1' : '0'); } catch { /* fine */ }
};
let show3d = true;
try { show3d = localStorage.getItem('btd-3d') !== '0'; } catch { /* fine */ }
set3d(show3d);
$('toggle-3d').addEventListener('click', () => { show3d = !show3d; set3d(show3d); });
const restore = (json: string) => { design = JSON.parse(json); replaced(); save(); render(); canvas.draw(); updateHistoryButtons(); requestBuild(); };
const undo = () => { if (history.length > 1) { future.push(history.pop()!); restore(history[history.length - 1]); } };
const redo = () => { if (future.length) { const j = future.pop()!; history.push(j); restore(j); } };
function updateHistoryButtons() {
  ($('undo') as HTMLButtonElement).disabled = history.length <= 1;
  ($('redo') as HTMLButtonElement).disabled = !future.length;
}
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
addEventListener('keydown', (e) => {
  if (typingIn(e)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  // (the design's file, not the browser's Save page and Open file)
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); $('save').click(); }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); $('load').click(); }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'd' || e.key === 'D') setMode('draw');
  if (e.key === 's' || e.key === 'S') setMode('select');
  if (e.key === 'p' || e.key === 'P') { show3d = !show3d; set3d(show3d); }
  if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) canvas.fit();
  if (e.key === '?') helpEl.classList.toggle('open');
  if (e.key === ',') openSettings(settingsEl.hidden);
  if (e.key === 'Escape') helpEl.classList.remove('open');
});

// Settings: a panel down the right (as the routes' down the left), shown or hidden from the toolbar (or ","), remembered.
const settingsEl = $('settings');
function openSettings(on: boolean, draw = true) {
  settingsEl.hidden = !on; document.body.classList.toggle('settings', on); $('settings-open').classList.toggle('on', on);
  try { localStorage.setItem('btd-settings', on ? '1' : '0'); } catch { /* fine */ }
  if (on && draw) renderOptions();
}
// (drawn with the rest of the form further down)
try { if (localStorage.getItem('btd-settings') === '1') openSettings(true, false); } catch { /* fine */ }
$('settings-open').addEventListener('click', () => openSettings(settingsEl.hidden));
$('settings-close').addEventListener('click', () => openSettings(false));
{
  const search = $<HTMLInputElement>('settings-search');
  search.addEventListener('input', () => { optQuery = search.value.trim(); renderOptions(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; optQuery = ''; renderOptions(); } });
  $('settings-fold').addEventListener('click', () => {
    const fold = OPTION_FORM.some((sec) => openSecs.has(sec.title));
    for (const sec of OPTION_FORM) { if (fold) openSecs.delete(sec.title); else openSecs.add(sec.title); }
    keepSecs(); renderOptions();
  });
}

// Help
const helpEl = $('help');
$('help-open').addEventListener('click', () => helpEl.classList.add('open'));
$('about-open').addEventListener('click', () => { helpEl.classList.add('open'); $('about').scrollIntoView({ block: 'start' }); });
$('help-close').addEventListener('click', () => helpEl.classList.remove('open'));

// The routes panel: shown or hidden (remembered).
const setPanel = (on: boolean) => {
  document.body.classList.toggle('nopanel', !on);
  $('toggle-panel').classList.toggle('on', on);
  try { localStorage.setItem('btd-panel', on ? '1' : '0'); } catch { /* fine */ }
};
let showPanel = true;
try { showPanel = localStorage.getItem('btd-panel') !== '0'; } catch { /* fine */ }
setPanel(showPanel);
$('toggle-panel').addEventListener('click', () => { showPanel = !showPanel; setPanel(showPanel); });

// The splitter between the plan and the 3D view (its share remembered).
const splitter = $('splitter');
const setSplit = (f: number) => {
  f = Math.min(0.85, Math.max(0.15, f));
  mainEl.style.setProperty('--plan', `${f}fr`); mainEl.style.setProperty('--view', `${1 - f}fr`);
  return f;
};
try { const f = Number(localStorage.getItem('btd-split')); if (f) setSplit(f); } catch { /* fine */ }
splitter.addEventListener('pointerdown', (e) => {
  splitter.setPointerCapture(e.pointerId); splitter.classList.add('dragging');
  const box = mainEl.getBoundingClientRect();
  const mv = (ev: PointerEvent) => {
    const f = setSplit((ev.clientY - box.top) / box.height);
    try { localStorage.setItem('btd-split', String(f)); } catch { /* fine */ }
  };
  splitter.addEventListener('pointermove', mv);
  splitter.addEventListener('pointerup', () => { splitter.removeEventListener('pointermove', mv); splitter.classList.remove('dragging'); }, { once: true });
});
splitter.addEventListener('dblclick', () => { mainEl.style.removeProperty('--plan'); mainEl.style.removeProperty('--view'); try { localStorage.removeItem('btd-split'); } catch { /* fine */ } });
// (an empty plan: straight on to drawing)
$('clear').addEventListener('click', () => { if (!design.routes.length) return; design.routes = []; canvas.setSelection([]); changed(true); setMode('draw'); });
if (!design.routes.length) setMode('draw');

render();
changed();


// ---------- selection: copy, cut, paste, duplicate, mirror, turn ----------
let clipboard: DRoute[] = [];
const selected = () => canvas.selection().filter((i) => i < design.routes.length);
const nextName = () => freeName(design, 'R');
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Add routes (copies), moved by (dx, dy) studs, and select them. */
function addRoutes(list: DRoute[], dx: number, dy: number) {
  const first = design.routes.length;
  for (const r of list) design.routes.push({ ...structuredClone(r), name: nextName(), x: r3(r.x + dx), y: r3(r.y + dy) });
  canvas.setSelection(list.map((_, k) => first + k));
  changed(true);
}
function copySel() {
  clipboard = selected().map((i) => structuredClone(design.routes[i]));
  try { void navigator.clipboard?.writeText(JSON.stringify({ btdRoutes: clipboard })); } catch { /* fine */ }
}
function deleteSel() {
  for (const i of selected().sort((a, b) => b - a)) design.routes.splice(i, 1);
  canvas.setSelection([]); openCards.clear(); changed(true);
}
function pasteClip() {
  if (!clipboard.length) return;
  const m = canvas.mouseStuds(), p0 = clipboard[0];
  // at the mouse (the first route's start there), or a little over
  addRoutes(clipboard, m ? m[0] - p0.x : 8, m ? m[1] - p0.y : 8);
}
/** Transform the selection about its first route's start. */
function transformSel(f: (r: DRoute, px: number, py: number) => void) {
  const sel = selected(); if (!sel.length) return;
  const { x: px, y: py } = design.routes[sel[0]];
  for (const i of sel) f(design.routes[i], px, py);
  changed(true);
}
const mirrorSel = () => transformSel((r, px) => {
  r.x = r3(2 * px - r.x); r.heading = r3(-r.heading);
  for (const sg of r.segs) if (sg.kind === 'curve') sg.angle = -sg.angle;
});
const turnSel = (a: number) => transformSel((r, px, py) => {
  const c = Math.cos((a * Math.PI) / 180), sn = Math.sin((a * Math.PI) / 180), dx = r.x - px, dy = r.y - py;
  r.x = r3(px + dx * c - dy * sn); r.y = r3(py + dx * sn + dy * c);
  r.heading = r3((((r.heading + a + 180) % 360) + 360) % 360 - 180);
});
function updateSelbar() {
  const n = selected().length, bar = $('selbar');
  bar.hidden = n === 0 && clipboard.length === 0;
  $('sel-count').textContent = n ? `${n} selected` : 'clipboard:';
  for (const id of ['sel-copy', 'sel-cut', 'sel-dup', 'sel-mirror', 'sel-rotl', 'sel-rotr', 'sel-del']) ($(id) as HTMLButtonElement).disabled = n === 0;
  ($('sel-paste') as HTMLButtonElement).disabled = clipboard.length === 0;
}
$('sel-copy').addEventListener('click', () => { copySel(); updateSelbar(); });
$('sel-cut').addEventListener('click', () => { copySel(); deleteSel(); updateSelbar(); });
$('sel-paste').addEventListener('click', () => { pasteClip(); updateSelbar(); });
$('sel-dup').addEventListener('click', () => { copySel(); addRoutes(clipboard, 8, 0); updateSelbar(); });
$('sel-mirror').addEventListener('click', mirrorSel);
$('sel-rotl').addEventListener('click', () => turnSel(90));
$('sel-rotr').addEventListener('click', () => turnSel(-90));
$('sel-del').addEventListener('click', () => { deleteSel(); updateSelbar(); });
addEventListener('keydown', (e) => {
  if (typingIn(e)) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'c') { e.preventDefault(); copySel(); }
  else if (mod && k === 'x') { e.preventDefault(); copySel(); deleteSel(); }
  else if (mod && k === 'v') { e.preventDefault(); pasteClip(); }
  else if (mod && k === 'd') { e.preventDefault(); copySel(); addRoutes(clipboard, 8, 0); }
  else if (mod && k === 'a') { e.preventDefault(); canvas.setSelection(design.routes.map((_, i) => i)); }
  else if (!mod && k === 'm') mirrorSel();
  else if (!mod && k === 'r') turnSel(e.shiftKey ? 90 : -90);
  else return;
  updateSelbar();
});
updateSelbar();


// ---------- piece options (switch.scad's Customizer settings, and the underside) ----------
/** What the options panel needs to know to show only what applies. */
interface OptCtx { o: PieceOptions; ballast: boolean; fdb: boolean; switches: boolean | undefined }
interface OptChoice { v: string; t: string; tip?: string; /** its drawback */ con?: string; /** why it can't be built now */ no?: (c: OptCtx) => string | undefined }
interface OptField {
  key: string; label: string; help?: string; step?: number; min?: number; max?: number;
  choices?: OptChoice[]; check?: boolean;
  /** a line of text */
  text?: boolean;
  /** a choice's value is a number (stored as one) */
  numeric?: boolean;
  /** a small heading over this field, grouping it with the ones after it */
  sub?: string;
  /** the form drawn again when it changes (other fields depend on it) */
  rerender?: boolean;
  /** why it can't be changed now (another setting rules it out): shown greyed out with this reason; undefined: it can */
  off?: (c: OptCtx) => string | undefined;
  /** (older form) changeable only when this says so */
  when?: (c: OptCtx) => boolean;
  /** its default, where it isn't in OPTION_DEFAULTS */
  def?: string | number | boolean;
  get?: () => string | number | boolean; set?: (v: string | number | boolean) => void;
}
interface OptSection { title: string; switches?: boolean; fields: OptField[] }
/** (buffer stop settings) why they don't apply: no route ends in one */
const noBuf = () => (design.routes.some((r) => r.startEnd === 'buffer' || r.endEnd === 'buffer') ? undefined : 'no route ends in a buffer stop (set Starts in / Ends in on a route card)');
const OPTION_FORM: OptSection[] = [
  { title: 'Track', fields: [
    { key: 'gaugeStuds', label: 'Gauge, studs', step: 1, min: 2, max: 10, rerender: true, help: 'Studs between the rails. LEGO track is 4.',
      def: 4, get: () => design.gaugeStuds, set: (v) => { design.gaugeStuds = Math.round(Number(v)); } },
    { key: 'sleepers', label: 'Under the rails', choices: [
      { v: 'bed', t: 'Solid bed', tip: 'One solid bed under the rails, like LEGO switches.' },
      { v: 'sleepers', t: 'Sleepers with gaps', tip: 'Separate sleepers, like LEGO straight and curved track. Where tracks meet (switches, crossings) the bed stays solid.',
        con: 'The rails print as bridges over the gaps. A cut in a gap is held by the rails only.',
        no: (c) => (c.ballast ? 'it\'s for track without ballast, so a solid bed is built' : undefined) }] },
    { key: 'sleeperWidthStuds', label: 'Sleeper width', numeric: true, off: (c) => (c.ballast ? 'with ballast there are no separate sleepers' : c.o.sleepers !== 'sleepers' ? 'set Under the rails to Sleepers with gaps' : undefined), choices: [
      { v: '2', t: '2 studs', tip: 'Like LEGO sleepers.' },
      { v: '1', t: '1 stud', tip: 'Narrow, like bridge ties.' }] },
    { key: 'sleeperGapStuds', label: 'Gap between sleepers, studs', step: 1, min: 1, max: 6, off: (c) => (c.ballast ? 'with ballast there are no separate sleepers' : c.o.sleepers !== 'sleepers' ? 'set Under the rails to Sleepers with gaps' : undefined), help: 'LEGO track is 2.' },
    { key: 'curveStuds', label: 'Studs on the track', choices: [
      { v: 'grid', t: 'On the baseplate grid', tip: 'Every stud lines up with the baseplate. On curves they form a grid, not rows.' },
      { v: 'follow', t: 'In rows along the track', tip: 'Rows across the track, like LEGO track, so tiles fit across curves.', con: 'On curves the studs are off the baseplate grid.' }] },
  ] },
  { title: 'Underside and ballast', fields: [
    { key: 'ballast', label: 'Ballast', choices: [
      { v: 'none', t: 'None', tip: 'Track only, like LEGO track.' },
      { v: 'ballast', t: 'Ballast', tip: 'The track sits on a stepped ballast shoulder.' },
      { v: 'buddy', t: 'Ballast + buddy layer', tip: 'Ballast with a wider bottom layer.' }] },
    { key: 'bottomStyle', label: 'Ballast underside', off: (c) => (c.ballast ? undefined : 'only with ballast'), choices: [
      { v: 'antistud', t: 'Anti-studs (grips the baseplate)', tip: 'Hollow with LEGO tubes, so it clicks onto the baseplate.' },
      { v: 'float', t: 'Flat', tip: 'Flat underneath. It rests on the studs without gripping.' }] },
    { key: 'grip', label: 'Grip on the baseplate', off: (c) => (c.ballast && c.o.bottomStyle === 'float' ? 'Ballast underside is Flat, so nothing grips' : undefined),
      def: 'edges', get: () => design.grip ?? 'edges', set: (v) => { design.grip = v as Design['grip']; }, choices: [
        { v: 'edges', t: 'Along the edges', tip: 'Like a LEGO plate: tubes grip along the edges and every 4 studs (green circles on the plan). Firm, and comes off again.' },
        { v: 'all', t: 'Every stud', tip: 'A socket on every stud.', con: 'Grips very hard: can be difficult to pull off.' }] },
    { key: 'trackBallast', label: 'Track and ballast printed', off: (c) => (c.ballast ? undefined : 'only with ballast'), choices: [
      { v: 'together', t: 'Together', tip: 'Track and ballast print as one part.' },
      { v: 'apart', t: 'Apart', tip: 'Track and ballast print as separate parts (…-track, …-ballast). The track drops into a seat in the ballast.',
        con: 'Twice as many parts. The track is held only by its fit and the baseplate; with a solid bed the seat is just the ballast steps (with sleepers, each sleeper gets a pocket).' }] },
    { key: 'trackFitTol', label: 'Track fit in the seat, mm', step: 0.05, min: 0, max: 1, off: (c) => (!c.ballast ? 'only with ballast' : c.o.trackBallast !== 'apart' ? 'Track and ballast printed is Together' : undefined), help: 'Gap round the track in its seat.' },
    { key: 'pegOnBallast', label: 'Peg and clip on ballast ends', check: true, off: (c) => (c.ballast ? undefined : 'only with ballast'), help: 'Keeps the peg and clip on the end connectors, so pieces clip together. They print on small breakaway supports. Off: the ends just butt together.' },
    { key: 'axleHoles', label: 'LEGO axle holes through the ends', check: true, off: (c) => (c.o.ballast !== 'buddy' ? 'needs Ballast + buddy layer' : c.o.trackBallast === 'apart' ? 'not with Track and ballast printed Apart' : undefined), help: 'Cross-axle holes through each end, so a LEGO axle pins two pieces together.' },
  ] },
  { title: 'Switches: points', switches: true, fields: [
    { key: 'mechStyle', label: 'Mechanism', choices: [
      { v: 'plates', t: 'Blades on top, on pins', tip: 'Each blade sits on a plate on top of the bed and turns on a pin. Everything goes in from above.' },
      { v: 'tines', t: 'Under the bed, on spring tines', tip: 'The points sit in pockets under the bed on springy tines. They go in from below.' }] },
    { key: 'pointsPieces', label: 'Points printed as', off: (c) => (c.fdb ? 'only with Mechanism: Under the bed, on spring tines' : undefined),
      def: '1', get: () => String(design.pointsPieces ?? 1), set: (v) => { design.pointsPieces = Number(v) as 1 | 2; }, choices: [
        { v: '1', t: 'One part', tip: 'Both blades on one pivot.' },
        { v: '2', t: 'Two parts', tip: 'Each blade on its own pivot and spring.' }] },
    { key: 'bladeHold', label: 'Blades held down by', off: (c) => (c.fdb ? undefined : 'only with Mechanism: Blades on top, on pins'), choices: [
      { v: 'lip', t: 'Snap lip on the pin', tip: 'Each blade plate snaps over a lip on its pin. Nothing extra to print.', con: 'A printed lip can wear.' },
      { v: 'bracket', t: 'Small bracket over the blade', tip: 'A small bracket pegged into the bed covers each blade plate so it can\'t lift.', con: 'Two more small parts to print.' }] },
    { key: 'bladeStyle', label: 'Blade shape', off: (c) => (c.fdb ? undefined : 'only with Mechanism: Blades on top, on pins'), choices: [
      { v: 'simple', t: 'Simple', tip: 'Each blade is its rail, cut off along the rail it closes against.' },
      { v: 'prototype', t: 'Realistic (planed, tucked under the rail)', tip: 'Blades planed to a point and tucked under the stock rail head, so flanges can\'t catch them.',
        con: 'Fit the blades swung open, then close them. The stock rail head is thinner along the points.' }] },
    { key: 'pointsModule', label: 'Points go in', off: (c) => (c.fdb ? 'only with Mechanism: Under the bed, on spring tines' : undefined), choices: [
      { v: 'built-in', t: 'From below', tip: 'The pockets open through the bottom. Fit the points before putting the track on the baseplate.' },
      { v: 'layers', t: 'From above, under a lid', tip: 'A lower layer holds the moving parts; the deck with the rails clips on top with studs.',
        no: (c) => (c.ballast ? undefined : 'it needs ballast, so the points go in from below') }] },
    { key: 'pointThrow', label: 'Blade throw, mm', step: 0.25, min: 2, max: 6, help: 'How far the blade tips move.' },
    { key: 'pointClearance', label: 'Clearance, mm', step: 0.05, min: 0.1, max: 0.8, help: 'Gap round the moving parts.' },
    { key: 'springPreload', label: 'Spring preload, mm', step: 0.25, min: 0, max: 3, help: 'How far past closed the springs push the blades, to hold them shut.' },
    { key: 'springThickness', label: 'Spring thickness, mm', step: 0.05, min: 0.5, max: 2, off: (c) => (c.fdb ? 'only with Mechanism: Under the bed, on spring tines' : undefined), help: 'Thickness of the spring tines.' },
    { key: 'springLength', label: 'Spring length, mm', step: 1, min: 15, max: 80, off: (c) => (c.fdb ? 'only with Mechanism: Under the bed, on spring tines' : undefined), help: 'Length of the spring tines. Each lever can also be dragged along on the plan.' },
    { key: 'bladeDiscD', label: 'Pivot disc diameter, mm', step: 1, min: 10, max: 24, off: (c) => (c.fdb ? 'only with Mechanism: Under the bed, on spring tines' : undefined), help: 'The disc the points pivot on. Bigger is steadier but needs more room under the bed.' },
  ] },
  { title: 'Switches: throw', switches: true, fields: [
    { key: 'throwStyle', label: 'Throw', choices: [
      { v: 'built-in', t: 'Lever built into the arm', tip: 'The lever mounts on the track piece itself.' },
      { v: 'bracket', t: 'Lever on a bracket', tip: 'The lever sits on a separate 3 x 3 stud bracket on the arm.' },
      { v: 'stand', t: 'Switch stand (ground throw)', tip: 'A handle beside the track, like a real ground throw. It locks at each end.',
        con: 'A train trailing through against it derails unless the points spring back. A three-way\'s middle position isn\'t locked.',
        no: (c) => (c.fdb ? undefined : 'only with Mechanism: Blades on top, on pins') }] },
    { key: 'throwAction', label: 'Points held by', off: (c) => (c.fdb ? undefined : 'only with Mechanism: Blades on top, on pins'), choices: [
      { v: 'detent', t: 'Lever click', tip: 'The lever clicks into place at each end.', con: 'A train trailing through the wrong way can push the points part way and derail.' },
      { v: 'overcentre', t: 'Over-centre spring', tip: 'A printed spring snaps the points to whichever side they\'re pushed. Trains can trail through.', con: 'The spring is light (about 0.3 N) and depends on print accuracy. Not on three-ways or with a switch stand.' },
      { v: 'springback', t: 'Spring-back', tip: 'The blades give way for a trailing train and spring back after it. Use with the switch stand.', con: 'Wider blade plates and a lighter hold on the closed blade.' }] },
    { key: 'throwSide', label: 'Lever side', help: 'For every switch, unless set on the branch route\'s card or dragged on the plan.', choices: [
      { v: 'auto', t: 'Auto', tip: 'On the side the branch leaves (a three-way: right).' },
      { v: 'left', t: 'Left', tip: 'Left, facing along the points from the toe.' },
      { v: 'right', t: 'Right', tip: 'Right, facing along the points from the toe.' }] },
    { key: 'leverOffset', label: 'Lever distance from track, mm', step: 1, min: -24, max: 30, help: 'How far past the sleeper ends. Each lever can also be dragged on the plan.' },
    { key: 'throwBallast', label: 'Ballast round the lever', check: true, off: (c) => (c.ballast ? undefined : 'only with ballast'), help: 'The ballast steps continue round the lever arm, so the lever stands on ballast.' },
  ] },
  { title: 'Buffer stops', fields: [
    { key: 'bufferStyle', label: 'Style', off: () => noBuf(), choices: [
      { v: 'frame', t: 'Rail-built frame with buffers', tip: 'A braced frame over each rail, a beam across with two sprung buffers, like a real buffer stop.' },
      { v: 'blocks', t: 'Brick posts', tip: 'Two 2 x 2 posts with studs on top to build on, joined by a beam.' }] },
    { key: 'bufferPostPlates', label: 'Post height, plates', step: 1, min: 4, max: 15, off: (c) => noBuf() ?? (c.o.bufferStyle === 'blocks' ? undefined : 'only with Style: Brick posts'), help: 'Height of the posts above the ballast top, with studs on top.' },
    { key: 'bufferBeamBottom', label: 'Beam bottom above the rails, mm', step: 0.5, min: 0, max: 10, off: () => noBuf(), help: 'Set it to meet your trains\' buffers or magnets.' },
    { key: 'bufferBeamTop', label: 'Beam top above the rails, mm', step: 0.5, min: 4, max: 20, off: () => noBuf() },
    { key: 'bufferPinHoles', label: 'Pin holes in the posts', check: true, off: (c) => noBuf() ?? (c.o.bufferStyle === 'blocks' ? undefined : 'only with Style: Brick posts'), help: 'Holes for LEGO Technic pins at beam height: for a bumper, lights or a sign.' },
  ] },
  { title: 'Labels', fields: [
    { key: 'labelText', label: 'Label text', text: true, off: (c) => (c.ballast && c.o.bottomStyle === 'float' ? undefined : 'labels go only on a flat underside: set Ballast to Ballast and Ballast underside to Flat'), help: 'Engraved under each part, mirrored to read from below. Empty: no labels.' },
    { key: 'labelSize', label: 'Add the size (S16, R40 22.5°)', check: true, off: (c) => (c.ballast && c.o.bottomStyle === 'float' ? undefined : 'labels go only on a flat underside: set Ballast to Ballast and Ballast underside to Flat') ?? (c.o.labelText ? undefined : 'Label text is empty') },
    { key: 'labelGauge', label: 'Add the gauge (Ln4)', check: true, off: (c) => (c.ballast && c.o.bottomStyle === 'float' ? undefined : 'labels go only on a flat underside: set Ballast to Ballast and Ballast underside to Flat') ?? (c.o.labelText ? undefined : 'Label text is empty') },
    { key: 'labelParts', label: 'Number parts cut for the bed (#2)', check: true, off: (c) => (c.ballast && c.o.bottomStyle === 'float' ? undefined : 'labels go only on a flat underside: set Ballast to Ballast and Ballast underside to Flat') ?? (c.o.labelText ? undefined : 'Label text is empty'), help: 'Matches the part\'s file name.' },
  ] },
  { title: 'Check rails and flangeways', fields: [
    { key: 'checkRailLen', label: 'Check rail length, mm', step: 2, min: 10, max: 80 },
    { key: 'checkRailW', label: 'Check rail width, mm', step: 0.1, min: 1, max: 3 },
    { key: 'checkRailFlare', label: 'Check rail end flare, mm', step: 0.25, min: 0, max: 4, help: 'How far the ends bend out to guide the flanges in.' },
    { key: 'flangeway', label: 'Flangeway width, mm', step: 0.1, min: 1, max: 4 },
    { key: 'flangewayDepth', label: 'Flangeway depth, mm', step: 0.5, min: 1, max: 6 },
  ] },
  { title: 'Print bed and joints', fields: [
    { key: 'printBedX', label: 'Print bed width, mm', step: 1, min: 50, max: 1000 },
    { key: 'printBedY', label: 'Print bed depth, mm', step: 1, min: 50, max: 1000 },
    { key: 'baseplate', label: 'Cut at baseplate edges', numeric: true, help: 'So every part sits on one baseplate (orange dashed lines on the plan).', choices: [
      { v: '0', t: 'No' }, { v: '16', t: '16 x 16 studs' }, { v: '32', t: '32 x 32 studs' }, { v: '48', t: '48 x 48 studs' }, { v: '64', t: '64 x 64 studs' }, { v: '96', t: '96 x 96 studs' }] },
    { key: 'baseplateX', label: 'Baseplate corner x, studs', step: 1, off: (c) => ((c.o.baseplate ?? 0) > 0 ? undefined : 'Cut at baseplate edges is No'), help: 'Where a baseplate corner is on the grid.' },
    { key: 'baseplateY', label: 'Baseplate corner y, studs', step: 1, off: (c) => ((c.o.baseplate ?? 0) > 0 ? undefined : 'Cut at baseplate edges is No'), help: 'Where a baseplate corner is on the grid.' },
    { key: 'joint', label: 'Parts join with', help: 'How parts cut for the print bed or baseplates join.', choices: [
      { v: 'lego', t: 'Rail tongues + peg and clip', tip: 'Like LEGO track ends.' },
      { v: 'dovetail', t: 'Rail tongues + dovetails', tip: 'Stronger. Slides together from above.' },
      { v: 'butt', t: 'Straight cuts', tip: 'Nothing joins them; the baseplate holds them in line.' },
      { v: 'axle', t: 'Rail tongues + LEGO axles', tip: 'A cross-axle hole across each cut, for a 4-stud axle.', no: (c) => (c.ballast ? undefined : 'needs ballast (track alone is too thin): peg and clip is used instead') },
      { v: 'ends', t: 'Separate pieces with track ends', tip: 'Plain track cut into lengths with normal end connectors. Switches and crossings stay whole.' }] },
    { key: 'cutRails', label: 'Rails at cuts', off: (c) => (c.o.joint === 'butt' ? 'Parts join with is Straight cuts' : undefined), choices: [
      { v: 'tongues', t: 'Interlocking tongues', tip: 'Like LEGO track ends.', con: 'The tongues overhang, so they print with supports.' },
      { v: 'flat', t: 'Cut flat', tip: 'Nothing overhangs, no supports.', con: 'Only the bed joint and the baseplate keep the rails in line.' }] },
    { key: 'endSupports', label: 'Supports under rail ends', check: true, help: 'Breakaway supports under the rail-end tongues. Off: leave it to your slicer.' },
  ] },
  { title: 'Monorail', fields: [
    { key: 'monoEndStuds', label: 'Studs at the ends', off: noMono, choices: [
      { v: 'side', t: 'Out of the sides', tip: 'Hollow studs out of both sides of each end, like LEGO monorail track.' },
      { v: 'top', t: 'On top, in recesses', tip: 'Two studs in a recess each side of the ridge at each end. A 1 x 2 tile sits in flush; a 1 x 4 plate across a joint holds it.' },
      { v: 'none', t: 'None', tip: 'Plain ends, the full beam width.' }] },
    { key: 'monoAxleHoles', label: 'Axle holes in the ends', check: true, off: noMono, help: 'Two LEGO cross-axle holes in each end face, to pin pieces together with axles.' },
    { key: 'monoAxleLengthStuds', label: 'Joining axle length, studs', step: 1, min: 2, max: 6, off: (c) => noMono(c) ?? (c.o.monoAxleHoles === false ? 'Axle holes in the ends is off' : undefined), help: 'Each end\'s hole takes half the axle.' },
    { key: 'monoHoleFit', label: 'Hole fit, mm', step: 0.05, min: 0, max: 0.5, off: noMono, help: 'Added round the axle holes and anti-studs. Bigger: looser.' },
    { key: 'monoLegoAntistud', label: 'Anti-stud depth', off: noMono, get: () => ((design.options?.monoLegoAntistud ?? false) ? 'lego' : 'short'), set: (v) => { design.options = { ...design.options, monoLegoAntistud: v === 'lego' }; }, def: 'short', choices: [
      { v: 'short', t: '2.2 mm', tip: 'Deep enough for a stud, with room for the axle holes above.' },
      { v: 'lego', t: '4 mm, like LEGO', tip: 'As deep as LEGO monorail track\'s anti-studs.',
        con: 'The axle holes move: side-stud and top-stud pieces then don\'t join with axles; on side-stud pieces only 0.2 mm is left between hole and anti-stud; the end notch opens into a hole.' }] },
    { key: 'monoLabels', label: 'Engraved underneath', off: noMono, choices: [
      { v: 'name', t: 'Design name and part name', tip: 'Two lines underside, reading from below: the design\'s name (if it has one) and the part\'s name, as its file.' },
      { v: 'part', t: 'Part name', tip: 'One line underside: the part\'s name, as its file.' },
      { v: 'none', t: 'Nothing', tip: 'A plain underside.' }] },
    { key: 'monoSwitchTravel', label: 'Points frame slide, mm', step: 0.5, min: 10, max: 40, sub: 'Points', off: noMono, help: 'How far the points\' frame slides. The idle rack moves this far aside, clear of the train. LEGO\'s: about 27.' },
    { key: 'monoSwitchFit', label: 'Points clearance, mm', step: 0.05, min: 0.1, max: 0.6, off: noMono, help: 'The gap round the sliding frame.' },
    { key: 'monoSupportStuds', label: 'Support every, studs', step: 4, min: 0, max: 256, sub: 'Supports', off: noMono, help: 'A support column under the beam this often, each its own part. 0: none. Parts are cut over a support where they can.' },
    { key: 'monoSupportBricks', label: 'Support height, bricks', step: 1, min: 1, max: 30, off: noSupports, help: 'Height of the beam\'s underside above the baseplate. LEGO\'s supports: 5 and 10.' },
    { key: 'monoSupportPlates', label: 'Extra height, plates', step: 1, min: 0, max: 2, off: noSupports, help: 'Plates added on top of the bricks.' },
    { key: 'monoSupportBaseXStuds', label: 'Support base across, studs', step: 1, min: 2, max: 16, off: noSupports, help: 'Base plate size across the legs. LEGO\'s: 4 (short), 6 (tall).' },
    { key: 'monoSupportBaseYStuds', label: 'Support base along, studs', step: 1, min: 2, max: 16, off: noSupports, help: 'Base plate size along the track. LEGO\'s: 4 (short), 6 (tall).' },
    { key: 'monoSupportAntistud', label: 'Support grips the baseplate', check: true, off: noSupports, help: 'Hollow under the base with LEGO tubes.' },
    { key: 'monoSupportBaseStuds', label: 'Studs round the support base', check: true, off: noSupports, help: 'Studs along the base\'s edges to build onto, like LEGO\'s supports.' },
    { key: 'monoSupportSolid', label: 'Support frame closed', check: true, off: noSupports, help: 'A full web between the legs, no openings. Stiffer; more to print.' },
  ] },
  { title: 'LEGO fit', fields: [
    { key: 'studFit', label: 'Stud fit, mm', step: 0.01, min: -0.3, max: 0.5, help: 'Added to the 4.8 mm studs. Bigger: bricks grip tighter.' },
    { key: 'antistudFit', label: 'Anti-stud fit, mm', step: 0.01, min: -0.3, max: 0.5, help: 'Makes the tubes underneath looser. Bigger: grips the baseplate less.' },
  ] },
];
/** Why the monorail settings can't be changed: no monorail in the design (undefined: there is). */
function noMono(_c?: OptCtx) { return design.routes.some(isMono) ? undefined : 'no monorail track in this design'; }
function noSupports(c: OptCtx) { return noMono(c) ?? ((c.o.monoSupportStuds ?? 0) > 0 ? undefined : 'Support every is 0'); }
let optSig = '';
/** After a build: the options panel again if what applies has changed (switches appearing or going). */
/** After a build: the route cards again if which routes branch has changed (a branch's card has its lever's side). */
let branchSig = '';
function refreshRoutes() {
  const sig = JSON.stringify((canvas.overlay?.items ?? []).filter((it) => it.kind === 'points' && !it.cand).map((it) => [it.key, it.routes]));
  if (sig !== branchSig) { branchSig = sig; render(); }
}
function refreshOptions() {
  if (JSON.stringify([design.options, design.grip, design.pointsPieces, design.gaugeStuds, switchesNow(), noMono()]) !== optSig) renderOptions();
}
/** Switches in the design, as last built (undefined: not built yet). */
function switchesNow() {
  if (!hasTrack()) return false;
  const items = canvas?.overlay?.items;
  return items && items.some((it) => it.kind === 'points' && !it.off && !it.cand);
}
/** Which settings sections are open (by title), remembered in this browser; the search box's text. */
const openSecs: Set<string> = (() => { try { const v = JSON.parse(localStorage.getItem('btd-settings-open') ?? 'null'); if (Array.isArray(v)) return new Set<string>(v); } catch { /* (none kept) */ } return new Set(OPTION_FORM.slice(0, 2).map((sec) => sec.title)); })();
const keepSecs = () => { try { localStorage.setItem('btd-settings-open', JSON.stringify([...openSecs])); } catch { /* (not kept) */ } };
let optQuery = '';
function renderOptions() {
  const body = $('options-body'), scroll = $('options').scrollTop;
  const o = { ...OPTION_DEFAULTS, ...design.options } as PieceOptions;
  const c: OptCtx = { o, ballast: o.ballast !== 'none', fdb: o.mechStyle !== 'tines', switches: switchesNow() };
  optSig = JSON.stringify([design.options, design.grip, design.pointsPieces, design.gaugeStuds, c.switches, noMono()]);
  body.replaceChildren();
  const setOpt = (f: OptField, v: string | number | boolean) => {
    if (f.set) f.set(v); else design.options = { ...design.options, [f.key]: v };
  };
  // (searching: only the fields whose label, help or choices have every word in them, their sections open)
  const words = optQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (f: OptField) => { const txt = [f.label, f.help, ...(f.choices ?? []).flatMap((ch) => [ch.t, ch.tip])].join(' ').toLowerCase(); return words.every((w) => txt.includes(w)); };
  let shown = 0;
  for (const sec of OPTION_FORM) {
    const fields = sec.fields.filter((f) => !words.length || hit(f));
    if (words.length && !fields.length) continue;
    const det = document.createElement('details'); det.className = 'osec';
    det.open = words.length > 0 || openSecs.has(sec.title);
    const sum = document.createElement('summary'); sum.textContent = sec.title;
    const n = document.createElement('span'); n.className = 'n'; n.textContent = String(fields.length); sum.append(n);
    det.append(sum);
    det.addEventListener('toggle', () => { if (words.length) return; if (det.open) openSecs.add(sec.title); else openSecs.delete(sec.title); keepSecs(); });
    const box = document.createElement('div'); box.className = 'sec';
    if (sec.switches && c.switches === false) {
      box.classList.add('idle');
      const nt = document.createElement('div'); nt.className = 'note'; nt.textContent = 'No switches in this design yet: these apply where a track branches off another.';
      box.append(nt);
    }
    for (const f of fields) {
      shown++;
      if (f.sub) { const h = document.createElement('div'); h.className = 'sub'; h.textContent = f.sub; box.append(h); }
      const cur = f.get ? f.get() : (o as unknown as Record<string, string | number | boolean>)[f.key];
      const def = f.def ?? (OPTION_DEFAULTS as unknown as Record<string, string | number | boolean>)[f.key];
      // (can't be changed now: greyed out, and why, exactly)
      const off = f.off?.(c) ?? (f.when && !f.when(c) ? 'Not used with the settings above' : undefined);
      const wrap = document.createElement('div'); wrap.className = off ? 'opt off' : 'opt';
      const note = (txt: string, cls = 'desc') => { const d = document.createElement('small'); d.className = cls; d.textContent = txt; wrap.append(d); };
      if (f.choices) {
        const sel = document.createElement('select'); sel.disabled = !!off;
        for (const ch of f.choices) {
          const why = ch.no?.(c), dflt = String(def) === ch.v ? ' (default)' : '';
          const op = new Option(why ? `${ch.t}${dflt} (not available)` : `${ch.t}${dflt}`, ch.v);
          op.disabled = !!why && String(cur) !== ch.v; if (ch.tip) op.title = [ch.tip, ch.con && `Drawback: ${ch.con}`, why && `Not available: ${why}.`].filter(Boolean).join(' ');
          sel.append(op);
        }
        sel.value = String(cur);
        const lab = field(f.label, sel); lab.classList.add('stack'); wrap.append(lab);
        const chosen = f.choices.find((ch) => ch.v === String(cur)), why = chosen?.no?.(c);
        if (why) note(`Not built as chosen: ${why}.`, 'desc why');
        if (chosen?.tip) note(chosen.tip);
        if (chosen?.con) note(`Drawback: ${chosen.con}`, 'desc con');
        if (f.help) note(f.help);
        sel.addEventListener('change', () => { setOpt(f, f.numeric ? Number(sel.value) : sel.value); changed(true); renderOptions(); });
      } else if (f.text) {
        const ti = document.createElement('input'); ti.type = 'text'; ti.value = String(cur ?? ''); ti.disabled = !!off; ti.maxLength = 24;
        ti.addEventListener('change', () => { setOpt(f, ti.value.trim().toUpperCase()); changed(true); renderOptions(); });
        const lab = field(f.label, ti); lab.classList.add('stack'); wrap.append(lab);
        if (f.help) note(f.help);
      } else if (f.check) {
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = cur !== false; cb.disabled = !!off;
        cb.addEventListener('change', () => { setOpt(f, cb.checked); changed(true); renderOptions(); });
        wrap.append(field(f.label, cb));
        note([f.help, `Default: ${def === false ? 'off' : 'on'}.`].filter(Boolean).join(' '));
      } else {
        const lim = (v: number) => Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, v));
        const i = num(Number(cur), (v) => { const x = lim(v); setOpt(f, x); i.value = String(x); if (f.rerender) renderOptions(); }, f.step ?? 1, f.help ?? '');
        i.disabled = !!off;
        if (f.min !== undefined) i.min = String(f.min);
        if (f.max !== undefined) i.max = String(f.max);
        wrap.append(field(f.label, i));
        // (exactly what it takes: its range and steps, and its default)
        const range = f.min !== undefined && f.max !== undefined ? `${f.min} to ${f.max}` : f.min !== undefined ? `at least ${f.min}` : f.max !== undefined ? `at most ${f.max}` : '';
        note([f.help, [range && `Range ${range}`, def !== undefined && `default ${def}`].filter(Boolean).join(', ') + '.'].filter(Boolean).join(' '));
      }
      if (off) note(`Locked: ${off}.`, 'desc why');
      box.append(wrap);
    }
    det.append(box); body.append(det);
  }
  if (words.length && !shown) { const nm = document.createElement('div'); nm.className = 'nomatch'; nm.textContent = `No setting matches “${optQuery}”.`; body.append(nm); }
  const reset = btn('Reset to defaults', () => { design.options = {}; delete design.grip; delete design.pointsPieces; renderOptions(); }, 'Every piece setting back to its default (Undo brings them back; the gauge stays)');
  reset.classList.add('reset'); body.append(reset);
  $('options').scrollTop = scroll;
  $('settings-fold').textContent = OPTION_FORM.some((sec) => openSecs.has(sec.title)) ? 'Fold all' : 'Open all';
}
renderOptions();


// ---------- trackwork: hand edits to the check rails, flangeway cuts and points ----------
type TwItem = { kind: 'check' | 'groove' | 'points' | 'throw'; key: string; at: [number, number]; off?: boolean; len?: number; toe?: number; routes?: string[]; forced?: boolean; cand?: { ok: boolean; why: string }; lever?: { side: number; leverOffset: number; springLength: number; maxTine: number; edited: boolean } };
let twSig = '';
function renderTrackwork(list: TwItem[]) {
  const sig = JSON.stringify([list.map((it) => [it.kind, it.key, it.off, Math.round((it.len ?? 0) * 10), it.toe, it.routes, it.forced, it.cand, it.lever && [it.lever.side, it.lever.leverOffset, it.lever.springLength]]),
    design.trackwork, design.options?.throwSide, design.options?.mechStyle, design.routes.map((r) => [r.name, r.throwSide])]);
  if (sig === twSig) return; // (don't rebuild the form under the user's fingers)
  twSig = sig;
  const body = $('trackwork-body'); body.replaceChildren();
  if (!list.length) { const n = document.createElement('div'); n.className = 'none'; n.textContent = 'No check rails, flangeway cuts or points in this design.'; body.append(n); $('trackwork-count').textContent = ''; return; }
  const edit = <K extends keyof Trackwork>(kind: K, key: string, patch: Record<string, unknown>) => {
    const tw = (design.trackwork ??= {}), group = ((tw[kind] ??= {}) as Record<string, Record<string, unknown>>);
    group[key] = { ...group[key], ...patch };
    changed(true);
  };
  const names = { check: 'Check rail', groove: 'Flangeway cut', points: 'Points', throw: 'Lever' } as const;
  // Points: a row per toe (a three-way's splits share one), built or not (taken out), and a row per near miss, to force points there.
  {
    const keys = [...new Set(list.filter((it) => it.kind === 'points').map((it) => it.key))];
    let n = 0, m = 0;
    for (const key of keys) {
      const its = list.filter((it) => it.kind === 'points' && it.key === key), st = canvas.pointsState(key), cand = its.find((it) => it.cand)?.cand;
      const cur = design.trackwork?.points?.[key] ?? {};
      const row = document.createElement('div'); row.className = 'tw';
      row.addEventListener('mouseenter', () => { canvas.highlight = key; canvas.draw(); });
      row.addEventListener('mouseleave', () => { canvas.highlight = undefined; canvas.draw(); });
      const t = document.createElement('b');
      const box = (label: string, on: boolean, change: (v: boolean) => void, tip?: string) => {
        const i = document.createElement('input'); i.type = 'checkbox'; i.checked = on; if (tip) i.title = tip;
        i.addEventListener('change', () => change(i.checked));
        row.append(field(label, i));
      };
      if (st.state === 'cand') {
        t.textContent = `Could be points ${++m}${st.forced && !st.ok ? ' · too far off to build' : ''}`;
        row.append(t);
        const why = document.createElement('div'); why.className = 'none'; why.textContent = `${cand?.why ?? ''}${cand?.ok ? '' : ': too far off to force (redraw it to start on the track)'}`;
        row.append(why);
        box('Force points here', st.forced, () => canvas.togglePoints(key), 'Make points here though the track end is a hair off the other track');
      } else {
        const ids = [...new Set(its.flatMap((it) => it.routes ?? []))];
        t.textContent = `Points ${++n}${ids.length ? ` · ${ids.join(' / ')}` : ''}${st.state === 'off' ? ' · taken out' : st.forced ? ' · forced' : ''}`;
        row.append(t);
        box('Built (off: both tracks\' rails run through as plain track)', st.state === 'built', () => canvas.togglePoints(key));
        // (a three-way: each route in it or not; one taken out leaves a two-way for the others)
        if (ids.length > 2 && !cur.off) for (const id of ids) box(`${id} in the points`, !cur.drop?.includes(id), (v) => {
          const drop = (cur.drop ?? []).filter((d) => d !== id).concat(v ? [] : [id]);
          edit('points', key, { drop: drop.length ? drop : undefined });
        });
        if (st.state === 'built') { const i = num(cur.toe ?? 0, (v) => edit('points', key, { toe: v }), 1); row.append(field('Points moved along, mm', i)); }
      }
      body.append(row);
    }
  }
  for (const kind of ['throw', 'check', 'groove'] as const) {
    list.filter((it) => it.kind === kind).forEach((it, n) => {
      const row = document.createElement('div'); row.className = 'tw';
      row.addEventListener('mouseenter', () => { canvas.highlight = it.key; canvas.draw(); });
      row.addEventListener('mouseleave', () => { canvas.highlight = undefined; canvas.draw(); });
      const t = document.createElement('b');
      t.textContent = `${names[kind]} ${n + 1}${it.len ? ` · ${it.len.toFixed(1)} mm` : ''}${it.off ? ' · taken out' : ''}`;
      row.append(t);
      const cur = ((design.trackwork?.[kind] ?? {}) as Record<string, Record<string, number | boolean>>)[it.key] ?? {};
      const numField = (label: string, prop: string, step: number, min?: number) => {
        const i = num((cur[prop] as number) ?? 0, (v) => edit(kind, it.key, { [prop]: min === undefined ? v : Math.max(min, v) }), step);
        if (min !== undefined) i.min = String(min);
        row.append(field(label, i));
      };
      if (kind === 'check') {
        numField('Longer at the start, mm', 'd0', 1); numField('Longer at the end, mm', 'd1', 1); numField('Moved in from the rail, mm', 'shift', 0.1);
        const off = document.createElement('input'); off.type = 'checkbox'; off.checked = !!cur.off;
        off.addEventListener('change', () => edit(kind, it.key, { off: off.checked }));
        row.append(field('Take it out', off));
      } else if (kind === 'groove') {
        numField('Longer at the start, mm', 'd0', 1, 0); numField('Longer at the end, mm', 'd1', 1, 0);
      } else if (kind === 'throw' && it.lever) {
        // (drag the lever on the plan, or set it here; Auto: as the route or the options say)
        const lv = it.lever, ls = leverSide(design, it as unknown as OverlayItem, (canvas.overlay?.items ?? []));
        const side = document.createElement('select');
        const auto = ls.by === 'hand' ? 'Auto (as the route or the options say)' : `Auto: ${ls.side} (${ls.why})`;
        for (const [v, l] of [['auto', auto], ['left', 'Left'], ['right', 'Right']]) side.append(new Option(l, v));
        side.value = ls.by === 'hand' ? ls.side : 'auto';
        side.title = 'Left or right as you face along the points from their toe';
        side.addEventListener('change', () => {
          const tw = (design.trackwork ??= {}), g = (tw.throw ??= {}), e = { ...g[it.key] };
          if (side.value === 'auto') delete e.side; else e.side = side.value as 'left' | 'right';
          if (Object.keys(e).length) g[it.key] = e; else delete g[it.key];
          changed(true);
        });
        const sf = field('Side', side); sf.classList.add('stack'); row.append(sf);
        const out = num(lv.leverOffset, (v) => edit('throw', it.key, { leverOffset: Math.max(0, v) }), 1); out.min = '0';
        row.append(field('Out past the track, mm', out));
        if (leverSlides(design)) {
          const tine = num(lv.springLength, (v) => edit('throw', it.key, { springLength: Math.min(lv.maxTine, Math.max(16, v)) }), 1); tine.min = '16'; tine.max = String(Math.floor(lv.maxTine));
          row.append(field('Spring tines (shorter: the lever nearer the heel), mm', tine));
        }
      }
      body.append(row);
    });
  }
  const edits = Object.values(design.trackwork ?? {}).reduce((n, g) => n + Object.keys(g ?? {}).length, 0);
  const reset = btn(edits ? `Reset ${edits} hand edit${edits > 1 ? 's' : ''}` : 'No hand edits', () => { design.trackwork = {}; twSig = ''; }, 'Put the check rails, flangeway cuts, points and levers back to what the app works out (points taken out put back, forced ones unforced); Undo brings them back');
  reset.disabled = !edits; body.append(reset);
  $('trackwork-count').textContent = list.length ? ` (${edits ? `${edits} edited` : 'none edited'})` : '';
}
