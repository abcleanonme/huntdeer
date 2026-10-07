// Builds a map's scene: terrain, trees, bushes, rocks, the fence with its exit gap, and spawn points.
import * as THREE from 'three';
import type { MapDef } from './data';
import { buildBush, buildDecorations, buildFence, buildRock, buildTree, mat } from './models';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Collider {
  x: number;
  z: number;
  r: number;
  /** Blocks line of sight (trees, rocks). */
  blocksSight: boolean;
}

export interface Pond {
  x: number;
  z: number;
  r: number;
}

export class World {
  scene = new THREE.Scene();
  colliders: Collider[] = [];
  bushes: { x: number; z: number; r: number }[] = [];
  ponds: Pond[] = [];
  half: number;
  rng: () => number;
  playerStart = new THREE.Vector3();
  exitPos = new THREE.Vector3();
  exitGroup = new THREE.Group();
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  private hills: { x: number; z: number; r: number; h: number }[] = [];

  constructor(public def: MapDef, seed = 1234) {
    this.rng = mulberry32(seed + def.id.length * 977);
    this.half = def.size / 2;
    const rng = this.rng;

    this.scene.background = new THREE.Color(def.sky);
    this.scene.fog = new THREE.FogExp2(def.fog, def.fogDensity);

    this.hemi = new THREE.HemisphereLight(0xffffff, def.groundAlt, 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.8);
    this.sun.position.set(30, 50, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -35;
    sc.right = 35;
    sc.top = 35;
    sc.bottom = -35;
    sc.near = 1;
    sc.far = 140;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);

    for (let i = 0; i < def.hills; i++) {
      this.hills.push({
        x: (rng() - 0.5) * def.size * 0.8,
        z: (rng() - 0.5) * def.size * 0.8,
        r: 18 + rng() * 22,
        h: 3 + rng() * 5,
      });
    }

    // Player starts near the south edge; the exit is on the north edge.
    this.playerStart.set(0, 0, this.half - 12);
    this.exitPos.set((rng() - 0.5) * def.size * 0.5, 0, -this.half + 2);

    if (def.water) {
      for (let i = 0; i < 7; i++) {
        const p = this.randomPoint(15);
        if (p.distanceTo(this.playerStart) < 20) continue;
        this.ponds.push({ x: p.x, z: p.z, r: 6 + rng() * 9 });
      }
    }

    this.buildGround();
    this.buildFenceAndExit();
    this.scatter();
  }

  height(x: number, z: number): number {
    let h = Math.sin(x * 0.08) * 0.4 + Math.cos(z * 0.07) * 0.4;
    for (const hl of this.hills) {
      const d2 = (x - hl.x) ** 2 + (z - hl.z) ** 2;
      h += hl.h * Math.exp(-d2 / (hl.r * hl.r));
    }
    for (const p of this.ponds) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r) h -= (1 - d / p.r) * 1.2;
    }
    return h;
  }

  inWater(x: number, z: number) {
    return this.ponds.some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 0.85);
  }

  inBush(x: number, z: number) {
    return this.bushes.some((b) => (x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r);
  }

  randomPoint(margin = 8) {
    const s = this.def.size - margin * 2;
    return new THREE.Vector3((this.rng() - 0.5) * s, 0, (this.rng() - 0.5) * s);
  }

  /** A random point not inside any collider. */
  freePoint(margin = 8, avoid?: THREE.Vector3, avoidDist = 0) {
    for (let i = 0; i < 60; i++) {
      const p = this.randomPoint(margin);
      if (avoid && p.distanceTo(avoid) < avoidDist) continue;
      if (this.colliders.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r + 1.2)) continue;
      if (this.inWater(p.x, p.z)) continue;
      p.y = this.height(p.x, p.z);
      return p;
    }
    const p = this.randomPoint(margin);
    p.y = this.height(p.x, p.z);
    return p;
  }

  /** True if nothing that blocks sight sits between a and b. Bushes count as partial cover elsewhere. */
  lineOfSight(ax: number, az: number, bx: number, bz: number) {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 0.01) return true;
    for (const c of this.colliders) {
      if (!c.blocksSight) continue;
      let t = ((c.x - ax) * dx + (c.z - az) * dz) / len2;
      if (t <= 0.02 || t >= 0.98) continue;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t - c.x;
      const pz = az + dz * t - c.z;
      if (px * px + pz * pz < c.r * c.r) return false;
    }
    return true;
  }

  /** Push a circle out of colliders and keep it inside the fence. */
  resolve(pos: THREE.Vector3, radius: number, allowExit = false) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
    const lim = this.half - 1.5;
    const nearExit = allowExit && Math.abs(pos.x - this.exitPos.x) < 4;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.min(lim, pos.z);
    if (!nearExit) pos.z = Math.max(-lim, pos.z);
    else pos.z = Math.max(-this.half - 6, pos.z);
  }

  private buildGround() {
    const { def } = this;
    const size = def.size + 80;
    const seg = 90;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors: number[] = [];
    const c1 = new THREE.Color(def.ground);
    const c2 = new THREE.Color(def.groundAlt);
    const mud = new THREE.Color(0x4a4a2a);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.height(x, z));
      const n = (Math.sin(x * 0.15) * Math.cos(z * 0.13) + Math.sin((x + z) * 0.05)) * 0.5 + 0.5;
      tmp.copy(c1).lerp(c2, n * 0.8 + this.rng() * 0.2);
      if (def.water && this.inWater(x, z)) tmp.lerp(mud, 0.6);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    ground.receiveShadow = true;
    this.scene.add(ground);

    for (const p of this.ponds) {
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(p.r, 20).rotateX(-Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0x3d7a8c, transparent: true, opacity: 0.8 }),
      );
      water.position.set(p.x, this.height(p.x, p.z) + 0.85, p.z);
      water.receiveShadow = true;
      this.scene.add(water);
      // Lily pads and cattails
      for (let i = 0; i < 6; i++) {
        const a = this.rng() * Math.PI * 2;
        const r = this.rng() * p.r * 0.7;
        const pad = new THREE.Mesh(new THREE.CircleGeometry(0.6, 6).rotateX(-Math.PI / 2), mat(0x4caf50));
        pad.position.set(p.x + Math.cos(a) * r, water.position.y + 0.02, p.z + Math.sin(a) * r);
        this.scene.add(pad);
      }
    }
  }

  private buildFenceAndExit() {
    const { def, half } = this;
    const gap = 8;
    const ex = this.exitPos.x;
    const sides: [number, number, number, number][] = [
      [0, half, def.size, 0],
      [half, 0, def.size, Math.PI / 2],
      [-half, 0, def.size, Math.PI / 2],
    ];
    for (const [x, z, len, rot] of sides) {
      const f = buildFence(len);
      f.position.set(x, this.height(x, z), z);
      f.rotation.y = rot;
      this.scene.add(f);
    }
    // North side, split around the exit gap.
    const leftLen = ex - gap / 2 + half;
    const rightLen = half - (ex + gap / 2);
    const lf = buildFence(leftLen);
    lf.position.set(-half + leftLen / 2, this.height(-half + leftLen / 2, -half), -half);
    const rf = buildFence(rightLen);
    rf.position.set(half - rightLen / 2, this.height(half - rightLen / 2, -half), -half);
    this.scene.add(lf, rf);

    // Exit marker: a glowing ring + sign (or a cave in the arctic).
    const eg = this.exitGroup;
    eg.position.set(ex, this.height(ex, -half), -half);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.25, 6, 20).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff35c, transparent: true, opacity: 0.85 }),
    );
    ring.position.y = 0.3;
    eg.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff35c, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 20;
    eg.add(beam);
    if (def.snow) {
      const cave = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const a = (i / 6) * Math.PI;
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 0), mat(0x9aa7b4));
        r.position.set(Math.cos(a) * 4.5, Math.sin(a) * 4, -3);
        cave.add(r);
      }
      const dark = new THREE.Mesh(new THREE.CircleGeometry(3.6, 12, 0, Math.PI), mat(0x1a1f26));
      dark.position.set(0, 0, -3.5);
      cave.add(dark);
      eg.add(cave);
    }
    eg.visible = false;
    this.scene.add(eg);
  }

  private scatter() {
    const { def, rng } = this;
    const start = this.playerStart;
    const isClear = (x: number, z: number, r: number) =>
      Math.hypot(x - start.x, z - start.z) > 7 &&
      Math.hypot(x - this.exitPos.x, z - this.exitPos.z) > 7 &&
      !this.inWater(x, z) &&
      !this.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + r + 0.5);

    // Trees cluster a bit for a nicer look and better hiding spots.
    const clusters = Array.from({ length: 12 }, () => this.randomPoint(10));
    for (let i = 0; i < def.trees; i++) {
      let x: number;
      let z: number;
      if (rng() < 0.6) {
        const c = clusters[i % clusters.length];
        x = c.x + (rng() - 0.5) * 30;
        z = c.z + (rng() - 0.5) * 30;
      } else {
        const p = this.randomPoint(4);
        x = p.x;
        z = p.z;
      }
      if (Math.abs(x) > this.half - 3 || Math.abs(z) > this.half - 3) continue;
      const t = buildTree(def.treeStyle, rng);
      const r = t.userData.radius as number;
      if (!isClear(x, z, r + 0.6)) continue;
      t.position.set(x, this.height(x, z) - 0.1, z);
      this.scene.add(t);
      this.colliders.push({ x, z, r, blocksSight: true });
    }
    const bushColor = def.treeStyle === 'palm' ? 0x2f8f3a : def.snow ? 0x4f7a5a : 0x4a8f3a;
    for (let i = 0; i < def.bushes; i++) {
      const p = this.randomPoint(5);
      if (!isClear(p.x, p.z, 1)) continue;
      const b = buildBush(bushColor, rng, def.snow);
      b.position.set(p.x, this.height(p.x, p.z) - 0.2, p.z);
      this.scene.add(b);
      this.bushes.push({ x: p.x, z: p.z, r: 1.7 });
    }
    for (let i = 0; i < def.rocks; i++) {
      const p = this.randomPoint(5);
      const rock = buildRock(rng, def.snow);
      const r = rock.userData.radius as number;
      if (!isClear(p.x, p.z, r)) continue;
      rock.position.set(p.x, this.height(p.x, p.z), p.z);
      this.scene.add(rock);
      this.colliders.push({ x: p.x, z: p.z, r, blocksSight: r > 1.2 });
    }
    // Hunting decor: tree stands, trucks, a sign at the start.
    for (const kind of ['stand', 'stand', 'stand', 'truck', 'truck'] as const) {
      const p = this.randomPoint(10);
      const d = buildDecorations(kind, rng);
      const r = d.userData.radius as number;
      if (!isClear(p.x, p.z, r)) continue;
      d.position.set(p.x, this.height(p.x, p.z), p.z);
      this.scene.add(d);
      this.colliders.push({ x: p.x, z: p.z, r, blocksSight: kind === 'truck' });
    }
  }
}
