import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RailsSpec } from '../geom/pieces';

const view = document.getElementById('view')!;
const form = document.getElementById('spec') as HTMLFormElement;
const info = document.getElementById('info')!;
const download = document.getElementById('download') as HTMLButtonElement;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f4f2);
// Track frame: z up.
const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
camera.up.set(0, 0, 1);
camera.position.set(150, -250, 220);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(200, -300, 500);
scene.add(sun);
const grid = new THREE.GridHelper(512, 64, 0xbbbbbb, 0xdddddd);
grid.rotation.x = Math.PI / 2;
scene.add(grid);
const material = new THREE.MeshStandardMaterial({ color: 0x777b80, metalness: 0.3, roughness: 0.5 });
let piece: THREE.Mesh | undefined;
let stl: Uint8Array | undefined;

function resize() {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => renderer.render(scene, camera));

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = (e) => {
  const { positions, ms, tris, volume } = e.data;
  stl = e.data.stl;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  if (piece) { scene.remove(piece); piece.geometry.dispose(); }
  piece = new THREE.Mesh(geo, material);
  scene.add(piece);
  geo.computeBoundingBox();
  const c = geo.boundingBox!.getCenter(new THREE.Vector3());
  controls.target.copy(c);
  info.textContent = `${tris} triangles, ${(volume / 1000).toFixed(2)} cm³, built in ${ms.toFixed(0)} ms`;
  download.disabled = false;
};

function spec(): RailsSpec {
  const f = new FormData(form);
  return {
    kind: f.get('kind') as RailsSpec['kind'],
    gaugeStuds: Number(f.get('gauge')),
    lengthStuds: Number(f.get('length')),
    radiusStuds: Number(f.get('radius')),
    angle: Number(f.get('angle')),
  };
}
form.addEventListener('input', () => worker.postMessage(spec()));
worker.postMessage(spec());

download.addEventListener('click', () => {
  if (!stl) return;
  const s = spec();
  const name = s.kind === 'straight' ? `rails-${s.lengthStuds}` : `rails-R${s.radiusStuds}-${s.angle}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([stl as BlobPart], { type: 'model/stl' }));
  a.download = `${name}.stl`;
  a.click();
  URL.revokeObjectURL(a.href);
});
