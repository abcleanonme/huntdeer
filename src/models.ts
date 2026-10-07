// Procedural low-poly models built from primitives, so the game ships with zero asset files.
import * as THREE from 'three';
import type { AnimalId, HunterKind, MapDef } from './data';

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
    const tail = new THREE.Group();
    tail.position.set(0, bodyY + 0.1, -d.bl / 2);
    tail.add(mesh(sphere(0.32, 1), color, 0, 0.45, -0.25));
    tail.add(mesh(box(0.12, 0.6, 0.12), accent, 0, 0.5, -0.4));
    tail.add(mesh(sphere(0.3, 1), color, 0, 0.9, -0.3));
    body.add(tail);
    height = 1.7;
  } else if (id === 'bear') {
    for (const s of [-1, 1]) head.add(mesh(sphere(0.16, 0), color, 0.38 * s, 0.42, -0.1));
    height = 3;
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

export function buildHunter(kind: HunterKind, vest: number): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs: THREE.Object3D[] = [];

  if (kind === 'ghillie') {
    // A bush. With eyes. And a rifle.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.6;
      body.add(mesh(sphere(0.65 + (i % 3) * 0.12, 0), i % 2 ? 0x3f6b2a : 0x4b7d31, Math.cos(a) * r, 0.7 + (i % 3) * 0.2, Math.sin(a) * r));
    }
    eyes(body, 0.2, 1.25, 0.75, 0.09);
    const gun = mesh(box(0.08, 0.08, 1.8), 0x222222, 0.2, 1.0, 1.2);
    body.add(gun);
    const hat = mesh(sphere(0.35, 0), 0x2d5a1e, 0, 1.75, 0);
    body.add(hat);
    return { root, body, legs, hat, height: 2.4 };
  }

  const skin = 0xf1c27d;
  const pants = kind === 'bow' ? 0x5b6b3a : 0x6b5a45;

  if (kind === 'ebike') {
    const bike = new THREE.Group();
    bike.add(mesh(cyl(0.45, 0.45, 0.12, 12).rotateZ(Math.PI / 2), 0x222222, 0, 0.45, 0.8));
    bike.add(mesh(cyl(0.45, 0.45, 0.12, 12).rotateZ(Math.PI / 2), 0x222222, 0, 0.45, -0.8));
    bike.add(mesh(box(0.15, 0.15, 1.5), 0x22d3ee, 0, 0.8, 0));
    bike.add(mesh(box(0.3, 0.35, 0.5), 0x333333, 0, 0.7, 0)); // battery
    bike.add(mesh(box(0.7, 0.06, 0.06), 0x888888, 0, 1.4, 0.7));
    bike.add(mesh(box(0.1, 0.6, 0.1), 0x888888, 0, 1.1, 0.7));
    body.add(bike);
    body.position.y = 0;
  }

  const hipY = kind === 'ebike' ? 1.15 : 0.95;
  if (kind !== 'ebike') {
    for (const s of [-1, 1]) {
      const l = leg(0.95, 0.24, pants, 0x3b2a1a);
      l.position.set(0.16 * s, hipY, 0);
      body.add(l);
      legs.push(l);
    }
  } else {
    for (const s of [-1, 1]) {
      const l = leg(0.6, 0.22, pants, 0x3b2a1a);
      l.position.set(0.16 * s, hipY, 0.1);
      l.rotation.x = -1.0;
      body.add(l);
    }
  }
  // Torso (blaze-orange vest over a plaid-ish shirt)
  body.add(mesh(box(0.7, 0.85, 0.45), vest, 0, hipY + 0.45, 0));
  body.add(mesh(box(0.5, 0.25, 0.4), 0x8b2e2e, 0, hipY + 0.95, 0));
  // Belly. Every hunter has the belly.
  body.add(mesh(sphere(0.3, 0), vest, 0, hipY + 0.3, 0.2));
  // Head
  const head = new THREE.Group();
  head.position.set(0, hipY + 1.2, 0);
  body.add(head);
  head.add(mesh(box(0.42, 0.45, 0.42), skin, 0, 0, 0));
  head.add(mesh(box(0.44, 0.18, 0.12), 0x6b4423, 0, -0.17, 0.18)); // beard
  head.add(mesh(sphere(0.06, 0), 0xe0a060, 0, 0, 0.24, false)); // nose
  eyes(head, 0.1, 0.07, 0.2, 0.055);
  // Hat
  const hat = new THREE.Group();
  hat.position.set(0, 0.25, 0);
  if (kind === 'bow') {
    hat.add(mesh(cyl(0.24, 0.26, 0.2, 8), 0x4d5a2e, 0, 0.1, 0));
    hat.add(mesh(cyl(0.4, 0.4, 0.04, 8), 0x4d5a2e, 0, 0.02, 0));
  } else if (kind === 'ebike') {
    hat.add(mesh(sphere(0.28, 1), 0x22d3ee, 0, 0.05, 0)); // helmet
  } else {
    hat.add(mesh(box(0.46, 0.2, 0.46), vest, 0, 0.08, 0));
    hat.add(mesh(box(0.46, 0.04, 0.25), vest, 0, 0.0, 0.3)); // bill
    hat.add(mesh(box(0.06, 0.18, 0.2), 0x6b4423, 0.25, -0.05, 0)); // ear flap
    hat.add(mesh(box(0.06, 0.18, 0.2), 0x6b4423, -0.25, -0.05, 0));
  }
  head.add(hat);

  // Arms + weapon
  const arms = new THREE.Group();
  arms.position.set(0, hipY + 0.8, 0);
  body.add(arms);
  for (const s of [-1, 1]) {
    const a = mesh(box(0.18, 0.18, 0.6), vest, 0.38 * s, 0, 0.25);
    arms.add(a);
  }
  if (kind === 'bow') {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 4, 10, Math.PI), mat(0x7a4a22));
    bow.rotation.z = Math.PI / 2;
    bow.position.set(0, 0, 0.65);
    arms.add(bow);
    arms.add(mesh(box(0.01, 1.1, 0.01), 0xffffff, 0, 0, 0.65, false));
  } else if (kind === 'rifle' || kind === 'shotgun') {
    arms.add(mesh(box(0.1, 0.12, kind === 'rifle' ? 1.3 : 1.0), 0x3a2a1a, 0, 0.05, 0.6));
    arms.add(mesh(cyl(0.035, 0.035, 0.7, 5).rotateX(Math.PI / 2), 0x222222, 0, 0.1, kind === 'rifle' ? 1.3 : 1.1));
    if (kind === 'rifle') arms.add(mesh(cyl(0.05, 0.05, 0.3, 6).rotateX(Math.PI / 2), 0x111111, 0, 0.2, 0.6));
    if (kind === 'shotgun') arms.add(mesh(cyl(0.035, 0.035, 0.7, 5).rotateX(Math.PI / 2), 0x222222, 0.07, 0.1, 1.1));
  } else if (kind === 'ebike') {
    arms.position.set(0, hipY + 0.6, 0.2);
    arms.rotation.x = 0.4;
  }
  return { root, body, legs, hat, height: hipY + 2 };
}

export function buildTree(style: MapDef['treeStyle'], rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const s = 0.8 + rng() * 0.7;
  if (style === 'pine' || style === 'snowpine') {
    g.add(mesh(cyl(0.25, 0.35, 2, 5), 0x6b4423, 0, 1, 0));
    const greens = [0x2f6b3a, 0x3a7d44, 0x285c32];
    for (let i = 0; i < 3; i++) {
      const c = mesh(cone(2.2 - i * 0.55, 2.4, 7), greens[i % 3], 0, 2.3 + i * 1.4, 0);
      g.add(c);
      if (style === 'snowpine') g.add(mesh(cone(1.3 - i * 0.35, 1.0, 7), 0xffffff, 0, 3.1 + i * 1.4, 0));
    }
  } else if (style === 'palm') {
    const lean = (rng() - 0.5) * 0.4;
    for (let i = 0; i < 5; i++) {
      g.add(mesh(cyl(0.22, 0.28, 1.3, 5), 0x8b6b3d, lean * i, 0.65 + i * 1.2, 0));
    }
    const top = new THREE.Group();
    top.position.set(lean * 5, 6.2, 0);
    for (let i = 0; i < 6; i++) {
      const leaf = mesh(box(0.7, 0.08, 3.2), i % 2 ? 0x2e8b3a : 0x3fa34d, 0, 0, 1.4);
      const p = new THREE.Group();
      p.rotation.y = (i / 6) * Math.PI * 2;
      leaf.rotation.x = 0.45;
      p.add(leaf);
      top.add(p);
    }
    top.add(mesh(sphere(0.25, 0), 0x6b4423, 0.2, -0.3, 0.2));
    top.add(mesh(sphere(0.25, 0), 0x6b4423, -0.2, -0.3, 0));
    g.add(top);
  } else {
    // willow / swamp tree
    g.add(mesh(cyl(0.35, 0.6, 3.5, 6), 0x5b4a32, 0, 1.75, 0));
    g.add(mesh(sphere(2.3, 1), 0x6b8a3a, 0, 4.3, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(mesh(box(0.4, 2.2, 0.4), 0x7d9a45, Math.cos(a) * 2, 3.0, Math.sin(a) * 2));
    }
  }
  g.scale.setScalar(s);
  g.rotation.y = rng() * Math.PI * 2;
  g.userData.radius = (style === 'palm' ? 0.35 : 0.5) * s;
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

export function buildHatPickup(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(0.5, 0.22, 0.5), 0xff6a00, 0, 0, 0));
  g.add(mesh(box(0.5, 0.04, 0.28), 0xff6a00, 0, -0.08, 0.32));
  return g;
}

export function buildFence(len: number): THREE.Group {
  const g = new THREE.Group();
  const posts = Math.floor(len / 4);
  for (let i = 0; i <= posts; i++) {
    g.add(mesh(box(0.25, 1.6, 0.25), 0x7a5a3a, -len / 2 + i * 4, 0.8, 0, false));
  }
  g.add(mesh(box(len, 0.15, 0.1), 0x8a6a4a, 0, 1.2, 0, false));
  g.add(mesh(box(len, 0.15, 0.1), 0x8a6a4a, 0, 0.6, 0, false));
  return g;
}

export function buildDecorations(kind: 'stand' | 'truck' | 'sign', rng: () => number): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'stand') {
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) g.add(mesh(box(0.15, 4, 0.15), 0x6b5a45, x, 2, z));
    g.add(mesh(box(2, 0.15, 2), 0x6b5a45, 0, 4, 0));
    g.add(mesh(box(2, 0.6, 0.1), 0x4d5a2e, 0, 4.4, 1));
    g.userData.radius = 1.2;
  } else if (kind === 'truck') {
    g.add(mesh(box(2.2, 1.2, 4.5), rng() > 0.5 ? 0xb03a2e : 0x2e4a7a, 0, 1.1, 0));
    g.add(mesh(box(2.1, 0.9, 1.8), 0x9fc5e8, 0, 2.1, 0.7));
    for (const [x, z] of [[-1.1, 1.4], [1.1, 1.4], [-1.1, -1.4], [1.1, -1.4]]) g.add(mesh(cyl(0.5, 0.5, 0.4, 8).rotateZ(Math.PI / 2), 0x111111, x, 0.5, z));
    g.userData.radius = 2.4;
  } else {
    g.add(mesh(box(0.2, 2, 0.2), 0x6b5a45, 0, 1, 0));
    g.add(mesh(box(2.2, 1, 0.1), 0xf2c94c, 0, 2, 0));
    g.userData.radius = 0.4;
  }
  g.rotation.y = rng() * Math.PI * 2;
  return g;
}

/** Text sprite used for speech bubbles and "!" markers. */
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
