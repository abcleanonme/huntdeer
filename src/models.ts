// Procedural low-poly models built from primitives, so the game ships with zero asset files.
import * as THREE from 'three';
import type { AnimalId, HunterKind, MapDef, SecretItem } from './data';

const matCache = new Map<string, THREE.Material>();
export function mat(color: number, opts: { emissive?: number; transparent?: boolean; opacity?: number } = {}) {
  const key = `${color}-${opts.emissive ?? 0}-${opts.opacity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      flatShading: true,
      emissive: opts.emissive ?? 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const sphere = (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d);
const cyl = (rt: number, rb: number, h: number, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r: number, h: number, s = 6) => new THREE.ConeGeometry(r, h, s);

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Object3D[];
  wings?: THREE.Object3D[];
  hat?: THREE.Object3D;
  /** The Trophy King's stack of hats, top first. */
  hats?: THREE.Object3D[];
  /** Height of the top of the model, for floating labels. */
  height: number;
}

function leg(len: number, thick: number, color: number, hoof: number) {
  const pivot = new THREE.Group();
  const l = mesh(box(thick, len, thick), color, 0, -len / 2, 0);
  const h = mesh(box(thick * 1.15, thick * 0.6, thick * 1.15), hoof, 0, -len, 0);
  pivot.add(l, h);
  return pivot;
}

function eyes(parent: THREE.Object3D, x: number, y: number, z: number, size = 0.07) {
  for (const s of [-1, 1]) {
    const white = mesh(sphere(size, 0), 0xffffff, x * s, y, z, false);
    const pupil = mesh(sphere(size * 0.55, 0), 0x111111, x * s, y, z + size * 0.6, false);
    parent.add(white, pupil);
  }
}

export function buildAnimal(id: AnimalId, color: number, accent: number, scale = 1): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs: THREE.Object3D[] = [];
  let height = 2;

  if (id === 'duck') {
    body.add(mesh(sphere(0.45, 1), 0x8a6b4a, 0, 0.65, 0));
    const head = mesh(sphere(0.3, 1), color, 0, 1.15, 0.3);
    body.add(head);
    body.add(mesh(box(0.3, 0.08, 0.3), accent, 0, 1.1, 0.6));
    body.add(mesh(cyl(0.31, 0.31, 0.08, 8), 0xffffff, 0, 0.92, 0.25));
    eyes(body, 0.13, 1.22, 0.52, 0.06);
    const wings: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(0.42 * s, 0.75, 0);
      w.add(mesh(box(0.08, 0.3, 0.6), 0x6b5236, 0, 0, 0));
      body.add(w);
      wings.push(w);
      const lg = leg(0.3, 0.08, accent, accent);
      lg.position.set(0.18 * s, 0.32, 0);
      body.add(lg);
      legs.push(lg);
    }
    body.add(mesh(cone(0.18, 0.3, 4), 0x5a4630, 0, 0.75, -0.5).rotateX(-1.2));
    root.scale.setScalar(scale);
    return { root, body, legs, wings, height: 1.5 * scale };
  }

  // Generic quadruped with per-animal tweaks.
  const dims: Record<Exclude<AnimalId, 'duck'>, { bw: number; bh: number; bl: number; legLen: number; legT: number; headR: number; neck: number }> = {
    deer: { bw: 0.7, bh: 0.7, bl: 1.5, legLen: 1.0, legT: 0.16, headR: 0.32, neck: 0.6 },
    rabbit: { bw: 0.5, bh: 0.5, bl: 0.7, legLen: 0.25, legT: 0.16, headR: 0.3, neck: 0.1 },
    skunk: { bw: 0.55, bh: 0.45, bl: 0.95, legLen: 0.25, legT: 0.14, headR: 0.26, neck: 0.05 },
    bear: { bw: 1.3, bh: 1.2, bl: 2.1, legLen: 0.8, legT: 0.38, headR: 0.55, neck: 0.15 },
    moose: { bw: 1.1, bh: 1.15, bl: 2.1, legLen: 1.45, legT: 0.26, headR: 0.5, neck: 0.5 },
  };
  const d = dims[id];
  const bodyY = d.legLen + d.bh / 2;
  body.add(mesh(box(d.bw, d.bh, d.bl), color, 0, bodyY, 0));
  if (id === 'deer') body.add(mesh(box(d.bw * 0.8, 0.1, d.bl * 0.8), accent, 0, bodyY - d.bh / 2, 0));
  if (id === 'skunk') body.add(mesh(box(0.18, 0.05, d.bl), accent, 0, bodyY + d.bh / 2, 0));

  const headY = bodyY + d.bh / 2 + d.neck * 0.6;
  const headZ = d.bl / 2 + d.headR * 0.5;
  if (d.neck > 0.3) {
    const neck = mesh(box(0.25, d.neck + 0.2, 0.25), color, 0, bodyY + d.bh / 2 + d.neck / 2 - 0.1, d.bl / 2 - 0.05);
    neck.rotation.x = 0.35;
    body.add(neck);
  }
  const head = new THREE.Group();
  head.position.set(0, headY, headZ);
  body.add(head);
  head.add(mesh(box(d.headR * 1.4, d.headR * 1.4, d.headR * 1.8), color, 0, 0, 0));
  head.add(mesh(box(d.headR * 0.8, d.headR * 0.6, d.headR * 0.6), id === 'bear' ? 0xa47148 : accent, 0, -d.headR * 0.25, d.headR * 1.0));
  head.add(mesh(sphere(d.headR * 0.18, 0), 0x111111, 0, -d.headR * 0.05, d.headR * 1.32, false));
  eyes(head, d.headR * 0.45, d.headR * 0.3, d.headR * 0.9, d.headR * 0.22);

  if (id === 'deer') {
    for (const s of [-1, 1]) {
      const ear = mesh(cone(0.1, 0.35, 4), color, 0.28 * s, 0.25, -0.1);
      ear.rotation.z = -0.9 * s;
      head.add(ear);
      // Antlers
      const a = new THREE.Group();
      a.position.set(0.15 * s, 0.25, 0);
      a.rotation.z = -0.35 * s;
      a.add(mesh(cyl(0.035, 0.05, 0.6, 4), 0xe8d8b0, 0, 0.3, 0));
      const b1 = mesh(cyl(0.03, 0.035, 0.35, 4), 0xe8d8b0, 0.1 * s, 0.4, 0.05);
      b1.rotation.z = -0.8 * s;
      const b2 = mesh(cyl(0.025, 0.03, 0.3, 4), 0xe8d8b0, -0.05 * s, 0.55, 0.05);
      b2.rotation.z = 0.6 * s;
      a.add(b1, b2);
      head.add(a);
    }
    body.add(mesh(box(0.2, 0.25, 0.1), 0xffffff, 0, bodyY + 0.15, -d.bl / 2 - 0.05));
    height = 2.8;
  } else if (id === 'rabbit') {
    for (const s of [-1, 1]) {
      const ear = mesh(box(0.1, 0.6, 0.06), color, 0.1 * s, 0.5, -0.05);
      ear.add(mesh(box(0.05, 0.45, 0.02), accent, 0, 0, 0.035, false));
      ear.rotation.z = -0.15 * s;
      head.add(ear);
    }
    body.add(mesh(sphere(0.16, 0), 0xffffff, 0, bodyY + 0.1, -d.bl / 2 - 0.05));
    height = 1.5;
  } else if (id === 'skunk') {
    head.add(mesh(box(0.06, 0.06, 0.4), accent, 0, 0.18, 0.1));
    // Big blocky tail: rises from the rump, then a bushy block curling forward over the back.
    const tail = new THREE.Group();
    tail.position.set(0, bodyY + 0.05, -d.bl / 2 + 0.08);
    const base = mesh(box(0.26, 0.55, 0.26), color, 0, 0.18, -0.12);
    base.rotation.x = -0.55;
    const bush = mesh(box(0.46, 0.6, 0.44), color, 0, 0.66, -0.3);
    bush.rotation.x = -0.15;
    const curl = mesh(box(0.44, 0.34, 0.5), color, 0, 1.02, -0.1);
    curl.rotation.x = 0.35;
    // White stripe running up the back of the tail and over the curl.
    const s1 = mesh(box(0.16, 0.6, 0.04), accent, 0, 0.66, -0.53);
    s1.rotation.x = -0.15;
    const s2 = mesh(box(0.16, 0.04, 0.5), accent, 0, 1.2, -0.08);
    s2.rotation.x = 0.35;
    tail.add(base, bush, curl, s1, s2);
    body.add(tail);
    height = 1.7;
  } else if (id === 'bear') {
    for (const s of [-1, 1]) head.add(mesh(sphere(0.16, 0), color, 0.38 * s, 0.42, -0.1));
    height = 3;
  } else if (id === 'moose') {
    // Big flat palmate antlers, a droopy nose and the beard-thing (it's called a bell).
    for (const s of [-1, 1]) {
      const a = new THREE.Group();
      a.position.set(0.3 * s, 0.35, -0.1);
      a.rotation.z = -0.5 * s;
      a.add(mesh(cyl(0.06, 0.08, 0.5, 5), accent, 0, 0.25, 0));
      const palm = mesh(box(0.9, 0.12, 0.6), accent, 0.35 * s, 0.55, 0);
      palm.rotation.z = 0.3 * s;
      a.add(palm);
      for (let i = 0; i < 4; i++) a.add(mesh(cone(0.06, 0.3, 4), accent, (0.1 + i * 0.22) * s, 0.75 + i * 0.05, -0.2 + (i % 2) * 0.3));
      head.add(a);
    }
    head.add(mesh(box(0.5, 0.45, 0.5), color, 0, -0.15, 0.6));
    head.add(mesh(box(0.15, 0.45, 0.12), color, 0, -0.6, 0.1));
    height = 3.8;
  }

  const lx = d.bw / 2 - d.legT / 2;
  const lz = d.bl / 2 - d.legT / 2 - 0.05;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const l = leg(d.legLen, d.legT, color, id === 'deer' ? 0x2b1d12 : color);
    l.position.set(lx * sx, d.legLen, lz * sz);
    body.add(l);
    legs.push(l);
  }

  root.scale.setScalar(scale);
  return { root, body, legs, height: height * scale };
}

/** How an individual hunter looks. Rolled per hunter so no two are quite the same. */
export interface HunterLook {
  vest: number;
  shirt: number;
  pants: number;
  skin: number;
  beard: number | null;
  hatColor: number;
  /** Belly size multiplier. */
  belly: number;
  /** Overall height multiplier. */
  height: number;
  golden: boolean;
  tipsy: boolean;
}

export const DEFAULT_LOOK: HunterLook = {
  vest: 0xff6a00, shirt: 0x8b2e2e, pants: 0x6b5a45, skin: 0xf1c27d, beard: 0x6b4423, hatColor: 0xff6a00,
  belly: 1, height: 1, golden: false, tipsy: false,
};

function cooler(x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(mesh(box(0.7, 0.45, 0.45), 0x1e88e5, 0, 0.22, 0));
  g.add(mesh(box(0.72, 0.1, 0.47), 0xffffff, 0, 0.5, 0));
  g.add(mesh(box(0.3, 0.05, 0.05), 0xffffff, 0, 0.6, 0));
  return g;
}

function beerCan() {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.06, 0.06, 0.18, 8), 0xc0c0c0, 0, 0, 0, false));
  g.add(mesh(cyl(0.061, 0.061, 0.08, 8), 0x1565c0, 0, 0, 0, false));
  return g;
}

export function buildHunter(kind: HunterKind, look: HunterLook = DEFAULT_LOOK): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs: THREE.Object3D[] = [];
  const vest = look.golden ? 0xd4af37 : look.vest;

  if (kind === 'ghillie') {
    // A bush. With eyes. And a rifle.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.6;
      const c = look.golden ? (i % 2 ? 0xb8962e : 0xd4af37) : i % 2 ? 0x3f6b2a : 0x4b7d31;
      body.add(mesh(sphere(0.65 + (i % 3) * 0.12, 0), c, Math.cos(a) * r, 0.7 + (i % 3) * 0.2, Math.sin(a) * r));
    }
    eyes(body, 0.2, 1.25, 0.75, 0.09);
    body.add(mesh(box(0.08, 0.08, 1.8), 0x222222, 0.2, 1.0, 1.2));
    const hat = mesh(sphere(0.35, 0), look.golden ? 0xd4af37 : 0x2d5a1e, 0, 1.75, 0);
    body.add(hat);
    return { root, body, legs, hat, height: 2.4 };
  }

  const isKing = kind === 'king';
  const seated = kind === 'drone';
  const hipY = kind === 'ebike' ? 1.15 : seated ? 0.55 : 0.95;
  const torsoW = 0.62 + 0.12 * look.belly;

  if (kind === 'ebike') {
    // Fat-tire e-bike: frame tubes, battery pack, fenders, handlebars and a headlight.
    const bike = new THREE.Group();
    const frame = vest;
    for (const z of [0.85, -0.85]) {
      bike.add(mesh(cyl(0.46, 0.46, 0.2, 12).rotateZ(Math.PI / 2), 0x1a1a1a, 0, 0.46, z));
      bike.add(mesh(cyl(0.22, 0.22, 0.22, 8).rotateZ(Math.PI / 2), 0x9e9e9e, 0, 0.46, z, false));
      bike.add(mesh(box(0.26, 0.05, 0.75), 0x2a2a2a, 0, 0.98, z * 1.02)); // fenders
    }
    bike.add(segment(new THREE.Vector3(0, 0.5, -0.1), new THREE.Vector3(0, 1.15, 0.65), 0.06, 0.06, frame));
    bike.add(segment(new THREE.Vector3(0, 1.0, -0.35), new THREE.Vector3(0, 1.15, 0.65), 0.06, 0.06, frame));
    bike.add(segment(new THREE.Vector3(0, 0.5, -0.1), new THREE.Vector3(0, 1.05, -0.35), 0.06, 0.06, frame));
    bike.add(segment(new THREE.Vector3(0, 0.46, -0.85), new THREE.Vector3(0, 0.5, -0.1), 0.05, 0.05, frame));
    bike.add(segment(new THREE.Vector3(0, 0.46, 0.85), new THREE.Vector3(0, 1.3, 0.7), 0.05, 0.05, 0x888888));
    bike.add(mesh(box(0.22, 0.26, 0.6), 0x263238, 0, 0.86, 0.18)); // battery
    bike.add(mesh(box(0.23, 0.05, 0.12), 0x76ff03, 0, 1.0, 0.4, false)); // charge LEDs
    bike.add(mesh(box(0.3, 0.1, 0.35), 0x111111, 0, 1.12, -0.38)); // seat
    bike.add(mesh(box(0.75, 0.06, 0.06), 0x888888, 0, 1.38, 0.7));
    for (const sx of [-1, 1]) bike.add(mesh(box(0.08, 0.08, 0.14), 0x111111, 0.36 * sx, 1.38, 0.7));
    bike.add(mesh(box(0.14, 0.12, 0.1), 0xfff6c0, 0, 1.22, 0.86, false)); // headlight
    bike.add(mesh(box(0.32, 0.06, 0.35), 0x333333, 0, 0.82, -0.85)); // rear rack
    bike.add(mesh(box(0.06, 0.06, 0.22), 0x888888, 0.18, 0.4, 0.05, false)); // pedal
    body.add(bike);
  }
  if (seated) {
    // Lawn chair
    body.add(mesh(box(0.9, 0.08, 0.8), 0x2e7d32, 0, 0.5, 0));
    body.add(mesh(box(0.9, 0.9, 0.08), 0x2e7d32, 0, 0.9, -0.4));
    for (const [x, z] of [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35]]) body.add(mesh(box(0.05, 0.5, 0.05), 0xaaaaaa, x, 0.25, z));
  }

  if (kind === 'ebike' || seated) {
    for (const s of [-1, 1]) {
      const l = leg(0.6, 0.22, look.pants, 0x3b2a1a);
      l.position.set(0.16 * s, hipY, 0.1);
      l.rotation.x = -1.2;
      body.add(l);
    }
  } else {
    for (const s of [-1, 1]) {
      const l = leg(0.95, 0.24, look.pants, 0x3b2a1a);
      l.position.set(0.16 * s, hipY, 0);
      body.add(l);
      legs.push(l);
    }
  }
  // Torso: shirt, vest panels, and the belly. Every hunter has the belly.
  body.add(mesh(box(torsoW, 0.85, 0.45), look.shirt, 0, hipY + 0.45, 0));
  body.add(mesh(box(torsoW + 0.04, 0.8, 0.2), vest, 0, hipY + 0.47, 0.14));
  body.add(mesh(box(torsoW + 0.04, 0.8, 0.12), vest, 0, hipY + 0.47, -0.18));
  body.add(mesh(sphere(0.22 + 0.12 * look.belly, 0), vest, 0, hipY + 0.3, 0.12 + 0.08 * look.belly));
  if (isKing) {
    // Cape and a very large belt buckle.
    const cape = mesh(box(torsoW + 0.3, 1.5, 0.06), 0x6a1b9a, 0, hipY + 0.2, -0.32);
    cape.rotation.x = 0.12;
    body.add(cape);
    body.add(mesh(box(0.3, 0.2, 0.05), 0xffe082, 0, hipY + 0.05, 0.38));
  }

  const head = new THREE.Group();
  head.position.set(0, hipY + 1.2, 0);
  body.add(head);
  head.add(mesh(box(0.42, 0.45, 0.42), look.skin, 0, 0, 0));
  if (look.beard !== null) head.add(mesh(box(0.44, 0.2, 0.14), look.beard, 0, -0.17, 0.18));
  else head.add(mesh(box(0.2, 0.05, 0.05), 0xb05050, 0, -0.12, 0.22, false));
  head.add(mesh(sphere(0.06, 0), look.tipsy ? 0xe57373 : 0xe0a060, 0, 0, 0.24, false));
  eyes(head, 0.1, 0.07, 0.2, 0.055);

  // Hats. The king wears a stack of them, one per boop he can take.
  const hats: THREE.Object3D[] = [];
  const hat = new THREE.Group();
  hat.position.set(0, 0.25, 0);
  const hc = look.golden ? 0xd4af37 : look.hatColor;
  if (kind === 'bow') {
    hat.add(mesh(cyl(0.24, 0.26, 0.2, 8), hc, 0, 0.1, 0));
    hat.add(mesh(cyl(0.4, 0.4, 0.04, 8), hc, 0, 0.02, 0));
  } else if (kind === 'ebike') {
    hat.add(mesh(sphere(0.28, 1), hc, 0, 0.05, 0));
  } else if (kind === 'trapper') {
    hat.add(mesh(cyl(0.25, 0.26, 0.28, 8), 0x8d6e63, 0, 0.12, 0));
    const tail = mesh(box(0.1, 0.1, 0.55), 0x5d4037, 0, 0.05, -0.4);
    tail.add(mesh(box(0.11, 0.11, 0.1), 0x212121, 0, 0, -0.15, false));
    hat.add(tail);
  } else if (kind === 'drone') {
    hat.add(mesh(box(0.46, 0.18, 0.46), hc, 0, 0.08, 0));
    hat.add(mesh(box(0.46, 0.04, 0.25), hc, 0, 0.0, -0.3));
    hat.add(mesh(box(0.06, 0.25, 0.06), 0x222222, 0.25, -0.15, 0));
    hat.add(mesh(box(0.06, 0.25, 0.06), 0x222222, -0.25, -0.15, 0));
  } else if (isKing) {
    // Cowboy hat, top hat, then crown on top.
    const cowboy = new THREE.Group();
    cowboy.add(mesh(cyl(0.6, 0.6, 0.05, 10), 0x6d4c41, 0, 0, 0));
    cowboy.add(mesh(cyl(0.25, 0.28, 0.25, 8), 0x6d4c41, 0, 0.13, 0));
    const top = new THREE.Group();
    top.position.y = 0.27;
    top.add(mesh(cyl(0.38, 0.38, 0.04, 10), 0x212121, 0, 0, 0));
    top.add(mesh(cyl(0.24, 0.24, 0.45, 10), 0x212121, 0, 0.23, 0));
    const crown = new THREE.Group();
    crown.position.y = 0.73;
    crown.add(mesh(cyl(0.24, 0.22, 0.2, 8), 0xffd54f, 0, 0.1, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      crown.add(mesh(cone(0.06, 0.18, 4), 0xffd54f, Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2));
    }
    crown.add(mesh(sphere(0.05, 0), 0xe53935, 0, 0.12, 0.23, false));
    hat.add(cowboy, top, crown);
    hats.push(crown, top, cowboy);
  } else {
    hat.add(mesh(box(0.46, 0.2, 0.46), hc, 0, 0.08, 0));
    hat.add(mesh(box(0.46, 0.04, 0.25), hc, 0, 0.0, 0.3));
    hat.add(mesh(box(0.06, 0.18, 0.2), 0x6b4423, 0.25, -0.05, 0));
    hat.add(mesh(box(0.06, 0.18, 0.2), 0x6b4423, -0.25, -0.05, 0));
  }
  head.add(hat);

  const arms = new THREE.Group();
  arms.position.set(0, hipY + 0.8, 0);
  body.add(arms);
  for (const s of [-1, 1]) arms.add(mesh(box(0.18, 0.18, 0.6), look.shirt, (torsoW / 2 + 0.07) * s, 0, 0.25));
  if (kind === 'bow' || kind === 'trapper') {
    if (kind === 'bow') {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 4, 10, Math.PI), mat(0x7a4a22));
      bow.rotation.z = Math.PI / 2;
      bow.position.set(0, 0, 0.65);
      arms.add(bow);
      arms.add(mesh(box(0.01, 1.1, 0.01), 0xffffff, 0, 0, 0.65, false));
    } else {
      arms.add(mesh(box(0.1, 0.1, 0.8), 0x5d4037, 0, 0.05, 0.6));
      arms.add(mesh(box(0.8, 0.06, 0.08), 0x3e2723, 0, 0.08, 0.9));
      // A spare trap on her back.
      body.add(mesh(cyl(0.3, 0.3, 0.08, 10).rotateX(Math.PI / 2), 0x757575, 0, hipY + 0.6, -0.32));
    }
  } else if (kind === 'rifle' || kind === 'shotgun' || kind === 'hound' || kind === 'drunk' || isKing) {
    const long = kind === 'rifle' || kind === 'hound' || kind === 'drunk';
    const metal = isKing ? 0xd4af37 : 0x222222;
    arms.add(mesh(box(0.1, 0.12, long ? 1.3 : 1.0), isKing ? 0x6d4c41 : 0x3a2a1a, 0, 0.05, 0.6));
    arms.add(mesh(cyl(0.035, 0.035, 0.7, 5).rotateX(Math.PI / 2), metal, 0, 0.1, long ? 1.3 : 1.1));
    if (long) arms.add(mesh(cyl(0.05, 0.05, 0.3, 6).rotateX(Math.PI / 2), 0x111111, 0, 0.2, 0.6));
    else arms.add(mesh(cyl(0.035, 0.035, 0.7, 5).rotateX(Math.PI / 2), metal, 0.07, 0.1, 1.1));
  } else if (kind === 'ebike') {
    arms.position.set(0, hipY + 0.6, 0.2);
    arms.rotation.x = 0.4;
  } else if (seated) {
    arms.position.set(0, hipY + 0.6, 0.1);
    arms.add(mesh(box(0.5, 0.08, 0.3), 0x37474f, 0, 0, 0.55));
    arms.add(mesh(box(0.04, 0.2, 0.04), 0x37474f, 0.15, 0.12, 0.55));
  }
  if (kind === 'drunk') body.add(cooler(torsoW / 2 + 0.3, hipY - 0.25, 0.1));
  if (look.tipsy || kind === 'drunk') {
    const can = beerCan();
    can.position.set(-(torsoW / 2 + 0.07), 0.05, 0.55);
    arms.add(can);
  }

  const scale = (isKing ? 1.45 : 1) * look.height;
  root.scale.setScalar(scale);
  return { root, body, legs, hat, hats: hats.length ? hats : undefined, height: (hipY + 2) * scale };
}

export function buildDog(): Rig {
  // A beagle: floppy ears, white tail tip, very serious nose.
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs: THREE.Object3D[] = [];
  body.add(mesh(box(0.45, 0.4, 0.95), 0xc68642, 0, 0.6, 0));
  body.add(mesh(box(0.46, 0.3, 0.4), 0x3e2723, 0, 0.7, -0.1));
  const head = new THREE.Group();
  head.position.set(0, 0.85, 0.55);
  head.add(mesh(box(0.35, 0.35, 0.4), 0xc68642, 0, 0, 0));
  head.add(mesh(box(0.22, 0.2, 0.25), 0xffffff, 0, -0.08, 0.25));
  head.add(mesh(sphere(0.06, 0), 0x111111, 0, -0.02, 0.38, false));
  for (const s of [-1, 1]) head.add(mesh(box(0.08, 0.35, 0.2), 0x6d4c41, 0.21 * s, -0.08, -0.02));
  eyes(head, 0.09, 0.08, 0.18, 0.05);
  body.add(head);
  const tail = mesh(box(0.06, 0.4, 0.06), 0xffffff, 0, 0.9, -0.5);
  tail.rotation.x = -0.5;
  body.add(tail);
  for (const [x, z] of [[-0.15, 0.35], [0.15, 0.35], [-0.15, -0.35], [0.15, -0.35]]) {
    const l = leg(0.4, 0.12, 0xc68642, 0xffffff);
    l.position.set(x, 0.42, z);
    body.add(l);
    legs.push(l);
  }
  return { root, body, legs, height: 1.2 };
}

export function buildDrone(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(0.6, 0.18, 0.6), 0x37474f, 0, 0, 0));
  g.add(mesh(sphere(0.12, 0), 0x111111, 0, -0.12, 0.25, false));
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
    g.add(mesh(box(0.4, 0.04, 0.06), 0x263238, x / 2, 0, z / 2, false));
    const rotor = mesh(cyl(0.22, 0.22, 0.02, 8), 0x90a4ae, x, 0.08, z, false);
    rotor.name = 'rotor';
    g.add(rotor);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff1744 }));
  led.position.set(0, 0.12, 0);
  g.add(led);
  return g;
}

export function buildTrap(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.45, 0.45, 0.05, 10), 0x5d5d5d, 0, 0.03, 0, false));
  for (const s of [-1, 1]) {
    const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 3, 10, Math.PI), mat(0x7a7a7a));
    jaw.rotation.x = -Math.PI / 2 + s * 0.5;
    jaw.position.y = 0.08;
    g.add(jaw);
  }
  g.add(mesh(box(0.2, 0.03, 0.2), 0xb0a080, 0, 0.07, 0, false));
  return g;
}

/** Props and pickups for the hidden campaign. */
export function buildSecretItem(item: SecretItem): THREE.Group {
  const g = new THREE.Group();
  const glow = (c: number) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.45, flatShading: true });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  switch (item) {
    case 'pear':
      add(sphere(0.32, 1), glow(0xffd54f), 0, 0, 0);
      add(sphere(0.22, 1), glow(0xffd54f), 0, 0.3, 0);
      add(box(0.05, 0.2, 0.05), mat(0x5b3a1a), 0, 0.55, 0);
      break;
    case 'flyer': {
      add(box(0.15, 2, 0.15), mat(0x6b5a45), 0, 1, 0);
      const paper = add(box(1.1, 1.4, 0.04), glow(0xfff8e1), 0, 1.6, 0.1);
      paper.rotation.z = 0.05;
      add(box(0.9, 0.18, 0.05), mat(0xd4af37), 0, 2.05, 0.12);
      add(box(0.6, 0.5, 0.05), mat(0x8d6e63), 0, 1.5, 0.12);
      break;
    }
    case 'radio':
      add(box(0.3, 0.55, 0.15), glow(0xffb300), 0, 0.3, 0);
      add(box(0.04, 0.35, 0.04), mat(0x222222), 0.1, 0.72, 0);
      add(box(0.2, 0.15, 0.02), mat(0x263238), 0, 0.35, 0.08);
      break;
    case 'battery':
      add(cyl(0.12, 0.12, 0.45, 8), glow(0x43a047), 0, 0.25, 0);
      add(cyl(0.05, 0.05, 0.06, 6), mat(0xcccccc), 0, 0.5, 0);
      break;
    case 'charger':
      add(box(1.4, 1.6, 0.8), mat(0x37474f), 0, 0.8, 0);
      add(box(0.6, 0.6, 0.05), glow(0x22d3ee), 0, 1.1, 0.42);
      add(box(0.2, 0.4, 0.05), mat(0xffeb3b), 0, 1.1, 0.45);
      add(box(0.1, 0.1, 3), mat(0x111111), 0.4, 0.05, 1.8);
      add(box(0.4, 0.3, 0.3), glow(0xff1744), 0.4, 0.2, 3.3);
      break;
    case 'key':
      add(new THREE.TorusGeometry(0.18, 0.05, 4, 10), glow(0xffb74d), 0, 0.45, 0);
      add(box(0.06, 0.45, 0.06), glow(0xffb74d), 0, 0.1, 0);
      add(box(0.15, 0.06, 0.06), glow(0xffb74d), 0.07, -0.05, 0);
      break;
    case 'cage': {
      add(box(1.8, 0.1, 1.8), mat(0x5d4037), 0, 0.05, 0);
      add(box(1.8, 0.1, 1.8), mat(0x5d4037), 0, 1.75, 0);
      for (let i = 0; i < 6; i++) {
        for (const s of [-1, 1]) {
          add(cyl(0.03, 0.03, 1.7, 4), mat(0x9e9e9e), -0.75 + i * 0.3, 0.9, 0.85 * s);
          add(cyl(0.03, 0.03, 1.7, 4), mat(0x9e9e9e), 0.85 * s, 0.9, -0.75 + i * 0.3);
        }
      }
      const critter = new THREE.Group();
      critter.name = 'critter';
      const parrot = Math.random() < 0.5;
      critter.add(new THREE.Mesh(sphere(0.3, 1), mat(parrot ? 0xe53935 : 0x795548)));
      const h = new THREE.Mesh(sphere(0.22, 1), mat(parrot ? 0x43a047 : 0xa1887f));
      h.position.set(0, 0.4, 0.1);
      critter.add(h);
      critter.position.y = 0.5;
      g.add(critter);
      add(box(0.3, 0.3, 0.1), glow(0xffb74d), 0, 0.9, 0.92);
      break;
    }
    case 'feather':
      add(box(0.12, 0.8, 0.03), glow(0xb0bec5), 0, 0.4, 0).rotation.z = 0.3;
      break;
    case 'decoy': {
      add(sphere(0.45, 1), mat(0x6d4c41), 0, 0.35, 0).scale.set(1, 0.7, 1.4);
      add(sphere(0.25, 1), mat(0x2e7d32), 0, 0.7, 0.4);
      add(box(0.2, 0.06, 0.2), mat(0xf2c94c), 0, 0.68, 0.65);
      add(box(0.03, 0.5, 0.03), mat(0x222222), 0, 1.0, -0.2);
      const led = add(sphere(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xff1744 }), 0, 1.27, -0.2);
      led.name = 'led';
      break;
    }
    case 'lodgemap':
      add(cyl(0.12, 0.12, 0.8, 8).rotateZ(Math.PI / 2), glow(0xfff3c4), 0, 0.3, 0);
      add(box(0.06, 0.06, 0.06), mat(0xc62828), 0, 0.3, 0.12);
      break;
  }
  return g;
}

export function buildHatPickup(color = 0xff6a00, golden = false): THREE.Group {
  const g = new THREE.Group();
  const c = golden ? 0xd4af37 : color;
  g.add(mesh(box(0.5, 0.22, 0.5), c, 0, 0, 0));
  g.add(mesh(box(0.5, 0.04, 0.28), c, 0, -0.08, 0.32));
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.05, 4, 20).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: golden ? 0xffd54f : 0xffffff, transparent: true, opacity: 0.7 }),
  );
  ring.position.y = -0.3;
  g.add(ring);
  return g;
}

/** The Trophy King's lodge: a log cabin with a big antler sign. Returns the group and its collision footprint. */
export function buildLodge(): THREE.Group {
  const g = new THREE.Group();
  const W = 22;
  const D = 12;
  for (let i = 0; i < 9; i++) {
    g.add(mesh(cyl(0.45, 0.45, W, 8).rotateZ(Math.PI / 2), i % 2 ? 0x8d6e63 : 0x795548, 0, 0.45 + i * 0.85, D / 2));
    g.add(mesh(cyl(0.45, 0.45, W, 8).rotateZ(Math.PI / 2), i % 2 ? 0x8d6e63 : 0x795548, 0, 0.45 + i * 0.85, -D / 2));
    g.add(mesh(cyl(0.45, 0.45, D, 8).rotateX(Math.PI / 2), i % 2 ? 0x795548 : 0x8d6e63, W / 2, 0.45 + i * 0.85, 0));
    g.add(mesh(cyl(0.45, 0.45, D, 8).rotateX(Math.PI / 2), i % 2 ? 0x795548 : 0x8d6e63, -W / 2, 0.45 + i * 0.85, 0));
  }
  for (const s of [-1, 1]) {
    const roof = mesh(box(W + 2, 0.4, D / 2 + 2.5), 0x4e342e, 0, 9.3, (s * D) / 4);
    roof.rotation.x = s * 0.55;
    g.add(roof);
  }
  // Glowing windows
  const win = new THREE.MeshBasicMaterial({ color: 0xffd180 });
  for (const x of [-7, -3, 3, 7]) {
    const w = new THREE.Mesh(box(2, 1.6, 0.2), win);
    w.position.set(x, 4, D / 2 + 0.45);
    g.add(w);
  }
  const door = new THREE.Mesh(box(2.4, 3.6, 0.2), new THREE.MeshBasicMaterial({ color: 0xffb74d }));
  door.position.set(0, 1.8, D / 2 + 0.45);
  g.add(door);
  // Sign with antlers
  g.add(mesh(box(10, 1.6, 0.3), 0x3e2723, 0, 9.8, D / 2 + 1.6));
  g.add(new THREE.Mesh(box(9, 1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffd54f })).translateY(9.8).translateZ(D / 2 + 1.8));
  for (const s of [-1, 1]) {
    const a = mesh(box(0.25, 2.2, 0.25), 0xe8d8b0, 6 * s, 10.8, D / 2 + 1.6);
    a.rotation.z = -0.5 * s;
    g.add(a);
  }
  g.userData.footprint = { w: W + 1, d: D + 1 };
  return g;
}

export function buildLantern(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(0.15, 3, 0.15), 0x3e2723, 0, 1.5, 0));
  const l = new THREE.Mesh(box(0.45, 0.6, 0.45), new THREE.MeshBasicMaterial({ color: 0xffcc80 }));
  l.position.y = 3.2;
  g.add(l);
  g.userData.radius = 0.3;
  return g;
}

/** A cylinder running from point a to point b, so bent trunks stay connected. */
function segment(a: THREE.Vector3, b: THREE.Vector3, rTop: number, rBottom: number, color: number, sides = 6) {
  const len = a.distanceTo(b);
  const m = mesh(cyl(rTop, rBottom, len, sides), color);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

export function buildTree(style: MapDef['treeStyle'], rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const s = 0.8 + rng() * 0.7;
  if (style === 'pine' || style === 'snowpine') {
    // Trunk starts below ground so it never floats on a slope, and runs up into the top cone.
    g.add(mesh(cyl(0.2, 0.38, 4.2, 6), 0x6b4423, 0, 1.4, 0));
    const greens = [0x2f6b3a, 0x3a7d44, 0x285c32];
    for (let i = 0; i < 3; i++) {
      g.add(mesh(cone(2.2 - i * 0.55, 2.4, 7), greens[i % 3], 0, 2.3 + i * 1.3, 0));
      if (style === 'snowpine') g.add(mesh(cone(1.25 - i * 0.33, 1.0, 7), 0xffffff, 0, 3.05 + i * 1.3, 0));
    }
  } else if (style === 'palm') {
    // Gently curved trunk built from overlapping segments that meet end to end.
    const lean = (rng() - 0.5) * 1.6;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      pts.push(new THREE.Vector3(lean * t * t, -0.4 + t * 6.6, 0));
    }
    for (let i = 0; i < 5; i++) {
      g.add(segment(pts[i], pts[i + 1].clone().lerp(pts[i], -0.08), 0.2 - i * 0.01, 0.3 - i * 0.015, i % 2 ? 0x8b6b3d : 0x7a5c33));
    }
    const top = new THREE.Group();
    top.position.copy(pts[5]);
    top.add(mesh(sphere(0.32, 0), 0x6b5a2a, 0, 0.05, 0));
    for (let i = 0; i < 7; i++) {
      // Each frond starts at the crown and droops outward.
      const p = new THREE.Group();
      p.rotation.y = (i / 7) * Math.PI * 2 + rng() * 0.3;
      const inner = mesh(box(0.7, 0.08, 1.7), i % 2 ? 0x2e8b3a : 0x3fa34d, 0, 0.1, 0.8);
      inner.rotation.x = -0.25;
      const outer = mesh(box(0.55, 0.07, 1.6), i % 2 ? 0x2e8b3a : 0x3fa34d, 0, -0.35, 2.2);
      outer.rotation.x = 0.55;
      p.add(inner, outer);
      top.add(p);
    }
    for (const [x, z] of [[0.22, 0.15], [-0.2, 0.12], [0, -0.24]]) top.add(mesh(sphere(0.2, 0), 0x5a3d1e, x, -0.3, z));
    g.add(top);
  } else {
    // Swamp willow: thick trunk, lumpy canopy, and curtains of vines hanging from the canopy edge.
    g.add(mesh(cyl(0.35, 0.65, 4.4, 6), 0x5b4a32, 0, 1.6, 0));
    g.add(mesh(sphere(2.1, 1), 0x6b8a3a, 0, 4.4, 0));
    g.add(mesh(sphere(1.5, 1), 0x7a9a45, 0.9, 5.1, 0.4));
    g.add(mesh(sphere(1.4, 1), 0x5f7d33, -0.8, 4.9, -0.5));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng() * 0.3;
      const r = 1.75;
      const len = 1.6 + rng() * 1.0;
      g.add(mesh(box(0.28, len, 0.28), 0x7d9a45, Math.cos(a) * r, 3.9 - len / 2, Math.sin(a) * r));
    }
  }
  g.scale.setScalar(s);
  g.rotation.y = rng() * Math.PI * 2;
  g.userData.radius = (style === 'palm' ? 0.35 : 0.5) * s;
  // Branches block sight further out than the trunk blocks movement.
  g.userData.sightR = (style === 'palm' ? 0.55 : style === 'willow' ? 1.9 : 1.35) * s;
  return g;
}

export function buildBush(color: number, rng: () => number, snow = false): THREE.Group {
  const g = new THREE.Group();
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const r = rng() * 0.8;
    const m = mesh(sphere(0.8 + rng() * 0.5, 0), color, Math.cos(a) * r, 0.6 + rng() * 0.4, Math.sin(a) * r);
    g.add(m);
  }
  if (snow) g.add(mesh(sphere(0.7, 0), 0xffffff, 0, 1.4, 0));
  g.userData.radius = 1.6;
  return g;
}

export function buildRock(rng: () => number, snow = false): THREE.Mesh {
  const r = 0.6 + rng() * 1.4;
  const m = mesh(new THREE.DodecahedronGeometry(r, 0), snow ? 0xc7d1db : 0x8a8f94, 0, r * 0.4, 0);
  m.scale.set(1, 0.6 + rng() * 0.4, 1);
  m.rotation.y = rng() * 6;
  m.userData.radius = r * 0.9;
  return m;
}

export function buildFood(color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(sphere(0.35, 1), color, 0, 0, 0));
  g.add(mesh(box(0.05, 0.2, 0.05), 0x5b3a1a, 0, 0.38, 0));
  g.add(mesh(box(0.18, 0.04, 0.1), 0x3fa34d, 0.1, 0.42, 0));
  return g;
}

const TRUCK_COLORS = [0xb03a2e, 0x2e4a7a, 0x3d5a3a, 0x8a6d3b, 0xe0e0e0, 0x2b2b2b, 0x6b2e5e];

/** A lifted pickup truck with a bed, cab windows, lights, mud flaps and a light bar. */
export function buildTruck(rng: () => number, color = TRUCK_COLORS[Math.floor(rng() * TRUCK_COLORS.length)]): THREE.Group {
  const g = new THREE.Group();
  const trim = 0x2a2a2a;
  const chrome = 0xc8c8c8;
  const glass = 0x9fc5e8;
  // Frame and body. The truck points toward +z.
  g.add(mesh(box(2.0, 0.3, 5.0), trim, 0, 0.75, 0));
  g.add(mesh(box(2.3, 0.75, 1.9), color, 0, 1.3, 1.65)); // hood
  g.add(mesh(box(2.3, 1.2, 1.5), color, 0, 1.5, 0.1)); // cab lower
  g.add(mesh(box(2.1, 0.75, 1.35), glass, 0, 2.45, 0.1)); // cab windows
  g.add(mesh(box(2.2, 0.1, 1.45), color, 0, 2.86, 0.1)); // roof
  g.add(mesh(box(2.12, 0.75, 0.12), color, 0, 2.45, 0.1)); // B pillar
  g.add(mesh(box(2.12, 0.62, 0.1), glass, 0, 2.3, 0.82).rotateX(-0.35)); // windshield
  // Bed with walls and tailgate.
  g.add(mesh(box(2.3, 0.2, 2.0), color, 0, 1.0, -1.65));
  for (const sx of [-1, 1]) g.add(mesh(box(0.12, 0.7, 2.0), color, 1.09 * sx, 1.45, -1.65));
  g.add(mesh(box(2.3, 0.7, 0.12), color, 0, 1.45, -2.6));
  g.add(mesh(box(2.06, 0.06, 1.9), trim, 0, 1.12, -1.65));
  // Stripe, bumpers, grille, lights.
  for (const sx of [-1, 1]) g.add(mesh(box(0.02, 0.14, 4.6), 0xf2f2f2, 1.16 * sx, 1.55, 0));
  g.add(mesh(box(2.4, 0.3, 0.2), chrome, 0, 0.95, 2.65));
  g.add(mesh(box(2.4, 0.25, 0.2), trim, 0, 0.95, -2.7));
  g.add(mesh(box(1.4, 0.45, 0.06), trim, 0, 1.38, 2.61));
  for (let i = -2; i <= 2; i++) g.add(mesh(box(0.06, 0.4, 0.07), chrome, i * 0.26, 1.38, 2.63, false));
  for (const sx of [-1, 1]) {
    g.add(mesh(box(0.35, 0.22, 0.06), 0xfff6c0, 0.92 * sx, 1.42, 2.62, false));
    g.add(mesh(box(0.22, 0.35, 0.06), 0xd32f2f, 0.98 * sx, 1.45, -2.68, false));
    g.add(mesh(box(0.1, 0.22, 0.3), trim, 1.22 * sx, 2.3, 0.75)); // mirrors
    g.add(mesh(box(0.3, 0.05, 0.08), trim, 1.17 * sx, 1.75, 0.3, false)); // door handles
  }
  // Roof light bar, because of course.
  g.add(mesh(box(1.7, 0.18, 0.25), trim, 0, 3.0, 0.5));
  for (let i = -3; i <= 3; i++) g.add(mesh(box(0.18, 0.12, 0.05), 0xfff6c0, i * 0.23, 3.0, 0.64, false));
  // Wheels with hubs and arches.
  for (const [x, z] of [[-1.05, 1.6], [1.05, 1.6], [-1.05, -1.6], [1.05, -1.6]]) {
    g.add(mesh(cyl(0.55, 0.55, 0.45, 10).rotateZ(Math.PI / 2), 0x151515, x, 0.55, z));
    g.add(mesh(cyl(0.26, 0.26, 0.47, 6).rotateZ(Math.PI / 2), chrome, x, 0.55, z, false));
    g.add(mesh(box(0.5, 0.15, 1.35), trim, x * 1.06, 1.12, z));
    if (z < 0) g.add(mesh(box(0.4, 0.4, 0.04), trim, x * 1.02, 0.55, z - 0.75));
  }
  // Something in the bed: a cooler or a spare tire.
  if (rng() < 0.5) {
    g.add(mesh(box(0.8, 0.45, 0.5), 0x1e88e5, 0.4, 1.4, -1.3));
    g.add(mesh(box(0.84, 0.1, 0.54), 0xffffff, 0.4, 1.66, -1.3));
  } else {
    g.add(mesh(cyl(0.5, 0.5, 0.3, 10), 0x151515, -0.4, 1.32, -1.9));
  }
  g.userData.radius = 2.6;
  return g;
}

/**
 * Hunting tree stand: four legs, a platform 4 m up with a seat and railing, and a ladder on the +z side.
 * Hunters climb it; the player can boop it.
 */
export const STAND_HEIGHT = 4;
export function buildTreeStand(): THREE.Group {
  const g = new THREE.Group();
  const wood = 0x6b5a45;
  const dark = 0x4d3f30;
  const camo = 0x4d5a2e;
  const H = STAND_HEIGHT;
  for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) {
    const leg = mesh(box(0.16, H + 0.2, 0.16), wood, x * 1.15, H / 2, z * 1.15);
    leg.rotation.set(z * 0.06, 0, -x * 0.06);
    g.add(leg);
  }
  // Cross braces
  for (const y of [1.3, 2.7]) {
    for (const z of [-1, 1]) g.add(mesh(box(2.0, 0.1, 0.08), dark, 0, y, z * 0.92));
    for (const x of [-1, 1]) g.add(mesh(box(0.08, 0.1, 2.0), dark, x * 0.92, y, 0));
  }
  g.add(mesh(box(2.2, 0.16, 2.2), wood, 0, H, 0));
  // Railing with a camo skirt on three sides, open on the ladder side.
  for (const [x, z, w, d] of [[0, -1.05, 2.2, 0.08], [-1.05, 0, 0.08, 2.2], [1.05, 0, 0.08, 2.2]] as const) {
    g.add(mesh(box(w, 0.08, d), dark, x, H + 0.95, z));
    g.add(mesh(box(w * 0.98 || 0.06, 0.6, d * 0.98 || 0.06), camo, x, H + 0.45, z));
  }
  for (const [x, z] of [[-1.05, -1.05], [1.05, -1.05], [-1.05, 1.05], [1.05, 1.05]]) g.add(mesh(box(0.08, 1.0, 0.08), dark, x, H + 0.5, z));
  // Seat
  g.add(mesh(box(0.8, 0.1, 0.6), dark, 0, H + 0.55, -0.6));
  g.add(mesh(box(0.8, 0.6, 0.08), dark, 0, H + 0.85, -0.92));
  // Ladder, leaning in on the +z side.
  const ladder = new THREE.Group();
  ladder.position.set(0, 0, 1.75);
  ladder.rotation.x = -0.2;
  const len = H / Math.cos(0.2);
  for (const x of [-0.32, 0.32]) ladder.add(mesh(box(0.09, len, 0.09), wood, x, len / 2, 0));
  for (let y = 0.4; y < len - 0.1; y += 0.45) ladder.add(mesh(box(0.64, 0.07, 0.07), dark, 0, y, 0));
  g.add(ladder);
  g.userData.radius = 1.3;
  return g;
}

/** A hunter's lunch: a cooler bag and a very large sandwich. */
export function buildLunch(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(0.42, 0.3, 0.3), 0xc62828, 0, 0.15, 0));
  g.add(mesh(box(0.44, 0.06, 0.32), 0xffffff, 0, 0.32, 0));
  g.add(mesh(box(0.26, 0.05, 0.08), 0x222222, 0, 0.38, 0));
  const sand = new THREE.Group();
  sand.position.set(0.42, 0, 0.05);
  sand.add(mesh(box(0.36, 0.07, 0.3), 0xe0b46a, 0, 0.04, 0));
  sand.add(mesh(box(0.38, 0.04, 0.32), 0x6abf4b, 0, 0.1, 0));
  sand.add(mesh(box(0.36, 0.05, 0.3), 0xe57373, 0, 0.14, 0));
  sand.add(mesh(box(0.36, 0.07, 0.3), 0xe0b46a, 0, 0.2, 0));
  g.add(sand);
  return g;
}

/** Floating pickup: a folded blaze-orange vest. */
export function buildVestPickup(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(0.6, 0.14, 0.5), 0xff6a00, 0, 0, 0));
  g.add(mesh(box(0.62, 0.04, 0.08), 0xfff176, 0, 0.08, 0.1, false));
  g.add(mesh(box(0.62, 0.04, 0.08), 0xfff176, 0, 0.08, -0.1, false));
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.75, 0.05, 4, 20).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff8f00, transparent: true, opacity: 0.8 }),
  );
  ring.position.y = -0.3;
  g.add(ring);
  return g;
}

/** Blaze-orange vest and cap that the player's critter wears while disguised. */
export function buildDisguise(rig: Rig): THREE.Group {
  const g = new THREE.Group();
  // Measure the body in the rig's own space, not wherever it is standing in the world.
  const saved = { p: rig.root.position.clone(), q: rig.root.quaternion.clone() };
  rig.root.position.set(0, 0, 0);
  rig.root.quaternion.identity();
  rig.root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(rig.body);
  rig.root.position.copy(saved.p);
  rig.root.quaternion.copy(saved.q);
  rig.root.updateMatrixWorld(true);
  const size = b.getSize(new THREE.Vector3());
  const c = b.getCenter(new THREE.Vector3());
  const s = 1 / rig.root.scale.x;
  const vest = mesh(box(size.x * 1.06 * s, size.y * 0.3 * s, size.z * 0.5 * s), 0xff6a00, c.x * s, (b.min.y + size.y * 0.55) * s, c.z * s);
  g.add(vest);
  g.add(mesh(box(size.x * 1.08 * s, 0.05 * s, size.z * 0.1 * s), 0xfff176, c.x * s, (b.min.y + size.y * 0.6) * s, c.z * s, false));
  const cap = new THREE.Group();
  cap.add(mesh(box(0.45, 0.2, 0.45), 0xff6a00, 0, 0, 0));
  cap.add(mesh(box(0.45, 0.04, 0.25), 0xff6a00, 0, -0.08, 0.3));
  cap.position.set(c.x * s, b.max.y * s + 0.05, (c.z + size.z * 0.35) * s);
  g.add(cap);
  return g;
}

export function buildDecorations(kind: 'stand' | 'truck' | 'sign', rng: () => number): THREE.Group {
  if (kind === 'truck') return buildTruck(rng);
  if (kind === 'stand') return buildTreeStand();
  const g = new THREE.Group();
  g.add(mesh(box(0.2, 2, 0.2), 0x6b5a45, 0, 1, 0));
  g.add(mesh(box(2.2, 1, 0.1), 0xf2c94c, 0, 2, 0));
  g.userData.radius = 0.4;
  g.rotation.y = rng() * Math.PI * 2;
  return g;
}

export function textSprite(text: string, opts: { bg?: string; fg?: string; size?: number } = {}): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontSize = 44;
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  canvas.width = w;
  canvas.height = fontSize + 30;
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  if (opts.bg !== 'none') {
    ctx.fillStyle = opts.bg ?? 'rgba(255,255,255,0.95)';
    const r = 20;
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, canvas.height - 4, r);
    ctx.fill();
  }
  ctx.fillStyle = opts.fg ?? '#1d1d1d';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, canvas.height / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const size = opts.size ?? 0.9;
  sprite.scale.set((w / canvas.height) * size, size, 1);
  sprite.renderOrder = 10;
  return sprite;
}
