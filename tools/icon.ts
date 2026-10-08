// Renders the iOS app icon and splash art. Run `npm run icons` (needs Playwright) to regenerate.
import * as THREE from 'three';
import { ANIMALS } from '../src/data';
import { buildAnimal } from '../src/models';

const mode = new URLSearchParams(location.search).get('mode') ?? 'icon';
const W = mode === 'icon' ? 1024 : 2732;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, W);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(mode === 'icon' ? 0xff6a00 : 0x1d2b1f);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5a45, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 6, 5);
scene.add(sun);
const deer = ANIMALS[0];
const rig = buildAnimal('deer', deer.color, deer.accent);
scene.add(rig.root);
// A sloppy orange hunter cap hanging off one antler: the deer won.
const cap = new THREE.Group();
const m = new THREE.MeshLambertMaterial({ color: mode === 'icon' ? 0xffd23f : 0xff6a00, flatShading: true });
const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 10), m);
const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.22), m);
brim.position.set(0, -0.08, 0.2);
cap.add(crown, brim);
// Hang the cap on the tallest antler tip.
let tip = new THREE.Vector3(0, -Infinity, 0);
rig.root.updateMatrixWorld(true);
rig.root.traverse((o) => {
  if (!(o instanceof THREE.Mesh)) return;
  const b = new THREE.Box3().setFromObject(o);
  if (b.max.y > tip.y) tip = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
});
cap.position.copy(tip).add(new THREE.Vector3(0, 0.02, 0));
cap.rotation.set(0.2, 0.4, -0.45);
scene.add(cap);
const all = new THREE.Box3().setFromObject(rig.root).union(new THREE.Box3().setFromObject(cap));
const size = all.getSize(new THREE.Vector3());
// Frame the head and antlers for the icon, the whole deer for the splash.
const center = mode === 'icon' ? new THREE.Vector3(tip.x, all.max.y - size.y * 0.27, tip.z) : all.getCenter(new THREE.Vector3());
const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const span = mode === 'icon' ? size.y * 0.62 : Math.max(size.x, size.y) * 3.2;
const dist = span / (2 * Math.tan(THREE.MathUtils.degToRad(15)));
const dir = mode === 'icon' ? new THREE.Vector3(-0.55, 0.12, 1).normalize() : new THREE.Vector3(0.3, 0.08, 1).normalize();
cam.position.copy(center).addScaledVector(dir, dist);
cam.lookAt(center);
renderer.render(scene, cam);
(window as unknown as { done: boolean }).done = true;
