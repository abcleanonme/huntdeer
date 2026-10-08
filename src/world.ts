// Builds a map's scene: terrain, trees, bushes, rocks, the fence with its exit gap, and spawn points.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapDef } from './data';
import { buildBush, buildDecorations, buildExitLandmark, buildLantern, buildLodge, buildRock, buildTree, mat } from './models';

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
  /** Radius that blocks sight, when wider than the solid part (a pine's branches are wider than its trunk). */
  sightR?: number;
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
  trucks: THREE.Vector3[] = [];
  /** Tree stands hunters can climb. The flyer stand (near the trucks) is kept free for the forest secret. */
  stands: { pos: THREE.Vector3; yaw: number; ladder: THREE.Vector3; flyer: boolean }[] = [];
  half: number;
  rng: () => number;
  playerStart = new THREE.Vector3();
  exitPos = new THREE.Vector3();
  exitGroup = new THREE.Group();
  /** Doorway material of the exit landmark: dark until the exit opens. */
  exitGlow = new THREE.MeshBasicMaterial({ color: 0x15181d });
  exitKind: 'gap' | 'cave' | 'temple' | 'beaver' | 'cage' = 'gap';
  /** Where the Trophy King's lodge door is (lodge map only). */
  lodgeDoor = new THREE.Vector3();
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  private hills: { x: number; z: number; r: number; h: number }[] = [];
  private clearings: { x: number; z: number; r: number }[] = [];
  /** Static scenery, merged into a handful of meshes once the map is built. */
  private statics = new THREE.Group();

  constructor(public def: MapDef, seed = 1234) {
    this.rng = mulberry32(seed + def.id.length * 977);
    this.half = def.size / 2;
    const rng = this.rng;

    this.scene.background = new THREE.Color(def.sky);
    this.scene.fog = new THREE.FogExp2(def.fog, def.fogDensity);

    this.hemi = new THREE.HemisphereLight(def.night ? 0x8fa8ff : 0xffffff, def.groundAlt, def.night ? 0.7 : 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(def.night ? 0xb3c6ff : 0xfff2d6, def.night ? 0.9 : 1.8);
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

    if (def.id === 'lodge') {
      // The lodge sits on a flattened clearing; the exit is the Old Moose's cage by the front door.
      this.hills = [];
      this.lodgeDoor.set(0, 0, -this.half + 34);
      this.exitPos.set(0, 0, this.lodgeDoor.z + 8);
      this.clearings.push({ x: 0, z: this.lodgeDoor.z - 2, r: 30 });
      this.exitKind = 'cage';
    } else if (def.exit && def.exit !== 'gap') {
      // A landmark deep in the woods, on the far side from the start.
      this.exitKind = def.exit;
      this.exitPos.set((rng() - 0.5) * def.size * 0.5, 0, -this.half + 24 + rng() * 12);
      this.clearings.push({ x: this.exitPos.x, z: this.exitPos.z - 4, r: 11 });
    }

    if (def.water) {
      for (let i = 0; i < 7; i++) {
        const p = this.randomPoint(15);
        if (p.distanceTo(this.playerStart) < 20 || Math.hypot(p.x - this.exitPos.x, p.z - this.exitPos.z) < 18) continue;
        this.ponds.push({ x: p.x, z: p.z, r: 6 + rng() * 9 });
      }
    }

    this.buildGround();
    this.buildFenceAndExit();
    if (def.id === 'lodge') this.buildLodgeGrounds();
    this.scatter();
    this.scene.add(this.statics);
    this.mergeStatics();
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
      // Standing right under the branches doesn't make the whole tree a wall around you.
      let r = c.sightR ?? c.r;
      if (r > c.r && ((ax - c.x) ** 2 + (az - c.z) ** 2 < r * r || (bx - c.x) ** 2 + (bz - c.z) ** 2 < r * r)) r = c.r;
      if (px * px + pz * pz < r * r) return false;
    }
    return true;
  }

  /** How many bushes the line from a to b passes through (not counting one standing right at a). */
  bushesBetween(ax: number, az: number, bx: number, bz: number) {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 0.01) return 0;
    let n = 0;
    for (const b of this.bushes) {
      if ((ax - b.x) ** 2 + (az - b.z) ** 2 < b.r * b.r) continue;
      const t = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.z - az) * dz) / len2));
      const px = ax + dx * t - b.x;
      const pz = az + dz * t - b.z;
      if (px * px + pz * pz < b.r * b.r * 0.8) n++;
    }
    return n;
  }

  /** True if a point (at a given height) is inside something solid enough to stop an arrow. */
  solidAt(x: number, y: number, z: number) {
    for (const c of this.colliders) {
      if (!c.blocksSight) continue;
      const r = y - this.height(c.x, c.z) < 7 ? (c.sightR ?? c.r) * 0.85 : c.r;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < r * r) return true;
    }
    return false;
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
    const nearExit = allowExit && this.exitKind === 'gap' && Math.abs(pos.x - this.exitPos.x) < 4;
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
      for (let i = 0; i < 6; i++) {
        const a = this.rng() * Math.PI * 2;
        const r = this.rng() * p.r * 0.7;
        const pad = new THREE.Mesh(new THREE.CircleGeometry(0.6, 6).rotateX(-Math.PI / 2), mat(0x4caf50));
        pad.position.set(p.x + Math.cos(a) * r, water.position.y + 0.02, p.z + Math.sin(a) * r);
        this.statics.add(pad);
      }
    }
  }

  /** A fence from a to b whose posts sit on the terrain and whose rails follow it between posts. */
  private fenceLine(ax: number, az: number, bx: number, bz: number) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) return;
    const n = Math.max(1, Math.round(len / 4));
    const post = new THREE.BoxGeometry(0.25, 1.6, 0.25);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      pts.push(new THREE.Vector3(x, this.height(x, z), z));
    }
    for (const p of pts) {
      const m = new THREE.Mesh(post, mat(0x7a5a3a));
      m.position.set(p.x, p.y + 0.7, p.z);
      this.statics.add(m);
    }
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const seg = a.distanceTo(b);
      for (const y of [0.55, 1.15]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, seg + 0.1), mat(0x8a6a4a));
        rail.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + y, (a.z + b.z) / 2);
        rail.lookAt(b.x, b.y + y, b.z);
        this.statics.add(rail);
      }
    }
  }

  private buildFenceAndExit() {
    const { half } = this;
    const gap = 8;
    const ex = this.exitPos.x;
    this.fenceLine(-half, half, half, half);
    this.fenceLine(half, -half, half, half);
    this.fenceLine(-half, -half, -half, half);
    if (this.exitKind !== 'gap') {
      this.fenceLine(-half, -half, half, -half);
    } else {
      this.fenceLine(-half, -half, ex - gap / 2, -half);
      this.fenceLine(ex + gap / 2, -half, half, -half);
    }

    // Exit marker: a glowing ring + beam (plus a cave in the arctic).
    const eg = this.exitGroup;
    eg.position.set(ex, this.height(ex, this.exitPos.z), this.exitKind === 'gap' ? -half : this.exitPos.z);
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
    const k = this.exitKind;
    if (k === 'cave' || k === 'temple' || k === 'beaver') {
      const lm = buildExitLandmark(k, this.exitGlow, this.rng);
      const e = this.exitPos;
      // The doorway sits just behind the exit point, so walking up to it counts.
      lm.position.set(e.x, this.height(e.x, e.z - 1.5) - 0.1, e.z - 1.5);
      this.statics.add(lm);
      for (const c of lm.userData.colliders as { x: number; z: number; r: number }[]) {
        this.colliders.push({ x: e.x + c.x, z: e.z - 1.5 + c.z, r: c.r, blocksSight: true });
      }
    }
    eg.visible = false;
    this.scene.add(eg);
  }

  /** Light up the exit: show the beacon and make the doorway glow. */
  openExit() {
    this.exitGroup.visible = true;
    this.exitGlow.color.set(0xffd27a);
  }

  private buildLodgeGrounds() {
    const door = this.lodgeDoor;
    const lodge = buildLodge();
    const fp = lodge.userData.footprint as { w: number; d: number };
    lodge.position.set(0, this.height(0, door.z - fp.d / 2), door.z - fp.d / 2);
    this.statics.add(lodge);
    // Approximate the cabin walls with a row of circles for collisions and sight.
    for (let x = -fp.w / 2; x <= fp.w / 2; x += 2.5) {
      for (const z of [door.z - fp.d, door.z]) this.colliders.push({ x, z, r: 1.4, blocksSight: true });
    }
    for (let z = door.z - fp.d; z <= door.z; z += 2.5) {
      for (const x of [-fp.w / 2, fp.w / 2]) this.colliders.push({ x, z, r: 1.4, blocksSight: true });
    }
    for (let x = -fp.w / 2 + 2; x < fp.w / 2; x += 3) {
      for (let z = door.z - fp.d + 2; z < door.z; z += 3) this.colliders.push({ x, z, r: 1.6, blocksSight: true });
    }
    // Lanterns along the drive and two warm lights by the door.
    for (let z = door.z + 6; z < this.half - 10; z += 14) {
      for (const x of [-7, 7]) {
        const l = buildLantern();
        l.position.set(x, this.height(x, z), z);
        this.statics.add(l);
        this.colliders.push({ x, z, r: 0.4, blocksSight: false });
      }
    }
    for (const x of [-9, 9]) {
      const light = new THREE.PointLight(0xffb74d, 30, 30, 1.6);
      light.position.set(x, 5, door.z + 3);
      this.scene.add(light);
    }
    // Moonlight on the courtyard.
    const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 8), new THREE.MeshBasicMaterial({ color: 0xfff8e1, fog: false }));
    moon.position.set(-60, 70, -150);
    this.scene.add(moon);
  }

  private scatter() {
    const { def, rng } = this;
    const start = this.playerStart;
    const isClear = (x: number, z: number, r: number) =>
      Math.hypot(x - start.x, z - start.z) > 7 &&
      Math.hypot(x - this.exitPos.x, z - this.exitPos.z) > 7 &&
      !this.inWater(x, z) &&
      !this.clearings.some((c) => Math.hypot(x - c.x, z - c.z) < c.r) &&
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
      this.statics.add(t);
      this.colliders.push({ x, z, r, blocksSight: true, sightR: t.userData.sightR as number });
    }
    const bushColor = def.treeStyle === 'palm' ? 0x2f8f3a : def.snow ? 0x4f7a5a : 0x4a8f3a;
    for (let i = 0; i < def.bushes; i++) {
      const p = this.randomPoint(5);
      // Bushes are allowed in the lodge courtyard: you need somewhere to hide from the King.
      const inClearing = this.clearings.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r);
      if (!inClearing && !isClear(p.x, p.z, 1)) continue;
      if (inClearing && this.colliders.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r + 2)) continue;
      const b = buildBush(bushColor, rng, def.snow);
      b.position.set(p.x, this.height(p.x, p.z) - 0.2, p.z);
      this.statics.add(b);
      this.bushes.push({ x: p.x, z: p.z, r: 1.7 });
    }
    for (let i = 0; i < def.rocks; i++) {
      const p = this.randomPoint(5);
      const rock = buildRock(rng, def.snow);
      const r = rock.userData.radius as number;
      if (!isClear(p.x, p.z, r)) continue;
      rock.position.set(p.x, this.height(p.x, p.z), p.z);
      this.statics.add(rock);
      this.colliders.push({ x: p.x, z: p.z, r, blocksSight: r > 1.2 });
    }
    // Hunting decor: tree stands and trucks. Trucks are where scared hunters run home to.
    const truckSpots = [
      new THREE.Vector3(-this.half + 9, 0, (rng() - 0.5) * this.half),
      new THREE.Vector3(this.half - 9, 0, (rng() - 0.5) * this.half),
      new THREE.Vector3((rng() - 0.5) * this.half, 0, -this.half + 9),
    ];
    for (const p of truckSpots) {
      const d = buildDecorations('truck', rng);
      d.position.set(p.x, this.height(p.x, p.z), p.z);
      // Parked roughly facing into the woods.
      d.rotation.y = Math.atan2(-p.x, -p.z) + (rng() - 0.5) * 0.8;
      this.statics.add(d);
      this.colliders.push({ x: p.x, z: p.z, r: 2.6, blocksSight: true });
      this.trucks.push(p.clone().setY(this.height(p.x, p.z)));
    }
    const addStand = (p: THREE.Vector3, yaw: number, flyer: boolean) => {
      const d = buildDecorations('stand', rng);
      d.position.set(p.x, this.height(p.x, p.z), p.z);
      d.rotation.y = yaw;
      this.statics.add(d);
      this.colliders.push({ x: p.x, z: p.z, r: d.userData.radius as number, blocksSight: false });
      const ladder = new THREE.Vector3(p.x + Math.sin(yaw) * 2.3, 0, p.z + Math.cos(yaw) * 2.3);
      ladder.y = this.height(ladder.x, ladder.z);
      this.stands.push({ pos: p.clone().setY(this.height(p.x, p.z)), yaw, ladder, flyer });
    };
    // One stand next to the first truck: that's where hunters pin their flyers.
    if (this.trucks.length) {
      const t = this.trucks[0];
      const inward = new THREE.Vector3(-t.x, 0, -t.z).normalize();
      for (let k = 0; k < 8; k++) {
        const side = new THREE.Vector3(-inward.z, 0, inward.x).multiplyScalar(k % 2 ? 6 : -6);
        const p = t.clone().addScaledVector(inward, 5 + k).add(side);
        if (!isClear(p.x, p.z, 2.6)) continue;
        addStand(p, Math.atan2(inward.x, inward.z), true);
        break;
      }
    }
    for (let i = 0; i < 4; i++) {
      const p = this.randomPoint(12);
      if (!isClear(p.x, p.z, 2.8)) continue;
      addStand(p, rng() * Math.PI * 2, false);
    }
  }

  /**
   * Merge all static scenery into one mesh per material. A map has thousands of little meshes;
   * this brings it down to a few dozen draw calls, which matters a lot on phones.
   */
  private mergeStatics() {
    this.statics.updateMatrixWorld(true);
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const keep: THREE.Object3D[] = [];
    this.statics.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = o.material as THREE.Material;
      if (m.transparent || m instanceof THREE.MeshBasicMaterial) {
        keep.push(o);
        return;
      }
      let g = (o.geometry as THREE.BufferGeometry).clone();
      if (g.index) g = g.toNonIndexed();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
      g.applyMatrix4(o.matrixWorld);
      const list = buckets.get(m) ?? [];
      list.push(g);
      buckets.set(m, list);
    });
    // Unlit pieces (lit windows, lanterns) keep their own meshes, reparented with world transforms.
    for (const o of keep) {
      o.updateMatrixWorld(true);
      const clone = o.clone();
      o.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
      this.scene.add(clone);
    }
    this.scene.remove(this.statics);
    for (const [m, geos] of buckets) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      geos.forEach((g) => g.dispose());
    }
    this.statics = new THREE.Group();
  }
}
