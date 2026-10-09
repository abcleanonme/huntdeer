// Renders App Store key art (product page header and search results). Run `npm run keyart`.
import * as THREE from 'three';
import { ANIMALS } from '../src/data';
import { buildAnimal, buildBush, buildHunter, buildRock, buildTree, buildTreeStand, DEFAULT_LOOK, STAND_HEIGHT } from '../src/models';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 3840);
const H = Number(q.get('h') ?? 1646);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd4f2);
scene.fog = new THREE.FogExp2(0xb9e0f0, 0.018);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5a45, 1.5));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(-12, 20, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 80 });
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x6aa84f }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Seeded so every render matches.
let seed = 7;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const place = (o: THREE.Object3D, x: number, z: number, ry = 0) => {
  o.position.set(x, 0, z);
  o.rotation.y = ry;
  o.traverse((m) => {
    if (m instanceof THREE.Mesh) m.castShadow = m.receiveShadow = true;
  });
  scene.add(o);
  return o;
};

// Forest: a ring of pines behind and to the sides, leaving the middle open.
for (let i = 0; i < 140; i++) {
  const x = (rng() - 0.5) * 120;
  const z = -6 - rng() * 70;
  if (Math.abs(x) < 7 && z > -16) continue;
  place(buildTree('pine', rng), x, z);
}
for (const [x, z] of [[-17, 2], [-21, -3], [19, 1], [23, -4]]) place(buildTree('pine', rng), x, z);
for (let i = 0; i < 30; i++) place(buildBush(0x4f8a3a, rng), (rng() - 0.5) * 50, -4 - rng() * 30);
for (let i = 0; i < 8; i++) place(buildRock(rng), (rng() - 0.5) * 40, -6 - rng() * 25);

// The deer, front and center, wearing a stolen orange cap and looking very pleased.
const deerDef = ANIMALS[0];
const deer = buildAnimal('deer', deerDef.color, deerDef.accent, 1.4);
place(deer.root, -1.2, 3, 0.35);
let tip = new THREE.Vector3(0, -Infinity, 0);
deer.root.updateMatrixWorld(true);
deer.root.traverse((o) => {
  if (!(o instanceof THREE.Mesh)) return;
  const b = new THREE.Box3().setFromObject(o);
  if (b.max.y > tip.y) tip = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2);
});
const capMat = new THREE.MeshLambertMaterial({ color: 0xff6a00, flatShading: true });
const cap = new THREE.Group();
const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.28, 10), capMat);
const brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.3), capMat);
brim.position.set(0, -0.11, 0.28);
cap.add(crown, brim);
cap.position.copy(tip).add(new THREE.Vector3(0, 0.03, 0));
cap.rotation.set(0.2, 0.4, -0.45);
scene.add(cap);
place(buildBush(0x3f7a2e, rng), -5.2, 4.2).scale.setScalar(0.9);

// Hunters, all looking the wrong way.
place(buildHunter('rifle', { ...DEFAULT_LOOK, belly: 1.3 }).root, 6.5, -4, Math.PI * 0.85);
place(buildHunter('bow', { ...DEFAULT_LOOK, vest: 0x4d5a2e, hatColor: 0xff6a00, beard: null, height: 1.1 }).root, -7.5, -7, Math.PI * 1.15);
const stand = place(buildTreeStand(), 12, -10, -0.5);
const sitter = buildHunter('shotgun', { ...DEFAULT_LOOK, shirt: 0x1565c0, beard: 0xd9d9d9 }).root;
sitter.position.set(0, STAND_HEIGHT + 0.08, 0);
sitter.rotation.y = Math.PI;
stand.add(sitter);

const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 300);
// Keep the horizontal field of view the same for every aspect so the cast stays framed.
const hfov = THREE.MathUtils.degToRad(62);
cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / cam.aspect));
cam.updateProjectionMatrix();
cam.position.set(0, 3.4, 15.5);
cam.lookAt(1, 2.8, -2);
renderer.render(scene, cam);
(window as unknown as { done: boolean }).done = true;
