// The editor: routes on the left (in studs and degrees), the plan view and the
// 3D piece on the right, rebuilt in a worker as you edit.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Design, type DRoute, type DSeg, TEMPLATES, endOf } from './design';
import { TrackCanvas } from './canvas';

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

function render() {
  routesEl.replaceChildren();
  design.routes.forEach((r, i) => {
    const box = document.createElement('fieldset');
    if (i === canvas?.selected) box.classList.add('selected');
    const legend = document.createElement('legend');
    const name = document.createElement('input'); name.value = r.name; name.className = 'name';
    name.addEventListener('change', () => { r.name = name.value; changed(); });
    legend.append(name);
    box.append(legend,
      field('Start x, studs', num(r.x, (n) => { r.x = n; }, 1)),
      field('Start y, studs', num(r.y, (n) => { r.y = n; }, 1)),
      field('Heading ° (0 = up, + = left)', num(r.heading, (n) => { r.heading = n; }, 22.5)));
    r.segs.forEach((_, k) => box.append(segRow(r, k)));
    const add = document.createElement('div'); add.className = 'row';
    add.append(
      btn('+ Straight', () => r.segs.push({ kind: 'straight', studs: 16 })),
      btn('+ Curve L', () => r.segs.push({ kind: 'curve', radius: 40, angle: 22.5 })),
      btn('+ Curve R', () => r.segs.push({ kind: 'curve', radius: 40, angle: -22.5 })),
    );
    const more = document.createElement('div'); more.className = 'row';
    more.append(
      btn('New route from its end', () => { const e = endOf(design, i); design.routes.push({ name: `R${design.routes.length + 1}`, ...e, segs: [{ kind: 'straight', studs: 16 }] }); }),
      btn('Delete route', () => { design.routes.splice(i, 1); }),
    );
    box.append(add, more);
    routesEl.append(box);
  });
}

// ---------- building ----------
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let seq = 0, stl: Uint8Array | undefined, timer: number | undefined;

function changed(rerender = false) {
  const json = JSON.stringify(design);
  if (json !== history[history.length - 1]) { history.push(json); future.length = 0; if (history.length > 200) history.shift(); }
  save();
  if (rerender) render();
  canvas?.draw();
  clearTimeout(timer);
  timer = window.setTimeout(() => worker.postMessage({ id: ++seq, design: structuredClone(design) }), 150);
  infoEl.textContent = 'Building…';
}

worker.onmessage = (e) => {
  const d = e.data;
  if (d.id !== seq) return;          // an older build
  if (d.error) { errEl.textContent = d.error; infoEl.textContent = ''; canvas.overlay = undefined; canvas.draw(); return; }
  errEl.textContent = '';
  canvas.overlay = d.overlay;
  canvas.draw();
  stl = d.stl;
  showMesh(d.positions);
  const i = d.info;
  infoEl.textContent = `${i.crossings} rail crossings, ${i.checkRails} check rails${i.splits ? `, ${i.splits} points (not built yet)` : ''} · `
    + `${i.size.map((v: number) => v.toFixed(0)).join(' × ')} mm · ${(i.volume / 1000).toFixed(1)} cm³ · built in ${i.ms.toFixed(0)} ms`;
};

// ---------- 3D view ----------
const view = $('view3d');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
view.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f4f2);
const camera = new THREE.PerspectiveCamera(35, 1, 1, 10000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(300, -400, 700); scene.add(sun);
const material = new THREE.MeshStandardMaterial({ color: 0x6f7780, roughness: 0.55, metalness: 0.15 });
let mesh: THREE.Mesh | undefined, framed = false;

function showMesh(positions: Float32Array) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
  mesh = new THREE.Mesh(geo, material);
  scene.add(mesh);
  geo.computeBoundingSphere();
  const bs = geo.boundingSphere!;
  if (!framed) {
    controls.target.copy(bs.center);
    camera.position.copy(bs.center).add(new THREE.Vector3(0.6, -1.2, 1.1).normalize().multiplyScalar(bs.radius * 3.2));
    controls.update();
    framed = true;
  }
}
function resize() {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
renderer.setAnimationLoop(() => renderer.render(scene, camera));

// ---------- toolbar ----------
const tpl = $<HTMLSelectElement>('template');
for (const name of Object.keys(TEMPLATES)) tpl.append(new Option(name, name));
tpl.addEventListener('change', () => {
  if (!tpl.value) return;
  design = structuredClone(TEMPLATES[tpl.value]); tpl.value = ''; framed = false; changed(true); canvas.fit();
});
$('add-route').addEventListener('click', () => {
  design.routes.push({ name: `R${design.routes.length + 1}`, x: 0, y: 0, heading: 0, segs: [{ kind: 'straight', studs: 16 }] });
  changed(true);
});
const gauge = $<HTMLInputElement>('gauge');
gauge.value = String(design.gaugeStuds);
gauge.addEventListener('change', () => { design.gaugeStuds = Number(gauge.value); changed(); });

const download = (blob: Blob, name: string) => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('export-stl').addEventListener('click', () => { if (stl) download(new Blob([stl as BlobPart], { type: 'model/stl' }), 'track-piece.stl'); });
$('save').addEventListener('click', () => download(new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' }), 'track-piece.btd.json'));
const loadInput = $<HTMLInputElement>('load-file');
$('load').addEventListener('click', () => loadInput.click());
loadInput.addEventListener('change', async () => {
  const f = loadInput.files?.[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()) as Design; if (!Array.isArray(d.routes)) throw new Error('not a design');
    design = d; gauge.value = String(d.gaugeStuds); framed = false; changed(true); canvas.fit();
  } catch (err) { errEl.textContent = `Couldn't load that file: ${err}`; }
  loadInput.value = '';
});

// ---------- the track canvas ----------
const radiusSel = $<HTMLSelectElement>('radius');
radiusSel.append(new Option('Auto', '0', true, true));
for (const r of [24, 32, 40, 48, 56, 64, 72, 88, 104, 120]) radiusSel.append(new Option(`R${r}`, String(r)));
const canvas = new TrackCanvas($<HTMLCanvasElement>('track'), {
  design: () => design,
  changed: (commit) => changed(commit),
  select: () => render(),
  radius: () => Number(radiusSel.value),
});
const setMode = (m: 'draw' | 'select') => {
  canvas.mode = m; canvas.stopDrawing();
  $('mode-draw').classList.toggle('on', m === 'draw'); $('mode-select').classList.toggle('on', m === 'select');
};
$('mode-draw').addEventListener('click', () => setMode('draw'));
$('mode-select').addEventListener('click', () => setMode('select'));
$('fit').addEventListener('click', () => canvas.fit());
const restore = (json: string) => { design = JSON.parse(json); gauge.value = String(design.gaugeStuds); canvas.selected = undefined; save(); render(); canvas.draw(); worker.postMessage({ id: ++seq, design: structuredClone(design) }); };
const undo = () => { if (history.length > 1) { future.push(history.pop()!); restore(history[history.length - 1]); } };
const redo = () => { if (future.length) { const j = future.pop()!; history.push(j); restore(j); } };
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  if (e.key === 'd' || e.key === 'D') setMode('draw');
  if (e.key === 's' || e.key === 'S') setMode('select');
});
$('clear').addEventListener('click', () => { design.routes = []; canvas.selected = undefined; changed(true); });

render();
changed();
