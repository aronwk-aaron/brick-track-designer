// The editor: routes on the left (in studs and degrees), the plan view and the
// 3D piece on the right, rebuilt in a worker as you edit.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Design, type DRoute, type DSeg, OPTION_DEFAULTS, type PieceOptions, TEMPLATES, type Trackwork, endOf } from './design';
import { TrackCanvas } from './canvas';
import { describe } from './planner';
import type { Piece } from './build';
import { zip } from '../geom/zip';

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
  i.type = 'number'; i.step = String(step); i.value = String(v); i.title = label;
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
    name.addEventListener('change', () => { r.name = name.value; changed(true); });
    body.append(field('Name', name),
      field('Start x, studs', num(r.x, (n) => { r.x = n; }, 1)),
      field('Start y, studs', num(r.y, (n) => { r.y = n; }, 1)),
      field('Heading ° (0 = up, + = left)', num(r.heading, (n) => { r.heading = n; }, 22.5)));
    r.segs.forEach((_, k) => body.append(segRow(r, k)));
    // (a branch, i.e. a switch: its lever's side)
    if (r.segs.length && design.routes.length > 1) {
      const sel = document.createElement('select');
      for (const [v, t] of [['auto', 'Auto'], ['left', 'Left'], ['right', 'Right']]) sel.append(new Option(t, v));
      sel.value = r.throwSide ?? 'auto';
      sel.title = 'If this track branches off another (a switch), which side its lever goes';
      sel.addEventListener('change', () => { r.throwSide = sel.value as DRoute['throwSide']; changed(); });
      body.append(field('Switch lever side (if a branch)', sel));
    }
    const add = document.createElement('div'); add.className = 'row';
    add.append(
      btn('+ Straight', () => r.segs.push({ kind: 'straight', studs: 16 })),
      btn('+ Curve L', () => r.segs.push({ kind: 'curve', radius: 40, angle: 22.5 })),
      btn('+ Curve R', () => r.segs.push({ kind: 'curve', radius: 40, angle: -22.5 })),
    );
    const more = document.createElement('div'); more.className = 'row';
    more.append(
      btn('New route from its end', () => { const e = endOf(design, i); design.routes.push({ name: `R${design.routes.length + 1}`, ...e, segs: [{ kind: 'straight', studs: 16 }] }); }),
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
function requestBuild() {
  const id = ++seq;
  worker.postMessage({ id, design: structuredClone(design) });
  buildStarted();
  clearTimeout(restartCheck);
  restartCheck = window.setTimeout(() => {
    if (started >= id || id !== seq) return;
    worker.terminate(); worker = newWorker();
    worker.postMessage({ id, design: structuredClone(design) });
  }, 1000);
}

/** The design changed: save it and rebuild. record: an undo step (not while a drag or a draw is still going on). */
function changed(rerender = false, record = true) {
  const json = JSON.stringify(design);
  if (record && json !== history[history.length - 1]) { history.push(json); future.length = 0; if (history.length > 200) history.shift(); }
  save();
  gripLegend();
  if (rerender) render();
  canvas?.draw();
  updateHistoryButtons();
  clearTimeout(timer);
  timer = window.setTimeout(requestBuild, 150);
  infoEl.textContent = 'Building…';
}

// The 3D view's build status: what the worker is doing, and for how long.
let buildT0 = 0, buildTick: number | undefined;
function buildStarted() {
  buildT0 = performance.now();
  $('buildstatus').hidden = false; $('build-what').textContent = 'Building…'; $('build-time').textContent = ''; $('build-bar').style.width = '0%';
  clearInterval(buildTick);
  buildTick = window.setInterval(() => { $('build-time').textContent = `${((performance.now() - buildT0) / 1000).toFixed(1)} s`; }, 100);
}
function buildDone() { clearInterval(buildTick); $('buildstatus').hidden = true; }
function onBuilt(e: MessageEvent) {
  const d = e.data;
  started = Math.max(started, d.id);
  if (d.id !== seq) return;          // an older build
  // (the trackwork, ahead of the pieces: the plan and the Trackwork panel can be worked on while they build)
  if (d.early) { errEl.textContent = ''; canvas.overlay = d.early; canvas.draw(); renderTrackwork(d.early.items ?? []); return; }
  if (d.progress) { $('build-what').textContent = `${d.progress}…`; $('build-bar').style.width = `${Math.round((d.frac ?? 0) * 100)}%`; return; }
  if (d.fatal && fatalRetry !== d.id) { fatalRetry = d.id; worker.terminate(); worker = newWorker(); worker.postMessage({ id: d.id, design: structuredClone(design) }); return; }
  buildDone();
  if (d.error) { errEl.textContent = d.error; infoEl.textContent = ''; return; } // (the plan keeps the trackwork it was sent)
  errEl.textContent = '';
  canvas.overlay = d.overlay;
  gripLegend();
  canvas.draw();
  pieces = d.pieces;
  showPieces(pieces);
  renderTrackwork(d.overlay.items ?? []);
  const i = d.info;
  infoEl.textContent = `${i.switches ? `${i.switches} switch${i.switches > 1 ? 'es' : ''}, ` : ''}${i.crossings} rail crossings, ${i.checkRails} check rails · `
    + `${i.pieces} part${i.pieces > 1 ? 's' : ''} · ${i.size.map((v: number) => v.toFixed(0)).join(' × ')} mm · ${(i.volume / 1000).toFixed(1)} cm³ · built in ${i.ms.toFixed(0)} ms`;
  errEl.textContent = (i.warnings as string[]).join('; ');
}
worker = newWorker();

// ---------- 3D view ----------
const view = $('view3d');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
view.append(renderer.domElement);
const scene = new THREE.Scene();
const cssColor = (v: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback;
scene.background = new THREE.Color(cssColor('--view-bg', '#f4f4f2'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { scene.background = new THREE.Color(cssColor('--view-bg', '#f4f4f2')); });
const camera = new THREE.PerspectiveCamera(35, 1, 1, 10000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
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
const shown = new Set(['track', 'points', 'throw', 'lever']);
try { const v = localStorage.getItem('btd-shown'); if (v) { shown.clear(); for (const k of JSON.parse(v) as string[]) shown.add(k); } } catch { /* fine */ }
const kindOf = (name: string) => (/lid/.test(name) ? 'cassette' : /bracket/.test(name) ? 'bracket' : /lever/.test(name) ? 'lever' : /throw/.test(name) ? 'throw' : /points/.test(name) ? 'points' : 'track');
let meshKinds: string[] = [];
// Exploded view: each part pulled out from the middle (the moving parts lifted too), to see where they separate.
let meshCentres: THREE.Vector3[] = [];
const explodeEl = $<HTMLInputElement>('explode');
function applyExplode() {
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
    // (as they're put together: the slider from underneath, the points and the lid from above, the bracket on its studs, the lever into it)
    const fromTop = design.options?.pointsModule === 'layers' && (design.options?.ballast ?? 'none') !== 'none';
    const lift: Record<string, number> = { throw: fromTop ? 15 : -30, points: fromTop ? 25 : -18, cassette: 45, bracket: 30, lever: 60 };
    m.position.set(off.x, off.y, e * (lift[meshKinds[k]] ?? 40));
  });
}
explodeEl.addEventListener('input', applyExplode);
function applyShown() {
  meshes.forEach((m, k) => { m.visible = shown.has(meshKinds[k] === 'cassette' ? 'track' : meshKinds[k] === 'bracket' ? 'lever' : meshKinds[k]); });
  document.querySelectorAll<HTMLButtonElement>('#views .show').forEach((b) => b.classList.toggle('on', shown.has(b.dataset.show!)));
}
document.querySelectorAll<HTMLButtonElement>('#views .show').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.show!; if (shown.has(k)) shown.delete(k); else shown.add(k);
  try { localStorage.setItem('btd-shown', JSON.stringify([...shown])); } catch { /* fine */ }
  applyShown();
}));
function showPieces(list: Piece[]) {
  for (const m of meshes) { group.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  meshes = list.map((p) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.55, metalness: 0.15 }));
    group.add(m);
    return m;
  });
  meshKinds = list.map((p) => kindOf(p.name));
  meshCentres = meshes.map((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox!.getCenter(new THREE.Vector3()); });
  applyShown(); applyExplode();
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
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
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
renderer.setAnimationLoop(() => renderer.render(scene, camera));

// ---------- toolbar ----------
const tpl = $<HTMLSelectElement>('template');
for (const name of Object.keys(TEMPLATES)) tpl.append(new Option(name, name));
tpl.addEventListener('change', () => {
  if (!tpl.value) return;
  design = structuredClone(TEMPLATES[tpl.value]); tpl.value = ''; gauge.value = String(design.gaugeStuds); grip.value = 'edges'; renderOptions(); framed = false; changed(true); canvas.fit();
});
$('add-route').addEventListener('click', () => {
  design.routes.push({ name: `R${design.routes.length + 1}`, x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] });
  changed(true);
});
const grip = $<HTMLSelectElement>('grip');
grip.value = design.grip ?? 'edges';
grip.addEventListener('change', () => { design.grip = grip.value as Design['grip']; changed(true); });
const pointsSel = $<HTMLSelectElement>('points');
pointsSel.value = String(design.pointsPieces ?? 1);
pointsSel.addEventListener('change', () => { design.pointsPieces = Number(pointsSel.value) as 1 | 2; changed(true); });
function gripLegend() {
  $('legend-ballast').hidden = (design.options?.ballast ?? 'none') === 'none';
  let on: boolean; try { on = grip.value === 'edges'; } catch { return; } // (before the toolbar is set up)
  $('legend-grip').hidden = !on;
  if (canvas) canvas.showGrips = on;
}
const gauge = $<HTMLInputElement>('gauge');
gauge.value = String(design.gaugeStuds);
gauge.addEventListener('change', () => { design.gaugeStuds = Number(gauge.value); changed(); });

const download = (blob: Blob, name: string) => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
// One piece: its STL; several (a switch and its moving parts): a zip of them.
$('export-stl').addEventListener('click', () => {
  if (!pieces.length) return;
  const base = fileBase();
  if (pieces.length === 1) download(new Blob([pieces[0].stl as BlobPart], { type: 'model/stl' }), `${base}.stl`);
  else download(new Blob([zip(pieces.map((p) => ({ name: `${base}-${p.name}.stl`, data: p.stl }))) as BlobPart], { type: 'application/zip' }), `${base}.zip`);
});
// The design's name (asked on Save): what it saves and downloads under.
const fileBase = () => (design.name || 'track-piece').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'track-piece';
$('save').addEventListener('click', () => {
  const name = prompt('Save the design as:', design.name || 'track-piece');
  if (name === null) return;
  design.name = name.trim() || undefined; changed();
  download(new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' }), `${fileBase()}.btd.json`);
});
const loadInput = $<HTMLInputElement>('load-file');
$('load').addEventListener('click', () => loadInput.click());
loadInput.addEventListener('change', async () => {
  const f = loadInput.files?.[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()) as Design; if (!Array.isArray(d.routes)) throw new Error('not a design');
    design = d; gauge.value = String(d.gaugeStuds); grip.value = d.grip ?? 'edges'; pointsSel.value = String(d.pointsPieces ?? 1); renderOptions(); framed = false; changed(true); canvas.fit();
  } catch (err) { errEl.textContent = `Couldn't load that file: ${err}`; }
  loadInput.value = '';
});

// ---------- the track canvas ----------
const hintEl = $('hint'), coordsEl = $('coords');
const radiusSel = $<HTMLSelectElement>('radius');
radiusSel.append(new Option('Curves: free', '-1', true, true));
radiusSel.append(new Option('Auto (LEGO radii)', '0'));
for (const r of [24, 32, 40, 48, 56, 64, 72, 88, 104, 120]) radiusSel.append(new Option(`R${r}`, String(r)));
const canvas = new TrackCanvas($<HTMLCanvasElement>('track'), {
  design: () => design,
  changed: (commit) => changed(commit, commit), // (one undo step per finished action, none for each mouse move)
  select: () => { render(); updateSelbar(); },
  radius: () => Number(radiusSel.value),
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
  $('toggle-3d').classList.toggle('on', on);
  try { localStorage.setItem('btd-3d', on ? '1' : '0'); } catch { /* fine */ }
};
let show3d = true;
try { show3d = localStorage.getItem('btd-3d') !== '0'; } catch { /* fine */ }
set3d(show3d);
$('toggle-3d').addEventListener('click', () => { show3d = !show3d; set3d(show3d); });
const restore = (json: string) => { design = JSON.parse(json); gauge.value = String(design.gaugeStuds); grip.value = design.grip ?? 'edges'; pointsSel.value = String(design.pointsPieces ?? 1); canvas.selected = undefined; save(); render(); renderOptions(); canvas.draw(); updateHistoryButtons(); requestBuild(); };
const undo = () => { if (history.length > 1) { future.push(history.pop()!); restore(history[history.length - 1]); } };
const redo = () => { if (future.length) { const j = future.pop()!; history.push(j); restore(j); } };
function updateHistoryButtons() {
  ($('undo') as HTMLButtonElement).disabled = history.length <= 1;
  ($('redo') as HTMLButtonElement).disabled = !future.length;
}
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'd' || e.key === 'D') setMode('draw');
  if (e.key === 's' || e.key === 'S') setMode('select');
  if (e.key === 'p' || e.key === 'P') { show3d = !show3d; set3d(show3d); }
  if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) canvas.fit();
  if (e.key === '?') helpEl.classList.toggle('open');
  if (e.key === 'Escape') helpEl.classList.remove('open');
});

// Help
const helpEl = $('help');
$('help-open').addEventListener('click', () => helpEl.classList.add('open'));
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
$('clear').addEventListener('click', () => { design.routes = []; canvas.selected = undefined; changed(true); });

render();
changed();


// ---------- selection: copy, cut, paste, duplicate, mirror, turn ----------
let clipboard: DRoute[] = [];
const selected = () => canvas.selection().filter((i) => i < design.routes.length);
const nextName = () => { let n = design.routes.length + 1; while (design.routes.some((r) => r.name === `R${n}`)) n++; return `R${n}`; };
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
  if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
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


// ---------- piece options (switch.scad's Customizer settings) ----------
const OPTION_FORM: [string, [keyof PieceOptions, string, number?][]][] = [
  ['Ballast', [['ballast', 'Ballast'], ['bottomStyle', 'Underside']]],
  ['Throw', [['throwStyle', 'Lever mounted'], ['throwSide', 'Lever side'], ['leverOffset', 'Lever past the edge, mm', 1]]],
  ['Points', [['pointThrow', 'Blade throw, mm', 0.25], ['pointClearance', 'Clearance, mm', 0.05],
    ['springPreload', 'Spring preload, mm', 0.25], ['springThickness', 'Spring thickness, mm', 0.05], ['springLength', 'Spring length, mm', 1]]],
  ['Guards (check rails)', [['checkRailLen', 'Check rail length, mm', 2], ['checkRailW', 'Check rail width, mm', 0.1], ['checkRailFlare', 'End flare, mm', 0.25],
    ['flangeway', 'Flangeway width, mm', 0.1], ['flangewayDepth', 'Flangeway depth, mm', 0.5]]],
  ['Print bed', [['printBedX', 'Bed width, mm', 1], ['printBedY', 'Bed depth, mm', 1], ['baseplate', 'Cut at baseplate edges'], ['baseplateX', 'Plate corner x, studs', 1], ['baseplateY', 'Plate corner y, studs', 1], ['joint', 'Parts join with'], ['cutRails', 'Rails where parts are cut'], ['endSupports', 'Supports under the rail ends']]],
  ['Points (prototype)', [['pointsModule', 'Points built as']]],
];
function renderOptions() {
  const body = $('options-body'); body.replaceChildren();
  const o = { ...OPTION_DEFAULTS, ...design.options };
  for (const [title, fields] of OPTION_FORM) {
    const h = document.createElement('h4'); h.textContent = title; body.append(h);
    for (const [key, label, step] of fields) {
      if (key === 'throwStyle') {
        const sel = document.createElement('select');
        for (const [v, tx, tip] of [['bracket', 'On its own bracket (plate-style)', 'The lever on a separate 3 x 3 stud bracket that sits on studs on the arm, as plate-style throws are'],
          ['built-in', 'Built into the arm', 'The lever\'s ears part of the track piece\'s arm']]) { const op = new Option(tx, v); op.title = tip; sel.append(op); }
        sel.value = o.throwStyle ?? 'bracket';
        sel.addEventListener('change', () => { design.options = { ...design.options, throwStyle: sel.value as PieceOptions['throwStyle'] }; changed(true); });
        body.append(field(label, sel));
      } else if (key === 'cutRails') {
        const sel = document.createElement('select');
        for (const [v, tx, tip] of [['tongues', 'Interlocking tongues (LEGO)', 'The rails at a cut get interlocking tongues, as LEGO track ends: they overhang, so they print with supports'],
          ['flat', 'Cut flat', 'The rails cut flat across: nothing overhangs, no supports to print; the bed joint and the baseplate hold the parts in line']]) { const op = new Option(tx, v); op.title = tip; sel.append(op); }
        sel.value = o.cutRails ?? 'tongues';
        sel.addEventListener('change', () => { design.options = { ...design.options, cutRails: sel.value as PieceOptions['cutRails'] }; changed(true); });
        body.append(field(label, sel));
      } else if (key === 'endSupports') {
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = o.endSupports !== false;
        cb.title = 'Breakaway print supports under the rail-end tongues at each end; off: let the slicer support them';
        cb.addEventListener('change', () => { design.options = { ...design.options, endSupports: cb.checked }; changed(true); });
        body.append(field(label, cb));
      } else if (key === 'pointsModule') {
        const sel = document.createElement('select');
        for (const [v, tx, tip] of [['built-in', 'One piece: points and throw go in from below', 'The points built into the track, their pockets open through to the bottom: the points and the throw go in from underneath before it goes on the baseplate'],
          ['layers', 'Layers: points and throw go in from the top, then a lid', 'The lower layer (with the pockets the moving parts sit in), the moving parts dropped in, then the deck (bed, rails, frogs) laid over, held by studs like LEGO plates. Needs ballast.']]) { const op = new Option(tx, v); op.title = tip; sel.append(op); }
        sel.value = o.pointsModule ?? 'built-in';
        sel.title = 'Prototype: how the points are built';
        sel.addEventListener('change', () => { design.options = { ...design.options, pointsModule: sel.value as PieceOptions['pointsModule'] }; changed(true); });
        body.append(field(label, sel));
      } else if (key === 'joint') {
        const sel = document.createElement('select');
        for (const [v, tx, tip] of [['lego', 'Rail tongues + peg and clip (LEGO)', 'As LEGO track joins: interlocking rail-end tongues, and a peg and C-clip in the bed'],
          ['dovetail', 'Rail tongues + dovetails', 'Interlocking rail-end tongues, and dovetails through the bed: stronger, slides together from above'],
          ['butt', 'Straight cuts (held by the baseplate)', 'Plain straight cuts, nothing to join them: the baseplate under them holds them in line'],
          ['ends', 'Separate pieces, ordinary track ends (plate-style)', 'Each track cut square to itself where it is clear of the others, with a standard end connector both sides: points, frogs and crossings stay whole, plain track in lengths that fit the bed']]) { const op = new Option(tx, v); op.title = tip; sel.append(op); }
        sel.value = o.joint ?? 'lego';
        sel.title = 'How the parts cut for the print bed or the baseplates join';
        sel.addEventListener('change', () => { design.options = { ...design.options, joint: sel.value as PieceOptions['joint'] }; changed(true); });
        body.append(field(label, sel));
      } else if (key === 'ballast' || key === 'bottomStyle') {
        const sel = document.createElement('select');
        const opts = key === 'ballast' ? [['none', 'None (track only)'], ['ballast', 'Ballast'], ['buddy', 'Ballast + buddy layer']] : [['antistud', 'Anti-stud (grips plates)'], ['float', 'Flat']];
        for (const [v, tx] of opts) sel.append(new Option(tx, v));
        sel.value = String(o[key]);
        sel.title = key === 'ballast' ? 'Ballast under the track, as the OpenSCAD switches have it' : 'With ballast: the underside';
        sel.addEventListener('change', () => { design.options = { ...design.options, [key]: sel.value }; changed(true); });
        body.append(field(label, sel));
      } else       if (key === 'baseplate') {
        const sel = document.createElement('select');
        for (const [v, t] of [['0', "Don't"], ['16', '16 x 16 studs'], ['32', '32 x 32 studs'], ['48', '48 x 48 studs'], ['64', '64 x 64 studs'], ['96', '96 x 96 studs']]) sel.append(new Option(t, v));
        sel.value = String(o.baseplate ?? 0);
        sel.title = 'Cut the track where baseplates of this size meet, on the design\'s stud grid, so every part sits on one plate';
        sel.addEventListener('change', () => { design.options = { ...design.options, baseplate: Number(sel.value) }; changed(true); });
        body.append(field(label, sel));
      } else if (key === 'throwSide') {
        const sel = document.createElement('select');
        for (const [v, t] of [['auto', 'Auto (main route side)'], ['left', 'Left'], ['right', 'Right']]) sel.append(new Option(t, v));
        sel.value = o.throwSide;
        sel.addEventListener('change', () => { design.options = { ...design.options, throwSide: sel.value as PieceOptions['throwSide'] }; changed(true); });
        body.append(field(label, sel));
      } else
        body.append(field(label, num(o[key] as number, (n) => { design.options = { ...design.options, [key]: n }; }, step)));
    }
  }
  body.append(btn('Reset to defaults', () => { design.options = {}; renderOptions(); }, 'Every option back to its default'));
  body.lastElementChild!.classList.add('reset');
}
renderOptions();


// ---------- trackwork: hand edits to the check rails, flangeway cuts and points ----------
type TwItem = { kind: 'check' | 'groove' | 'points' | 'throw'; key: string; at: [number, number]; off?: boolean; len?: number; toe?: number; lever?: { side: number; leverOffset: number; springLength: number; maxTine: number; edited: boolean } };
let twSig = '';
function renderTrackwork(list: TwItem[]) {
  const sig = JSON.stringify(list.map((it) => [it.kind, it.key, it.off, Math.round((it.len ?? 0) * 10), it.toe, it.lever && [it.lever.side, it.lever.leverOffset, it.lever.springLength]]));
  if (sig === twSig) return; // (don't rebuild the form under the user's fingers)
  twSig = sig;
  const body = $('trackwork-body'); body.replaceChildren();
  if (!list.length) { const n = document.createElement('div'); n.className = 'none'; n.textContent = 'No check rails, flangeway cuts or points in this design.'; body.append(n); return; }
  const edit = <K extends keyof Trackwork>(kind: K, key: string, patch: Record<string, unknown>) => {
    const tw = (design.trackwork ??= {}), group = ((tw[kind] ??= {}) as Record<string, Record<string, unknown>>);
    group[key] = { ...group[key], ...patch };
    changed(true);
  };
  const names = { check: 'Check rail', groove: 'Flangeway cut', points: 'Points', throw: 'Lever' } as const;
  for (const kind of ['points', 'throw', 'check', 'groove'] as const) {
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
        // (drag the lever on the plan, or set it here)
        const lv = it.lever;
        const side = document.createElement('select');
        for (const [v, l] of [['left', 'Left'], ['right', 'Right']]) { const op = document.createElement('option'); op.value = v; op.textContent = l; side.append(op); }
        side.value = lv.side > 0 ? 'right' : 'left';
        side.addEventListener('change', () => edit('throw', it.key, { side: side.value }));
        row.append(field('Side (as you face along the points)', side));
        const out = num(lv.leverOffset, (v) => edit('throw', it.key, { leverOffset: Math.max(0, v) }), 1); out.min = '0';
        row.append(field('Out past the track, mm', out));
        const tine = num(lv.springLength, (v) => edit('throw', it.key, { springLength: Math.min(lv.maxTine, Math.max(16, v)) }), 1); tine.min = '16'; tine.max = String(Math.floor(lv.maxTine));
        row.append(field('Spring tines (shorter: the lever nearer the heel), mm', tine));
      } else numField('Points moved along, mm', 'toe', 1);
      body.append(row);
    });
  }
  body.append(btn('Undo every hand edit', () => { design.trackwork = {}; twSig = ''; }, 'Put the check rails, flangeway cuts and points back to what the app works out'));
}
