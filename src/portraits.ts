// Little 3D portraits for the menus, rendered once with a tiny offscreen renderer and cached as images.
import * as THREE from 'three';
import { ANIMALS, type AnimalId, type HunterKind } from './data';
import { buildAnimal, buildHunter, DEFAULT_LOOK, type HunterLook } from './models';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
const cache = new Map<string, string>();
const SIZE = 192;

function setup() {
  if (renderer) return true;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return false;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5a45, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(3, 6, 5);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  return true;
}

function shoot(key: string, obj: THREE.Object3D, height: number, yaw: number, headShot = false): string {
  const hit = cache.get(key);
  if (hit) return hit;
  if (!setup() || !renderer) return '';
  obj.rotation.y = yaw;
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Head-and-shoulders for hunters, full body for animals.
  const focusY = headShot ? box.max.y - height * 0.32 : center.y;
  const span = headShot ? height * 0.75 : Math.max(size.x, size.y, size.z) * 1.05;
  const dist = span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  camera.position.set(center.x + dist * 0.35, focusY + span * 0.12, center.z + dist);
  camera.lookAt(center.x, focusY, center.z);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(obj);
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  cache.set(key, url);
  return url;
}

export function animalPortrait(id: AnimalId): string {
  const a = ANIMALS.find((x) => x.id === id)!;
  const rig = buildAnimal(id, a.color, a.accent);
  return shoot(`a:${id}`, rig.root, rig.height, -0.7);
}

/** Silhouette version for locked critters. */
export function lockedPortrait(id: AnimalId): string {
  const rig = buildAnimal(id, 0x222222, 0x222222);
  rig.root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
  });
  return shoot(`l:${id}`, rig.root, rig.height, -0.7);
}

export function hunterPortrait(key: string, kind: HunterKind, look: HunterLook = DEFAULT_LOOK): string {
  const rig = buildHunter(kind, look);
  return shoot(`h:${key}`, rig.root, rig.height, -0.4, kind !== 'drone');
}
