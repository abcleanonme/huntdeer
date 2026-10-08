// One round of play: the player animal, the hunters, objectives, secrets, abilities and the camera.
import * as THREE from 'three';
import {
  BOOP_QUIPS, CRITTER_HIT_QUIPS, HIT_QUIPS, HUNTERS, LOST_QUIPS, MISS_QUIPS, SCARED_QUIPS, SLEEP_QUIPS, SPOT_QUIPS, STINK_QUIPS,
  type AnimalDef, type HunterKind, type MapDef, type MapId, type ObjectiveType, type SecretDef, type SecretItem,
} from './data';
import { sfx } from './audio';
import { Hud, type ObjectiveView, type Ping } from './hud';
import { Hunter, PERSONALITY_LABEL, rollIdentity, trophyScore } from './hunters';
import { Input } from './input';
import {
  buildAnimal, buildDecoyCrate, buildFood, buildHatPickup, buildObjectiveItem, buildLunch, buildSecretItem, buildTrap, buildVestPickup, mat, CRATE_HEIGHT, STAND_HEIGHT, textSprite, wearDisguise, type Rig,
} from './models';
import { haptic } from './native';
import type { HatEntry } from './save';
import { World } from './world';

export type GameEvent =
  | { type: 'boop'; kind: HunterKind; asleep: boolean }
  | { type: 'hat'; entry: HatEntry }
  | { type: 'trap' }
  | { type: 'drone' }
  | { type: 'scared' }
  | { type: 'timber' }
  | { type: 'orange' }
  | { type: 'roar'; count: number }
  | { type: 'stink'; count: number }
  | { type: 'secretFound'; map: MapId }
  | { type: 'secretDone'; map: MapId };

export interface GameResult {
  win: boolean;
  time: number;
  hitsTaken: number;
  stars: boolean[];
  killer?: string;
  killerKind?: HunterKind;
  hats: HatEntry[];
  secretDone: boolean;
  kingDefeated: boolean;
}

export interface GameOptions {
  onEnd: (r: GameResult) => void;
  onPause: () => void;
  onEvent: (e: GameEvent) => void;
  /** Menu-backdrop mode: no input, nobody notices the player, nothing ends. */
  demo?: boolean;
  /** Spawn this map's secret (false once it has been solved). */
  secret?: boolean;
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const critterNoun = (id: AnimalDef['id']) => ({ deer: 'deer', rabbit: 'rabbit', skunk: 'skunk', bear: 'bear', duck: 'duck', moose: 'moose' })[id];
const UP = new THREE.Vector3(0, 1, 0);
/** Seconds a hunter's orange disguise lasts. */
const ORANGE_TIME = 22;

interface Fx {
  obj: THREE.Object3D;
  life: number;
  max: number;
  update?: (fx: Fx, dt: number) => void;
  vel?: THREE.Vector3;
}

interface Player {
  rig: Rig;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  onGround: boolean;
  hearts: number;
  invuln: number;
  abilityCd: number;
  abilityT: number;
  flying: boolean;
  speed: number;
  moving: boolean;
  sprinting: boolean;
  radius: number;
  phase: number;
  stamina: number;
  winded: boolean;
  snareT: number;
  /** Holding a hunter's orange (max one), and seconds left wearing it. */
  orangeHeld: boolean;
  orangeT: number;
  disguise: THREE.Object3D[];
}

interface Pickup {
  obj: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  kind: 'lunch' | 'orange';
}

interface Stand {
  pos: THREE.Vector3;
  yaw: number;
  ladder: THREE.Vector3;
  hunter: Hunter | null;
  lunch: THREE.Group | null;
}

interface HatPickup {
  obj: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  entry: HatEntry | null;
}

interface Trap {
  obj: THREE.Group;
  pos: THREE.Vector3;
  owner: Hunter;
  sprung: number;
  tag: THREE.Sprite;
}

interface SecretProp {
  obj: THREE.Group;
  pos: THREE.Vector3;
  item: SecretItem;
  sabotage: boolean;
  done: boolean;
}

interface SecretState {
  def: SecretDef;
  found: boolean;
  step: number;
  progress: number;
  props: SecretProp[];
  done: boolean;
}

export class Game {
  camera: THREE.PerspectiveCamera;
  world: World;
  hud: Hud;
  player: Player;
  hunters: Hunter[] = [];
  foods: { obj: THREE.Object3D; pos: THREE.Vector3; eaten: boolean }[] = [];
  babies: { rig: Rig; pos: THREE.Vector3; following: boolean; yaw: number; phase: number }[] = [];
  arrows: { mesh: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; life: number; owner: Hunter; stuck: boolean }[] = [];
  clouds: { pos: THREE.Vector3; r: number; life: number; obj: THREE.Group; hits: number }[] = [];
  hatsOnGround: HatPickup[] = [];
  pickups: Pickup[] = [];
  collectibles: { obj: THREE.Group; pos: THREE.Vector3; item: 'egg' | 'nest'; done: boolean }[] = [];
  stands: Stand[] = [];
  traps: Trap[] = [];
  fx: Fx[] = [];
  secret: SecretState | null = null;
  progress: Record<ObjectiveType, number> = { eat: 0, boop: 0, survive: 0, exit: 0, rescue: 0, boss: 0, collect: 0 };
  runHats: HatEntry[] = [];
  time = 0;
  hitsTaken = 0;
  camYaw = 0;
  camPitch = 0.38;
  camDist: number;
  shake = 0;
  paused = false;
  ended = false;
  exitOpen = false;
  kingDefeated = false;
  private skyBase: THREE.Color;
  private camTarget = new THREE.Vector3();
  private demo: boolean;
  private mooseCage: THREE.Group | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private input: Input,
    public map: MapDef,
    public animal: AnimalDef,
    hudParent: HTMLElement,
    private opts: GameOptions,
  ) {
    this.demo = !!opts.demo;
    Hunter.critter = critterNoun(animal.id);
    this.world = new World(map, 1000 + Math.floor(Math.random() * 100000));
    const scene = this.world.scene;
    this.skyBase = new THREE.Color(map.sky);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 260);

    const rig = buildAnimal(animal.id, animal.color, animal.accent);
    scene.add(rig.root);
    const start = this.world.playerStart.clone();
    start.y = this.world.height(start.x, start.z);
    this.player = {
      rig,
      pos: start,
      vel: new THREE.Vector3(),
      yaw: Math.PI,
      onGround: true,
      hearts: animal.hearts,
      invuln: 0,
      abilityCd: 0,
      abilityT: 0,
      flying: false,
      speed: 0,
      moving: false,
      sprinting: false,
      radius: animal.id === 'bear' || animal.id === 'moose' ? 1.0 : animal.id === 'deer' ? 0.7 : 0.45,
      phase: 0,
      stamina: 1,
      winded: false,
      snareT: 0,
      orangeHeld: false,
      orangeT: 0,
      disguise: [],
    };
    this.camDist = animal.id === 'bear' || animal.id === 'moose' ? 10 : animal.id === 'deer' ? 8 : 6.5;

    this.hud = new Hud(hudParent, animal, input.isTouch, {
      ability: () => input.tap('KeyE'),
      orange: () => input.tap('KeyR'),
      boop: () => input.tap('KeyF'),
      jump: () => input.tap('Space'),
      pause: () => this.opts.onPause(),
    });

    this.spawnHunters();
    this.spawnObjectives();
    if (!this.demo && opts.secret && map.secret) this.spawnSecretTrigger(map.secret);
    this.onResize();
    if (!this.demo) {
      this.hud.toast(`${map.name}: ${map.objectives.map((o) => (o.type === 'eat' ? `eat ${this.map.food.name}` : o.label.toLowerCase())).join(', then ')}`, 'info');
      if (this.hunters.some((h) => h.idn.look.golden)) this.hud.toast('Rumor has it a Golden Vest hunter is out here today.', 'secret');
    }
  }

  // --- Spawning ---------------------------------------------------------

  private spawnHunter(kind: HunterKind, pos: THREE.Vector3, allowGolden: boolean) {
    const h = new Hunter(rollIdentity(kind, allowGolden), pos, this.world.scene);
    h.target = this.world.freePoint(8);
    if (!h.stationary && kind !== 'king') this.world.resolve(h.pos, 0.5);
    this.hunters.push(h);
    return h;
  }

  private spawnHunters() {
    const start = this.world.playerStart;
    let goldenLeft = this.demo ? 0 : 1;
    for (const [kind, count] of Object.entries(this.map.hunters) as [HunterKind, number][]) {
      for (let i = 0; i < count; i++) {
        let p: THREE.Vector3;
        if (kind === 'king') {
          p = this.world.lodgeDoor.clone().add(new THREE.Vector3(0, 0, 4));
        } else if (kind === 'drone') {
          // Drone pilots set up their lawn chair next to a truck.
          const t = pick(this.world.trucks);
          p = t.clone().add(new THREE.Vector3(t.x > 0 ? -4 : 4, 0, 3));
        } else {
          p = this.world.freePoint(10, start, 45);
        }
        p.y = this.world.height(p.x, p.z);
        const h = this.spawnHunter(kind, p, goldenLeft > 0);
        if (h.idn.look.golden) goldenLeft--;
        if (h.stationary) h.yaw = h.baseYaw = Math.atan2(start.x - p.x, start.z - p.z) + (Math.random() - 0.5);
        if (kind === 'king') h.target = this.kingPatrolPoint();
      }
    }
    this.assignStands();
  }

  /** Some hunters head up into tree stands. Half of them packed a lunch, which sits on the platform. */
  private assignStands() {
    const eligible: HunterKind[] = ['rifle', 'bow', 'shotgun', 'drunk'];
    for (const ws of this.world.stands) {
      const st: Stand = { pos: ws.pos, yaw: ws.yaw, ladder: ws.ladder, hunter: null, lunch: null };
      this.stands.push(st);
      if (ws.flyer || Math.random() > 0.7) continue;
      let best: Hunter | null = null;
      let bd = Infinity;
      for (const h of this.hunters) {
        if (!eligible.includes(h.kind) || h.standIdx >= 0) continue;
        const d = h.pos.distanceTo(ws.pos);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      if (!best) continue;
      st.hunter = best;
      best.standIdx = this.stands.length - 1;
      if (Math.random() < 0.6) this.perch(best, st);
      else best.standPhase = 'walk';
      if (Math.random() < 0.5) {
        const lunch = buildLunch();
        const off = new THREE.Vector3(0.55, STAND_HEIGHT + 0.08, -0.45).applyAxisAngle(UP, st.yaw);
        lunch.position.copy(st.pos).add(off);
        lunch.rotation.y = st.yaw;
        this.world.scene.add(lunch);
        st.lunch = lunch;
      }
    }
  }

  private perch(h: Hunter, st: Stand) {
    h.standPhase = 'up';
    h.elev = STAND_HEIGHT + 0.08;
    h.pos.set(st.pos.x, st.pos.y, st.pos.z);
    h.yaw = h.baseYaw = st.yaw;
    h.sleepT = 12 + Math.random() * 14;
  }

  /** Climbing the ladder, or falling off the stand. Handles the hunter's pose itself. */
  private updateStandMove(h: Hunter, dt: number) {
    const st = this.stands[h.standIdx];
    if (h.standPhase === 'climb') {
      h.elev += dt * 1.4;
      const t = Math.min(1, h.elev / STAND_HEIGHT);
      h.pos.x = st.ladder.x + (st.pos.x - st.ladder.x) * t * t;
      h.pos.z = st.ladder.z + (st.pos.z - st.ladder.z) * t * t;
      h.yaw = st.yaw + Math.PI;
      h.phase += dt * 6;
      h.rig.legs.forEach((l, i) => (l.rotation.x = Math.sin(h.phase + i * Math.PI) * 0.7));
      if (h.elev >= STAND_HEIGHT + 0.08) {
        this.perch(h, st);
        h.say(pick(['Ahh. Home sweet home.', 'Nobody ever looks up.', 'Best seat in the woods.']));
      }
    } else {
      // Falling: tumble outward and land flat.
      h.fallV -= 16 * dt;
      h.elev += h.fallV * dt;
      const out = new THREE.Vector3(Math.sin(st.yaw + Math.PI), 0, Math.cos(st.yaw + Math.PI));
      h.pos.addScaledVector(out, dt * 1.8);
      h.rig.body.rotation.x = Math.min(Math.PI / 2, h.rig.body.rotation.x + dt * 5);
      h.rig.body.rotation.z = Math.sin(this.time * 25) * 0.2;
      h.rig.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.time * 30 + i) * 1.1));
      if (h.elev <= 0) {
        h.elev = 0;
        h.standPhase = 'none';
        h.rig.body.rotation.x = 0;
        this.world.resolve(h.pos, 0.5);
        this.shake = 0.5;
        sfx.hit();
        haptic('heavy');
        this.burst(h.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x8d6e63, 12);
        h.state = h.fallFrom;
        this.knockDown(h, 6, 'boop');
        this.opts.onEvent({ type: 'timber' });
      }
    }
    h.laser.visible = false;
    h.setMarker('');
    h.pos.y = this.world.height(h.pos.x, h.pos.z) + h.elev;
    h.rig.root.position.copy(h.pos);
    h.rig.root.rotation.y = h.yaw;
  }

  /** Boop the stand's legs: the hunter up top comes down the fast way. */
  private knockStand(st: Stand) {
    const h = st.hunter;
    if (!h || h.standPhase !== 'up') return;
    h.fallFrom = h.state === 'sleep' ? 'sleep' : 'patrol';
    h.state = 'patrol';
    h.standPhase = 'fall';
    h.fallV = 3;
    h.aim = 0;
    h.say(pick(['WHOA WHOA WHOA', 'TIMBERRR!', 'Not the stand! NOT THE STAND!']), 1.6);
    sfx.boop();
    haptic('light');
    this.shake = 0.25;
    if (st.lunch) {
      const world = st.lunch.position.clone();
      const obj = st.lunch;
      st.lunch = null;
      const away = new THREE.Vector3(Math.sin(st.yaw + Math.PI), 0, Math.cos(st.yaw + Math.PI)).multiplyScalar(2);
      this.pickups.push({ obj, pos: world, vel: new THREE.Vector3(away.x, 3, away.z), age: 0, kind: 'lunch' });
      this.hud.toast('Their lunch is falling too!', 'good');
    }
  }

  private dropOrange(at: THREE.Vector3) {
    const obj = buildVestPickup();
    const pos = at.clone().add(new THREE.Vector3(0, 1.2, 0));
    obj.position.copy(pos);
    this.world.scene.add(obj);
    const away = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(2);
    this.pickups.push({ obj, pos, vel: new THREE.Vector3(away.x, 6, away.z), age: 0, kind: 'orange' });
    this.hud.toast('They dropped their blaze orange! Grab it.', 'good');
  }

  private wearOrange() {
    const p = this.player;
    if (!p.orangeHeld || p.orangeT > 0) return;
    p.orangeHeld = false;
    p.orangeT = ORANGE_TIME;
    p.disguise = wearDisguise(p.rig);
    sfx.rescue();
    haptic('success');
    this.hud.toast('You put on the orange. Legally, you are now a hunter.', 'good');
    this.opts.onEvent({ type: 'orange' });
    for (const h of this.hunters) {
      if (h.state === 'alert' || h.state === 'search' || h.state === 'curious') {
        h.state = 'patrol';
        h.suspicion = 0;
        h.aim = 0;
        if (h.pos.distanceTo(p.pos) < 40) h.say(pick(['Huh. Must\'ve been another hunter.', `Oh! Sorry, buddy. Thought you were a ${critterNoun(this.animal.id)}.`, 'Nice vest.']));
      }
    }
  }

  private kingPatrolPoint() {
    const c = this.world.exitPos;
    const a = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 14;
    const p = new THREE.Vector3(c.x + Math.cos(a) * r, 0, c.z + 4 + Math.abs(Math.sin(a)) * r);
    this.world.resolve(p, 1);
    return p;
  }

  private spawnObjectives() {
    const start = this.world.playerStart;
    for (const o of this.map.objectives) {
      if (o.type === 'eat') {
        for (let i = 0; i < o.count + 4; i++) {
          const p = this.world.freePoint(8, start, 15);
          const f = buildFood(this.map.food.color);
          f.position.copy(p).add(new THREE.Vector3(0, 0.6, 0));
          this.world.scene.add(f);
          this.foods.push({ obj: f, pos: p, eaten: false });
        }
      }
      if (o.type === 'collect' && o.item) {
        // Spread out: each one at least 25 m from the others, away from the start and the exit.
        for (let i = 0; i < o.count; i++) {
          let p = this.world.freePoint(10, start, 35);
          for (let k = 0; k < 20; k++) {
            if (this.collectibles.every((c) => c.pos.distanceTo(p) > 25) && p.distanceTo(this.world.exitPos) > 15) break;
            p = this.world.freePoint(10, start, 35);
          }
          const obj = buildObjectiveItem(o.item);
          obj.position.copy(p);
          obj.rotation.y = Math.random() * 6;
          this.world.scene.add(obj);
          this.collectibles.push({ obj, pos: p, item: o.item, done: false });
        }
      }
      if (o.type === 'rescue') {
        for (let i = 0; i < o.count; i++) {
          const p = this.world.freePoint(10, start, 50);
          const rig = buildAnimal(this.animal.id, this.animal.color, this.animal.accent, 0.5);
          rig.root.position.copy(p);
          this.world.scene.add(rig.root);
          const tag = textSprite('Mom?!', { size: 0.6 });
          tag.position.y = 3.2;
          tag.name = 'tag';
          rig.root.add(tag);
          this.babies.push({ rig, pos: p, following: false, yaw: 0, phase: 0 });
        }
      }
    }
    if (this.map.id === 'lodge') {
      // The Old Moose, in a gold-padlocked cage by the lodge door.
      const cage = buildSecretItem('cage');
      cage.getObjectByName('critter')?.removeFromParent();
      cage.getObjectByName('perch')?.removeFromParent();
      cage.scale.set(2.6, 2.4, 2.6);
      const e = this.world.exitPos;
      cage.position.set(e.x, this.world.height(e.x, e.z), e.z);
      const moose = buildAnimal('moose', 0x5b3d26, 0xd9c9a3, 0.38);
      moose.root.rotation.y = 0.4;
      cage.add(moose.root);
      this.world.scene.add(cage);
      this.mooseCage = cage;
      this.world.colliders.push({ x: e.x, z: e.z, r: 2.6, blocksSight: false });
      const tag = textSprite('Psst. Kid. Get me outta here.', { size: 0.25 });
      tag.position.y = 2.2;
      cage.add(tag);
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // --- Secrets ----------------------------------------------------------

  private addProp(item: SecretItem, pos: THREE.Vector3, sabotage: boolean) {
    const obj = buildSecretItem(item);
    pos.y = this.world.height(pos.x, pos.z);
    obj.position.copy(pos);
    if (item === 'cage') this.world.settle(obj, pos.x, pos.z, 0, 0.9, 0.9);
    if (item === 'charger') this.world.settle(obj, pos.x, pos.z, 0, 1.8, 2.2);
    this.world.scene.add(obj);
    const prop: SecretProp = { obj, pos, item, sabotage, done: false };
    this.secret!.props.push(prop);
    if (sabotage && item !== 'decoy') this.world.colliders.push({ x: pos.x, z: pos.z, r: item === 'cage' ? 1.2 : 1, blocksSight: false });
    return prop;
  }

  private spawnSecretTrigger(def: SecretDef) {
    this.secret = { def, found: false, step: -1, progress: 0, props: [], done: false };
    // Hidden somewhere off the beaten path: far from the start and away from the exit.
    let p = this.world.freePoint(12, this.world.playerStart, 55);
    for (let i = 0; i < 10 && p.distanceTo(this.world.exitPos) < 30; i++) p = this.world.freePoint(12, this.world.playerStart, 55);
    this.addProp(def.trigger, p, false);
  }

  private startSecretStep(i: number, from: THREE.Vector3) {
    const s = this.secret!;
    s.step = i;
    const step = s.def.steps[i];
    s.progress = i === 0 && step.item === s.def.trigger ? 1 : 0;
    if (step.kind === 'trail') {
      this.spawnTrailItem(step.item, from);
    } else {
      for (let k = 0; k < step.count; k++) {
        let p: THREE.Vector3;
        if (step.item === 'charger') {
          const t = pick(this.world.trucks);
          p = t.clone().add(new THREE.Vector3(t.x > 0 ? -5 : 5, 0, -4));
        } else {
          p = this.world.freePoint(10, this.player.pos, 20);
        }
        this.addProp(step.item, p, true);
      }
    }
    this.hud.toast(step.label, 'secret');
  }

  private spawnTrailItem(item: SecretItem, from: THREE.Vector3) {
    const fs = this.world.stands.find((st) => st.flyer);
    if (item === 'flyer' && fs) {
      // Stapled to the tree stand by the trucks.
      const local = new THREE.Vector3(1.3, 0, 0.2).applyAxisAngle(UP, fs.yaw);
      const p = fs.pos.clone().add(local);
      const prop = this.addProp(item, p, false);
      prop.obj.rotation.set(0, fs.yaw + Math.PI / 2, 0);
      return;
    }
    // The next item appears a short walk away, so the trail leads you across the map.
    for (let tries = 0; tries < 40; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = 18 + Math.random() * 18;
      const p = new THREE.Vector3(from.x + Math.cos(a) * d, 0, from.z + Math.sin(a) * d);
      if (Math.abs(p.x) > this.world.half - 8 || Math.abs(p.z) > this.world.half - 8) continue;
      if (this.world.colliders.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r + 1.2)) continue;
      if (this.world.inWater(p.x, p.z)) continue;
      if (item === 'lodgemap') this.placeOnCrate(p);
      else this.addProp(item, p, false);
      return;
    }
    if (item === 'lodgemap') this.placeOnCrate(this.world.freePoint(10));
    else this.addProp(item, this.world.freePoint(10), false);
  }

  /** The lodge map sits on top of a decoy shipping crate. */
  private placeOnCrate(p: THREE.Vector3) {
    const crate = buildDecoyCrate();
    p.y = this.world.height(p.x, p.z);
    crate.position.copy(p);
    crate.rotation.y = Math.random() * Math.PI * 2;
    this.world.scene.add(crate);
    this.world.colliders.push({ x: p.x, z: p.z, r: 0.8, blocksSight: false });
    const prop = this.addProp('lodgemap', p, false);
    prop.pos.y += CRATE_HEIGHT;
    prop.obj.position.y = prop.pos.y;
    prop.obj.rotation.y = crate.rotation.y;
  }

  private advanceSecret(at: THREE.Vector3) {
    const s = this.secret!;
    const step = s.def.steps[s.step];
    s.progress++;
    if (s.progress < step.count) {
      if (step.kind === 'trail') this.spawnTrailItem(step.item, at);
      return;
    }
    if (s.step + 1 < s.def.steps.length) {
      this.startSecretStep(s.step + 1, at);
      return;
    }
    s.done = true;
    sfx.win();
    haptic('success');
    this.hud.toast(`Case file updated: "${s.def.title}"`, 'secret');
    this.opts.onEvent({ type: 'secretDone', map: this.map.id });
  }

  private updateSecret(dt: number) {
    const s = this.secret;
    if (!s) return;
    const p = this.player;
    for (const prop of s.props) {
      if (prop.done) continue;
      const pinned = (prop.item === 'flyer' && s.step >= 0) || prop.item === 'lodgemap';
      if (!pinned) prop.obj.rotation.y += dt * (prop.sabotage ? 0 : 1.5);
      if (!prop.sabotage && !pinned) prop.obj.position.y = prop.pos.y + 0.4 + Math.sin(this.time * 3) * 0.15;
      if (prop.item === 'decoy') {
        prop.obj.position.y = prop.pos.y + Math.sin(this.time * 2 + prop.pos.x) * 0.08;
        const led = prop.obj.getObjectByName('led');
        if (led) led.visible = Math.floor(this.time * 3) % 2 === 0;
      }
      if (prop.sabotage) continue;
      if (Math.hypot(prop.pos.x - p.pos.x, prop.pos.z - p.pos.z) < 1.6 + p.radius && Math.abs(prop.pos.y - p.pos.y) < 3) {
        prop.done = true;
        this.world.scene.remove(prop.obj);
        sfx.rescue();
        if (!s.found) {
          s.found = true;
          this.hud.toast(s.def.found, 'secret');
          this.opts.onEvent({ type: 'secretFound', map: this.map.id });
          this.startSecretStep(0, prop.pos);
        } else {
          this.advanceSecret(prop.pos);
        }
      }
    }
    const step = s.found && !s.done ? s.def.steps[s.step] : null;
    this.hud.setSecret(step ? { label: step.label, have: s.progress, need: step.count } : s.done ? { label: `Secret solved: ${s.def.title}`, have: 1, need: 1 } : null);
  }

  /** Boop a sabotage prop (cage, decoy, charger). */
  private sabotage(prop: SecretProp) {
    prop.done = true;
    sfx.boop();
    haptic('light');
    if (prop.item === 'cage') {
      const critter = prop.obj.getObjectByName('critter');
      if (critter) {
        const world = new THREE.Vector3();
        critter.getWorldPosition(world);
        critter.removeFromParent();
        critter.position.copy(world);
        this.addFx(critter, 3, (fx, d) => {
          fx.obj.position.addScaledVector(fx.vel!, d);
          fx.vel!.y -= 4 * d;
          fx.obj.rotation.y += d * 6;
        }, new THREE.Vector3((Math.random() - 0.5) * 6, 6, (Math.random() - 0.5) * 6));
      }
      const bird = critter?.userData.kind === 'toucan' ? 'toucan' : 'parrot';
      this.collapseCage(prop.obj);
      this.hud.toast(pick([`"FREEDOM!" squawks the ${bird}.`, `"Thanks, ${critterNoun(this.animal.id)}!" The ${bird} takes off.`, '"The Lodge! They\'re taking everyone to the Lodge!"']), 'secret');
    } else if (prop.item === 'decoy') {
      this.burst(prop.pos, 0x8d6e63, 14);
      this.world.scene.remove(prop.obj);
      this.hud.toast(pick(['*BZZT* QUACK.EXE HAS STOPPED', 'The decoy sparks and sinks.', 'Robo-decoy: popped.']), 'secret');
    } else if (prop.item === 'charger') {
      this.burst(prop.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0x22d3ee, 18);
      for (const h of this.hunters) {
        if (h.kind !== 'ebike') continue;
        h.unplugged = true;
        h.say('My battery!! NOOO!');
      }
      this.hud.toast('Charger unplugged. Every e-bike in the woods just died.', 'secret');
    }
    this.advanceSecret(prop.pos);
  }

  /** Knock a cage apart: every bar, post and plank flies outward, tumbles to the ground and sinks away. */
  private collapseCage(cage: THREE.Object3D) {
    cage.updateMatrixWorld(true);
    const center = new THREE.Vector3();
    cage.getWorldPosition(center);
    const parts = cage.children.filter((c) => c.userData.cagePart);
    for (const part of parts) {
      this.world.scene.attach(part);
      const out = part.position.clone().sub(center).setY(0);
      if (out.lengthSq() < 0.01) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      out.normalize().multiplyScalar(1.5 + Math.random() * 2.5);
      const vel = new THREE.Vector3(out.x, 1.5 + Math.random() * 3, out.z);
      const spin = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8);
      let landed = false;
      this.addFx(part, 2.6 + Math.random() * 0.6, (fx, d) => {
        const ground = this.world.height(fx.obj.position.x, fx.obj.position.z) + 0.05;
        if (!landed) {
          fx.obj.position.addScaledVector(fx.vel!, d);
          fx.vel!.y -= 14 * d;
          fx.obj.rotation.x += spin.x * d;
          fx.obj.rotation.y += spin.y * d;
          fx.obj.rotation.z += spin.z * d;
          if (fx.obj.position.y < ground) {
            fx.obj.position.y = ground;
            landed = true;
          }
        } else if (fx.life < 0.8) {
          fx.obj.position.y -= d * 0.6;
        }
      }, vel);
    }
    this.shake = Math.max(this.shake, 0.2);
  }

  private burst(pos: THREE.Vector3, color: number, n: number) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), mat(color));
      m.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
      this.addFx(m, 0.9, (fx, d) => {
        fx.vel!.y -= 15 * d;
        fx.obj.position.addScaledVector(fx.vel!, d);
        fx.obj.rotation.x += d * 8;
      }, new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 5, (Math.random() - 0.5) * 8));
    }
  }

  // --- Objectives -------------------------------------------------------

  private objectiveViews(): ObjectiveView[] {
    const others = this.map.objectives.filter((o) => o.type !== 'exit');
    const othersDone = others.every((o) => this.progress[o.type] >= o.count);
    return this.map.objectives.map((o) => ({
      label: o.type === 'eat' ? `Eat ${this.map.food.name}` : o.label,
      have: Math.floor(this.progress[o.type]),
      need: o.count,
      done: this.progress[o.type] >= o.count,
      locked: o.type === 'exit' && !othersDone,
      isTime: o.type === 'survive',
    }));
  }

  private checkObjectives() {
    const views = this.objectiveViews();
    this.hud.setObjectives(views);
    const hasExit = this.map.objectives.some((o) => o.type === 'exit');
    const othersDone = views.filter((_, i) => this.map.objectives[i].type !== 'exit').every((v) => v.done);
    if (hasExit && othersDone && !this.exitOpen) {
      this.exitOpen = true;
      this.world.openExit();
      const msg = {
        cage: 'The King dropped the cage key! Free the Old Moose!',
        cave: 'The cave is glowing. Head for the light!',
        temple: 'The temple gate is open. Head for the light!',
        beaver: 'The beavers left the light on. Head for the lodge!',
        gap: 'The fence gap is open! Follow the light!',
      }[this.world.exitKind];
      this.hud.toast(msg, 'good');
      sfx.rescue();
    }
    if (views.every((v) => v.done)) this.finish(true);
  }

  // --- Player abilities -------------------------------------------------

  private useAbility() {
    const p = this.player;
    if (p.abilityCd > 0) return;
    const a = this.animal.ability;
    p.abilityCd = a.cooldown;
    p.abilityT = a.duration;
    switch (this.animal.id) {
      case 'deer':
        sfx.sniff();
        this.hud.toast('*SNIIIIFF* You smell... hunters. And body spray.', 'info');
        break;
      case 'rabbit':
        sfx.boing();
        p.vel.y = this.animal.jump * 1.7;
        p.onGround = false;
        p.snareT = 0;
        break;
      case 'skunk': {
        sfx.fart();
        const g = new THREE.Group();
        for (let i = 0; i < 14; i++) {
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + Math.random(), 0), mat(0x9acd32, { transparent: true, opacity: 0.28 }));
          m.position.set((Math.random() - 0.5) * 8, 0.5 + Math.random() * 2.5, (Math.random() - 0.5) * 8);
          g.add(m);
        }
        g.position.copy(p.pos);
        this.world.scene.add(g);
        this.clouds.push({ pos: p.pos.clone(), r: 7, life: a.duration, obj: g, hits: 0 });
        break;
      }
      case 'bear': {
        sfx.roar();
        haptic('heavy');
        this.shake = 0.6;
        this.ring(p.pos, 13);
        let n = 0;
        for (const h of this.hunters) {
          if (h.state === 'hidden' || h.pos.distanceTo(p.pos) >= 13) continue;
          if (this.knockDown(h, 4.5, 'roar')) n++;
        }
        if (n) this.opts.onEvent({ type: 'roar', count: n });
        break;
      }
      case 'duck':
        sfx.quack();
        p.flying = true;
        p.snareT = 0;
        this.hud.toast('IT\'S DUCK SEASON (shotguns can see you!)', 'bad');
        break;
      case 'moose':
        sfx.roar();
        haptic('heavy');
        p.invuln = Math.max(p.invuln, a.duration);
        p.snareT = 0;
        break;
    }
  }

  private ring(pos: THREE.Vector3, radius: number) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 4, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    ring.position.copy(pos).add(new THREE.Vector3(0, 1, 0));
    this.addFx(ring, 0.6, (fx) => {
      const k = 1 - fx.life / fx.max;
      fx.obj.scale.setScalar(1 + k * radius);
      ((fx.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k;
    });
  }

  /** What the BOOP button would hit right now. */
  private boopTarget(): { hunter?: Hunter; prop?: SecretProp; stand?: Stand } | null {
    const p = this.player;
    for (const st of this.stands) {
      if (st.hunter?.standPhase === 'up' && Math.hypot(st.pos.x - p.pos.x, st.pos.z - p.pos.z) < 2.4 + p.radius) return { stand: st };
    }
    let best: Hunter | null = null;
    let bestD = 2.8 + p.radius;
    for (const h of this.hunters) {
      if (h.state === 'hidden' || h.elev > 0.5) continue;
      const d = Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z) / Math.max(1, h.rig.root.scale.x * 0.8);
      if (d < bestD) {
        best = h;
        bestD = d;
      }
    }
    if (this.secret) {
      for (const prop of this.secret.props) {
        if (!prop.sabotage || prop.done) continue;
        const d = Math.hypot(prop.pos.x - p.pos.x, prop.pos.z - p.pos.z) - (prop.item === 'charger' ? 1.2 : 0.6);
        if (d < bestD) return { prop };
      }
    }
    return best ? { hunter: best } : null;
  }

  private tryBoop() {
    const t = this.boopTarget();
    if (!t) return;
    if (t.prop) {
      this.sabotage(t.prop);
      return;
    }
    if (t.stand) {
      this.knockStand(t.stand);
      return;
    }
    const h = t.hunter!;
    if (this.canBoop(h)) {
      sfx.boop();
      haptic('light');
      this.knockDown(h, 5, 'boop');
    } else if (h.state !== 'stunned') {
      h.suspicion = 1;
      h.state = 'alert';
      h.lastSeen.copy(this.player.pos);
      h.say(h.kind === 'king' ? `Ha! Not while I'm looking, ${critterNoun(this.animal.id)}!` : 'HEY! I see you!');
      sfx.alert();
    }
  }

  private canBoop(h: Hunter) {
    if (h.state === 'stunned' || h.state === 'hidden' || h.state === 'flee') return false;
    if (h.state === 'stinky' || h.state === 'sleep') return true;
    if (h.kind === 'king' && h.vulnerableT > 0) return true;
    // Nobody suspects a fellow hunter.
    if (this.player.orangeT > 0 && h.kind !== 'king') return true;
    const toP = this.player.pos.clone().sub(h.pos).setY(0).normalize();
    const behind = toP.dot(h.forward) < -0.1;
    return behind && h.state !== 'alert';
  }

  private makeHatEntry(h: Hunter): HatEntry {
    const idn = h.idn;
    return {
      id: idn.id,
      kind: idn.kind,
      name: h.name,
      weightLbs: idn.weightLbs,
      heightIn: idn.heightIn,
      statLabel: h.def.stat.label,
      statValue: idn.statValue,
      personality: PERSONALITY_LABEL[idn.personality],
      score: trophyScore(idn),
      golden: idn.look.golden,
      map: this.map.id,
      date: new Date().toISOString().slice(0, 10),
      look: { ...idn.look },
    };
  }

  private dropHat(h: Hunter, entry: HatEntry | null, hatObj?: THREE.Object3D) {
    const world = new THREE.Vector3();
    (hatObj ?? h.rig.hat ?? h.rig.root).getWorldPosition(world);
    if (hatObj) hatObj.visible = false;
    else if (h.rig.hat) h.rig.hat.visible = false;
    const obj = buildHatPickup(h.idn.look.hatColor, h.idn.look.golden || h.kind === 'king');
    obj.position.copy(world);
    this.world.scene.add(obj);
    const away = h.pos.clone().sub(this.player.pos).setY(0).normalize().multiplyScalar(2.5);
    this.hatsOnGround.push({ obj, pos: world.clone(), vel: new THREE.Vector3(away.x, 7, away.z), age: 0, entry });
  }

  /** Returns true if the hunter actually went down. */
  private knockDown(h: Hunter, dur: number, cause: 'boop' | 'roar' | 'charge' | 'trap'): boolean {
    h.chargeTo = null;
    h.windT = 0;
    if (h.state === 'hidden' || h.state === 'stunned' || h.state === 'flee') return false;
    if (h.standPhase === 'up' && cause !== 'trap') {
      this.knockStand(this.stands[h.standIdx]);
      return true;
    }
    if (h.standPhase === 'climb' || h.standPhase === 'fall') return false;
    if (h.standPhase === 'walk') h.standPhase = 'none';
    const asleep = h.state === 'sleep';
    if (h.kind === 'king') return this.hitKing(h, cause);
    const p = this.player;
    if ((cause === 'boop' || cause === 'charge') && !p.orangeHeld && p.orangeT <= 0 && !this.pickups.some((x) => x.kind === 'orange') && Math.random() < 0.3) {
      this.dropOrange(h.pos);
    }
    h.state = 'stunned';
    h.stunT = dur;
    h.suspicion = 0;
    h.aim = 0;
    h.setMarker('');
    if (cause === 'boop' || cause === 'charge') this.opts.onEvent({ type: 'boop', kind: h.kind, asleep });
    if (h.dog && h.dog.freeT < 999) {
      h.dog.freeT = 9999;
      this.dogSay(h, 'Yip! (free!)');
    }
    if (h.drone && !h.drone.crashed) {
      h.drone.crashed = true;
      h.drone.light.visible = false;
      this.hud.toast('The drone wobbles... and crashes into a tree.', 'good');
      this.opts.onEvent({ type: 'drone' });
    }
    if (h.hatOn) {
      h.hatOn = false;
      this.dropHat(h, this.makeHatEntry(h));
      h.say(cause === 'roar' ? 'AAAAH! BEAR!' : cause === 'trap' ? `OW! ${pick(['TAMMY!', 'WHO PUT THIS HERE', 'MY ANKLE'])}` : pick(BOOP_QUIPS));
      this.hud.toast(`${h.name} dropped their hat! Grab it.`, 'good');
    } else {
      h.say(cause === 'roar' ? 'Not the bear again!' : 'I don\'t even HAVE a hat anymore!');
    }
    return true;
  }

  private hitKing(h: Hunter, cause: string): boolean {
    const behind = this.player.pos.clone().sub(h.pos).setY(0).normalize().dot(h.forward) < -0.1;
    const open = h.vulnerableT > 0 || h.state === 'stinky' || (behind && h.state !== 'alert');
    if (!open || h.hatsLeft <= 0) {
      if (cause !== 'trap') h.say(pick(['Ha! Nice try.', 'Is that all, {c}?', 'GUARDS!']), 1.8);
      return false;
    }
    h.hatsLeft--;
    this.progress.boss++;
    this.opts.onEvent({ type: 'boop', kind: 'king', asleep: false });
    const hats = h.rig.hats ?? [];
    const hatObj = hats[2 - h.hatsLeft];
    this.shake = 0.4;
    haptic('heavy');
    sfx.boop();
    h.state = 'stunned';
    h.stunT = 2.5;
    h.vulnerableT = 0;
    h.aim = 0;
    h.enrage++;
    h.setMarker('');
    if (h.hatsLeft > 0) {
      if (hatObj) this.dropHat(h, null, hatObj);
      h.say(h.hatsLeft === 2 ? 'MY CROWN! Do you know what that COST?!' : 'Not the top hat! GUARDS! MORE GUARDS!');
      this.hud.toast(`The Trophy King lost a hat! ${h.hatsLeft} to go.`, 'good');
      // Reinforcements roll up from the trucks.
      const t = pick(this.world.trucks);
      const g = this.spawnHunter(pick(['rifle', 'shotgun'] as HunterKind[]), t.clone().add(new THREE.Vector3(3, 0, 3)), false);
      g.state = 'search';
      g.suspicion = 0.7;
      g.lastSeen.copy(this.player.pos);
      g.say('Coming, your majesty!');
    } else {
      if (hatObj) this.dropHat(h, this.makeHatEntry(h), hatObj);
      this.kingDefeated = true;
      h.state = 'flee';
      h.target = this.nearestTruck(h.pos);
      h.say('WAAAH! I\'m telling my MOTHER!', 4);
      this.hud.toast('The Trophy King runs crying to his golden truck!', 'good');
      for (const o of this.hunters) {
        if (o === h || o.state === 'hidden') continue;
        o.state = 'flee';
        o.target = this.nearestTruck(o.pos);
        o.say(pick(['Every man for himself!', 'I\'m not paid enough for this!', 'Wait for me, sire!']));
      }
    }
    return true;
  }

  private nearestTruck(from: THREE.Vector3) {
    let best = this.world.trucks[0] ?? from.clone().setZ(this.world.half);
    let bd = Infinity;
    for (const t of this.world.trucks) {
      const d = t.distanceTo(from);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best.clone();
  }

  private damage(source: Hunter) {
    const p = this.player;
    if (p.invuln > 0 || this.ended) return;
    p.hearts--;
    p.invuln = 2;
    this.hitsTaken++;
    sfx.hit();
    haptic('warning');
    this.hud.hurt();
    this.shake = 0.35;
    this.hud.toast(`${pick([...HIT_QUIPS, ...CRITTER_HIT_QUIPS[this.animal.id]])} (${source.name})`, 'bad');
    if (p.hearts <= 0) this.finish(false, source);
  }

  // --- Player -----------------------------------------------------------

  private updatePlayer(dt: number) {
    const p = this.player;
    const a = this.animal;
    const inp = this.input;
    const w = this.world;

    if (inp.consume('KeyE', 'KeyQ')) this.useAbility();
    if (inp.consume('KeyR')) this.wearOrange();
    if (inp.consume('KeyF')) this.tryBoop();

    p.abilityCd = Math.max(0, p.abilityCd - dt);
    p.abilityT = Math.max(0, p.abilityT - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.snareT = Math.max(0, p.snareT - dt);
    if (p.orangeT > 0) {
      p.orangeT -= dt;
      if (p.orangeT <= 0) {
        p.orangeT = 0;
        for (const o of p.disguise) o.removeFromParent();
        p.disguise = [];
        this.hud.toast(`The orange is off. You look like a ${critterNoun(this.animal.id)} again!`, 'bad');
      }
    }
    if (p.flying && p.abilityT <= 0) p.flying = false;
    const charging = a.id === 'moose' && p.abilityT > 0;

    // Movement relative to camera.
    const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    let dir = fwd.multiplyScalar(-inp.moveY).add(right.multiplyScalar(inp.moveX));
    const mag = Math.min(1, dir.length());
    if (charging) dir = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    p.moving = (mag > 0.05 || charging) && p.snareT <= 0;
    p.sprinting = p.moving && inp.sprint && !p.winded && !p.flying && !charging;
    if (p.sprinting) {
      p.stamina -= dt / a.stamina;
      if (p.stamina <= 0) {
        p.stamina = 0;
        p.winded = true;
        this.hud.toast('*wheeze* Out of breath!', 'bad');
      }
    } else {
      p.stamina = Math.min(1, p.stamina + dt / (a.stamina * 1.4));
      if (p.winded && p.stamina > 0.35) p.winded = false;
    }
    let speed = (p.sprinting ? a.runSpeed : a.walkSpeed) * (inp.isTouch && !p.sprinting ? Math.max(0.4, mag) : 1);
    if (w.inWater(p.pos.x, p.pos.z) && !p.flying) speed *= a.id === 'duck' ? 1.3 : 0.55;
    if (a.id === 'rabbit' && p.abilityT > 0) speed *= 2;
    if (p.flying) speed = a.runSpeed * 1.4;
    if (charging) speed = a.runSpeed * 2.3;
    p.speed = p.moving ? speed : 0;
    if (p.moving) {
      dir.normalize();
      p.pos.addScaledVector(dir, speed * dt);
      const targetYaw = Math.atan2(dir.x, dir.z);
      let dy = targetYaw - p.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      p.yaw += dy * Math.min(1, dt * 12);
    }
    w.resolve(p.pos, p.radius, this.exitOpen);

    if (charging) {
      for (const h of this.hunters) {
        if (Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z) < p.radius + 1.6) {
          if (this.knockDown(h, 4, 'charge')) this.shake = 0.3;
        }
      }
    }

    const ground = w.height(p.pos.x, p.pos.z);
    if (p.flying) {
      const targetY = ground + 11;
      p.pos.y += (targetY - p.pos.y) * Math.min(1, dt * 3);
      p.vel.y = 0;
      p.onGround = false;
    } else {
      if (inp.consume('Space') && p.onGround && p.snareT <= 0) {
        p.vel.y = a.jump;
        p.onGround = false;
        sfx.whoosh();
      }
      p.vel.y -= (a.id === 'duck' ? 14 : 25) * dt;
      p.pos.y += p.vel.y * dt;
      if (p.pos.y <= ground) {
        p.pos.y = ground;
        p.vel.y = 0;
        p.onGround = true;
      }
    }

    // Animation
    const r = p.rig;
    r.root.position.copy(p.pos);
    r.root.rotation.set(0, p.yaw, 0);
    p.phase += dt * (p.moving ? speed * 1.6 : p.snareT > 0 ? 30 : 0);
    const swing = (p.moving && p.onGround) || p.snareT > 0 ? Math.sin(p.phase) * 0.7 : 0;
    r.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? swing : -swing) * (a.id === 'duck' ? 0.8 : 1)));
    if (a.id === 'rabbit' && p.moving && p.onGround) r.body.position.y = Math.abs(Math.sin(p.phase * 0.5)) * 0.4;
    else r.body.position.y = p.moving && p.onGround ? Math.abs(Math.sin(p.phase)) * 0.08 : 0;
    r.body.rotation.x = charging ? 0.25 : !p.onGround && !p.flying ? -Math.sign(p.vel.y) * 0.25 : 0;
    if (r.wings) r.wings.forEach((wg, i) => (wg.rotation.z = p.flying || !p.onGround ? Math.sin(this.time * 25) * 0.9 * (i ? 1 : -1) : 0));
    r.root.visible = p.invuln > 0 && !charging ? Math.floor(this.time * 15) % 2 === 0 : true;

    // Food
    for (const f of this.foods) {
      if (f.eaten) continue;
      f.obj.rotation.y += dt * 2;
      f.obj.position.y = f.pos.y + 0.7 + Math.sin(this.time * 3 + f.pos.x) * 0.15;
      if (f.pos.distanceTo(p.pos) < 1.6 + p.radius) {
        f.eaten = true;
        f.obj.visible = false;
        this.progress.eat++;
        sfx.chomp();
        const need = this.map.objectives.find((o) => o.type === 'eat')?.count ?? 0;
        if (this.progress.eat <= need) this.hud.toast(`Nom! (${this.progress.eat}/${need})`, 'good');
      }
    }

    // Eggs to grab / nests to warn
    for (const c of this.collectibles) {
      if (c.done) continue;
      const egg = c.obj.getObjectByName('egg');
      if (egg) egg.position.y = 0.62 + Math.abs(Math.sin(this.time * 2 + c.pos.x)) * 0.12;
      if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) > 1.8 + p.radius) continue;
      c.done = true;
      this.progress.collect++;
      const need = this.map.objectives.find((o) => o.type === 'collect')?.count ?? 0;
      if (c.item === 'egg') {
        egg?.removeFromParent();
        sfx.rescue();
        this.hud.toast(`Got an egg back! (${this.progress.collect}/${need})`, 'good');
      } else {
        // The duck wakes up and flaps off to warn everyone else.
        const duck = c.obj.getObjectByName('duck');
        if (duck) {
          const world = new THREE.Vector3();
          duck.getWorldPosition(world);
          duck.removeFromParent();
          duck.position.copy(world);
          const dir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
          duck.rotation.y = Math.atan2(dir.x, dir.z);
          this.addFx(duck, 4, (fx, d) => fx.obj.position.addScaledVector(fx.vel!, d), dir.multiplyScalar(7).setY(3.5));
        }
        sfx.quack();
        this.hud.toast(`QUACK! Nest warned. (${this.progress.collect}/${need})`, 'good');
      }
    }

    // Hats on the ground
    for (const hat of this.hatsOnGround) {
      hat.age += dt;
      const gy = w.height(hat.pos.x, hat.pos.z) + 0.5;
      if (hat.pos.y > gy || hat.vel.y > 0) {
        hat.vel.y -= 18 * dt;
        hat.pos.addScaledVector(hat.vel, dt);
        if (hat.pos.y < gy) {
          hat.pos.y = gy;
          hat.vel.set(0, 0, 0);
        }
        hat.obj.rotation.x += dt * 8;
      } else {
        hat.obj.rotation.x = 0;
        hat.obj.rotation.y += dt * 2;
        hat.pos.y = gy + Math.sin(this.time * 3) * 0.1;
      }
      hat.obj.position.copy(hat.pos);
      if (hat.entry && hat.age > 0.4 && Math.hypot(hat.pos.x - p.pos.x, hat.pos.z - p.pos.z) < 1.5 + p.radius && Math.abs(hat.pos.y - p.pos.y) < 3) {
        this.world.scene.remove(hat.obj);
        hat.age = -1;
        this.progress.boop++;
        this.runHats.push(hat.entry);
        this.opts.onEvent({ type: 'hat', entry: hat.entry });
        sfx.chomp();
        this.hud.toast(`Hat logged: ${hat.entry.name} (score ${hat.entry.score})`, hat.entry.golden ? 'secret' : 'good');
      }
    }
    this.hatsOnGround = this.hatsOnGround.filter((h) => h.age >= 0);

    // Lunches and oranges
    for (const it of this.pickups) {
      it.age += dt;
      const gy = w.height(it.pos.x, it.pos.z) + 0.4;
      if (it.pos.y > gy || it.vel.y > 0) {
        it.vel.y -= 18 * dt;
        it.pos.addScaledVector(it.vel, dt);
        if (it.pos.y < gy) {
          it.pos.y = gy;
          it.vel.set(0, 0, 0);
        }
        it.obj.rotation.x += dt * 6;
      } else {
        it.obj.rotation.x = 0;
        it.obj.rotation.y += dt * 2;
        it.pos.y = gy + Math.sin(this.time * 3) * 0.1;
      }
      it.obj.position.copy(it.pos);
      if (it.age < 0.5 || Math.hypot(it.pos.x - p.pos.x, it.pos.z - p.pos.z) > 1.5 + p.radius || Math.abs(it.pos.y - p.pos.y) > 3) continue;
      if (it.kind === 'lunch') {
        if (p.hearts >= this.animal.hearts) continue;
        p.hearts++;
        sfx.chomp();
        haptic('success');
        this.hud.toast(pick(['Ham on rye. +1 heart', 'A slightly squished sandwich. +1 heart', 'Bologna! +1 heart']), 'good');
      } else {
        if (p.orangeHeld) continue;
        p.orangeHeld = true;
        sfx.rescue();
        this.hud.toast(this.input.isTouch ? 'Got a hunter\'s orange! Tap ORANGE to blend in.' : 'Got a hunter\'s orange! Press R to blend in.', 'good');
      }
      this.world.scene.remove(it.obj);
      it.age = -1;
    }
    this.pickups = this.pickups.filter((it) => it.age >= 0);

    // Traps
    for (const t of this.traps) {
      if (t.sprung > 0) {
        t.sprung += dt;
        continue;
      }
      if (p.onGround && !p.flying && p.snareT <= 0 && p.invuln <= 0 && Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) < 0.6 + p.radius) {
        t.sprung = 0.01;
        p.snareT = 1.6;
        sfx.hit();
        haptic('warning');
        this.hud.toast('SNARED! Wiggling free...', 'bad');
        this.opts.onEvent({ type: 'trap' });
        const o = t.owner;
        if (!o.oblivious) {
          o.suspicion = Math.max(o.suspicion, 0.85);
          o.lastSeen.copy(p.pos);
          o.state = 'search';
          o.searchT = 0;
          o.say('Ooh! Got something!');
        }
      }
    }
    for (const t of this.traps) if (t.sprung > 1.5) this.world.scene.remove(t.obj);
    this.traps = this.traps.filter((t) => t.sprung <= 1.5);

    // Babies
    let leader: THREE.Vector3 = p.pos;
    for (const b of this.babies) {
      if (!b.following) {
        b.rig.root.rotation.y += dt;
        if (b.pos.distanceTo(p.pos) < 3 + p.radius) {
          b.following = true;
          this.progress.rescue++;
          sfx.rescue();
          const tag = b.rig.root.getObjectByName('tag');
          if (tag) b.rig.root.remove(tag);
          this.hud.toast(`Found baby #${this.progress.rescue}! It's following you.`, 'good');
        }
        continue;
      }
      const to = leader.clone().sub(b.pos).setY(0);
      const d = to.length();
      if (d > 1.8) {
        const step = Math.min(d - 1.8, Math.max(a.runSpeed, p.speed) * 1.1 * dt);
        b.pos.addScaledVector(to.normalize(), step);
        b.yaw = Math.atan2(to.x, to.z);
        b.phase += dt * 14;
      }
      if (d > 25) b.pos.copy(leader);
      b.pos.y = w.height(b.pos.x, b.pos.z);
      b.rig.root.position.copy(b.pos);
      b.rig.root.rotation.y = b.yaw;
      const s = d > 1.9 ? Math.sin(b.phase) * 0.7 : 0;
      b.rig.legs.forEach((l, i) => (l.rotation.x = i === 0 || i === 3 ? s : -s));
      leader = b.pos;
    }

    // Exit
    if (this.exitOpen) {
      const e = this.world.exitPos;
      if (Math.hypot(p.pos.x - e.x, p.pos.z - e.z) < (this.map.id === 'lodge' ? 5 : 4.5)) {
        this.progress.exit = 1;
        if (this.mooseCage) {
          this.collapseCage(this.mooseCage);
          this.mooseCage = null;
        }
      }
    }
  }

  // --- Hunters ----------------------------------------------------------

  private visibilityTo(h: Hunter): { seen: boolean; dist: number; rate: number } {
    const p = this.player;
    const eye = h.eye();
    const target = p.pos.clone().add(new THREE.Vector3(0, p.rig.height * 0.5, 0));
    const to = target.clone().sub(eye);
    const dist = Math.hypot(to.x, to.z);
    if (p.orangeT > 0) return { seen: false, dist, rate: 0 };
    const perched = h.standPhase === 'up';
    // Right under the stand is a blind spot: nobody looks straight down.
    if (perched && dist < 3.2) return { seen: false, dist, rate: 0 };
    // Tucked into a dark doorway: invisible unless they're practically standing on you.
    if (!p.flying && dist > 2.5 && this.world.inHideZone(p.pos.x, p.pos.z)) return { seen: false, dist, rate: 0 };
    const duckSeason = p.flying && (h.kind === 'shotgun' || h.kind === 'king');
    let vis = this.animal.visibility;
    if (!p.moving) vis *= 0.55;
    else if (p.sprinting) vis *= 1.2;
    else vis *= 0.8;
    if (!p.flying && this.world.inBush(p.pos.x, p.pos.z) && dist > 3.5) vis *= perched ? 0.5 : 0.28;
    // Every bush between you and the hunter is partial cover (less so from up in a stand).
    if (!p.flying && dist > 3.5 && !perched) vis *= Math.pow(0.4, Math.min(2, this.world.bushesBetween(eye.x, eye.z, p.pos.x, p.pos.z)));
    if (perched) vis *= 1.35;
    if (p.flying) vis *= duckSeason ? 2.2 : 1.0;
    if (this.map.snow && this.animal.id !== 'rabbit') vis *= 1.1;
    if (this.map.night) vis *= 0.85;
    if (h.idn.look.tipsy) vis *= 0.85;
    const range = h.def.viewRange * Math.min(1.6, vis);
    if (dist > range) return { seen: false, dist, rate: 0 };
    const flat = to.clone().setY(0).normalize();
    const fov = duckSeason ? h.def.fov * 1.6 : h.def.fov;
    if (flat.dot(h.forward) < Math.cos(fov) && dist > 2.5) return { seen: false, dist, rate: 0 };
    if (!p.flying && !this.world.lineOfSight(eye.x, eye.z, target.x, target.z)) return { seen: false, dist, rate: 0 };
    const rate = 1.25 * (1 - dist / range) + 0.3;
    return { seen: true, dist, rate };
  }

  private faceTowards(h: Hunter, x: number, z: number, dt: number, speed = 4) {
    const want = Math.atan2(x - h.pos.x, z - h.pos.z);
    let d = want - h.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    h.yaw += d * Math.min(1, dt * speed);
    return Math.abs(d);
  }

  private moveTowards(h: Hunter, target: THREE.Vector3, speed: number, dt: number) {
    const to = target.clone().sub(h.pos).setY(0);
    const d = to.length();
    if (d < 1.2) return true;
    this.faceTowards(h, target.x, target.z, dt, h.kind === 'ebike' ? 3 : 5);
    h.pos.addScaledVector(h.forward, Math.min(d, speed * dt));
    this.world.resolve(h.pos, h.kind === 'ebike' || h.kind === 'king' ? 0.9 : 0.5);
    h.phase += dt * speed * 2.2;
    return false;
  }

  /** Radio/gunshot: nearby hunters come running to where the noise pointed. */
  private alertOthers(origin: THREE.Vector3, radius: number, where: THREE.Vector3, except: Hunter | null, lines?: string[]) {
    if (radius <= 0) return;
    for (const o of this.hunters) {
      if (o === except || o.oblivious || o.state === 'alert' || o.stationary) continue;
      if (o.pos.distanceTo(origin) > radius) continue;
      o.suspicion = Math.max(o.suspicion, 0.6);
      o.lastSeen.copy(where);
      o.state = 'search';
      o.searchT = 0;
      if (Math.random() < 0.5) o.say(pick(lines ?? ['Was that Randy?', 'Shots fired! Free dinner!', 'Ooh, where?!', 'Save some for me!']));
    }
  }

  private fire(h: Hunter, dist: number) {
    const p = this.player;
    const from = h.eye().add(h.forward.multiplyScalar(0.9 * h.rig.root.scale.x)).add(new THREE.Vector3(0, -0.3, 0));
    const target = p.pos.clone().add(new THREE.Vector3(0, p.rig.height * 0.45, 0));
    const vol = Math.max(0.15, 1 - dist / 80);
    const kind = h.def.projectile;

    if (kind === 'arrow') {
      sfx.twang(vol);
      const lead = p.vel.clone().setY(0);
      const fwdMove = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)).multiplyScalar(p.speed);
      lead.add(fwdMove).multiplyScalar((dist / 28) * 0.4);
      const aimAt = target.clone().add(lead).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, dist * 0.02, (Math.random() - 0.5) * 1.5));
      const vel = aimAt.sub(from).normalize().multiplyScalar(28);
      const arrow = new THREE.Group();
      arrow.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.1), mat(0x8b5a2b)));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4).rotateX(Math.PI / 2), mat(0xcccccc));
      tip.position.z = 0.6;
      const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.2), mat(0xff3d7f));
      fletch.position.z = -0.5;
      arrow.add(tip, fletch);
      arrow.position.copy(from);
      this.world.scene.add(arrow);
      this.arrows.push({ mesh: arrow, pos: from.clone(), vel, life: 4, owner: h, stuck: false });
      return;
    }

    let chance = h.accuracy;
    if (p.sprinting) chance -= 0.3;
    else if (p.moving) chance -= 0.12;
    chance -= (dist / h.def.viewRange) * 0.35;
    if (kind === 'pellets') chance += dist < 8 ? 0.2 : -0.15;
    if (p.flying && h.kind === 'shotgun') chance += 0.15;
    if (this.animal.id === 'rabbit') chance -= 0.1;
    if (!p.onGround && !p.flying) chance -= 0.2;
    if (this.animal.id === 'bear' || this.animal.id === 'moose') chance += 0.08;
    if (p.snareT > 0) chance += 0.2;
    const hit = Math.random() < Math.max(0.08, Math.min(0.9, chance * 0.78));

    const shots = kind === 'pellets' ? 5 : 1;
    for (let i = 0; i < shots; i++) {
      const spread = kind === 'pellets' ? 1.2 : 0;
      const end = hit && i === 0
        ? target.clone()
        : target.clone().add(new THREE.Vector3((Math.random() - 0.5) * (4 + spread), (Math.random() - 0.2) * 2, (Math.random() - 0.5) * (4 + spread)));
      const g = new THREE.BufferGeometry().setFromPoints([from, end]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true }));
      this.addFx(line, 0.18, (fx) => {
        ((fx.obj as THREE.Line).material as THREE.LineBasicMaterial).opacity = fx.life / fx.max;
      });
    }
    const flash = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
    flash.position.copy(from);
    this.addFx(flash, 0.08);
    if (kind === 'pellets') sfx.shotgun(vol);
    else sfx.bang(vol);

    if (hit) this.damage(h);
    else if (Math.random() < 0.6) h.say(pick(MISS_QUIPS), 1.8);
    this.alertOthers(h.pos, h.def.loudness, p.pos, h);
  }

  private dogSay(h: Hunter, text: string) {
    const dog = h.dog!;
    if (dog.bubble) dog.rig.root.remove(dog.bubble);
    dog.bubble = textSprite(text, { size: 0.55 });
    dog.bubble.position.y = 1.8;
    dog.rig.root.add(dog.bubble);
    setTimeout(() => {
      if (dog.bubble) dog.rig.root.remove(dog.bubble);
      dog.bubble = null;
    }, 1200);
  }

  private stinkNear(pos: THREE.Vector3, extra = 0) {
    return this.clouds.some((c) => c.pos.distanceTo(pos) < c.r + extra);
  }

  private updateDog(h: Hunter, dt: number) {
    const dog = h.dog!;
    const p = this.player;
    const w = this.world;
    dog.freeT = Math.max(0, dog.freeT - dt);
    let goal: THREE.Vector3;
    let speed = 5;
    const distToPlayer = dog.pos.distanceTo(p.pos);
    if (this.stinkNear(dog.pos) && dog.freeT <= 0) {
      dog.freeT = 8;
      this.dogSay(h, '*whimper*');
    }
    const smells = !this.demo && p.orangeT <= 0 && dog.freeT <= 0 && !h.oblivious && distToPlayer < 13 && !w.inWater(p.pos.x, p.pos.z) && !this.stinkNear(p.pos, 3) && !p.flying;
    if (dog.freeT > 0 || h.state === 'hidden') {
      // Off duty: sniff around wherever.
      if (dog.pos.distanceTo(h.target) < 2 || Math.random() < dt * 0.2) h.target = w.freePoint(8);
      goal = dog.freeT > 0 ? h.target.clone() : dog.pos;
      speed = 3;
    } else if (smells) {
      dog.barkT -= dt;
      if (dog.barkT <= 0) {
        dog.barkT = 1.3;
        sfx.bark(Math.max(0.2, 1 - distToPlayer / 30));
        this.dogSay(h, 'WOOF!');
      }
      const toward = p.pos.clone().sub(h.pos);
      if (toward.length() > 7) toward.setLength(7);
      goal = h.pos.clone().add(toward);
      speed = 6;
      h.suspicion = Math.min(1.2, h.suspicion + 0.9 * dt);
      h.lastSeen.copy(p.pos);
      if (h.state === 'patrol') h.state = 'curious';
    } else {
      goal = h.pos.clone().addScaledVector(h.forward, 2).add(new THREE.Vector3(Math.sin(this.time) * 1.5, 0, 0));
    }
    const to = goal.sub(dog.pos).setY(0);
    const d = to.length();
    if (d > 0.8) {
      dog.pos.addScaledVector(to.normalize(), Math.min(d, speed * dt));
      dog.yaw = Math.atan2(to.x, to.z);
      dog.phase += dt * speed * 3;
    }
    w.resolve(dog.pos, 0.4);
    dog.pos.y = w.height(dog.pos.x, dog.pos.z);
    dog.rig.root.position.copy(dog.pos);
    dog.rig.root.rotation.y = dog.yaw;
    const s = d > 0.8 ? Math.sin(dog.phase) * 0.7 : 0;
    dog.rig.legs.forEach((l, i) => (l.rotation.x = i === 0 || i === 3 ? s : -s));
  }

  private updateDrone(h: Hunter, dt: number) {
    const d = h.drone!;
    const w = this.world;
    const p = this.player;
    d.alertCd = Math.max(0, d.alertCd - dt);
    if (d.crashed) {
      const gy = w.height(d.pos.x, d.pos.z) + 0.2;
      if (d.pos.y > gy) {
        d.vy -= 15 * dt;
        d.pos.y = Math.max(gy, d.pos.y + d.vy * dt);
        d.obj.rotation.z += dt * 6;
      }
      d.obj.position.copy(d.pos);
      return;
    }
    if (d.pos.distanceTo(d.target) < 2) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 30;
      const t = new THREE.Vector3(h.home.x + Math.cos(a) * r, 0, h.home.z + Math.sin(a) * r);
      const lim = w.half - 5;
      t.x = Math.max(-lim, Math.min(lim, t.x));
      t.z = Math.max(-lim, Math.min(lim, t.z));
      t.y = w.height(t.x, t.z) + 10;
      d.target.copy(t);
    }
    const to = d.target.clone().sub(d.pos);
    d.pos.addScaledVector(to.normalize(), Math.min(to.length(), 5 * dt));
    d.obj.position.copy(d.pos);
    d.obj.children.forEach((c) => {
      if (c.name === 'rotor') c.rotation.y += dt * 40;
    });
    if (this.demo || d.alertCd > 0 || h.oblivious || this.player.orangeT > 0) return;
    const flat = Math.hypot(p.pos.x - d.pos.x, p.pos.z - d.pos.z);
    const hidden = (w.inBush(p.pos.x, p.pos.z) && !p.sprinting) || w.inHideZone(p.pos.x, p.pos.z);
    if (flat < 5.2 && !hidden) {
      d.alertCd = 6;
      sfx.alert();
      h.say('Got one on camera! Converging!', 2);
      this.hud.toast('A drone spotted you! Hunters are on the way.', 'bad');
      this.alertOthers(p.pos, 60, p.pos, h, ['Copy that, Dan!', 'On my way!', 'Drone says it\'s a big one!']);
    }
  }

  private updateHunters(dt: number, sniffing: boolean) {
    const p = this.player;
    let maxSus = 0;
    const pings: Ping[] = [];

    for (const h of this.hunters) {
      const kind = h.kind;
      h.reload = Math.max(0, h.reload - dt);
      h.spotQuipCd = Math.max(0, h.spotQuipCd - dt);
      h.vulnerableT = Math.max(0, h.vulnerableT - dt);
      if (h.bubble) {
        h.bubbleT -= dt;
        if (h.bubbleT <= 0) {
          h.rig.root.remove(h.bubble);
          (h.bubble.material as THREE.SpriteMaterial).map?.dispose();
          h.bubble = null;
        }
      }
      if (h.dog) this.updateDog(h, dt);
      if (h.drone) this.updateDrone(h, dt);

      if (h.state === 'hidden') {
        h.hideT -= dt;
        if (h.hideT <= 0 && h.kind !== 'king' && !this.kingDefeated) {
          h.state = 'patrol';
          h.rig.root.visible = true;
          h.target = this.world.freePoint(8);
          h.say('OK. I\'m OK. I\'m back.');
        }
        h.laser.visible = false;
        continue;
      }

      if (h.standPhase === 'climb' || h.standPhase === 'fall') {
        this.updateStandMove(h, dt);
        continue;
      }

      // Stink clouds override everything.
      if (h.state !== 'stunned' && h.state !== 'flee') {
        for (const c of this.clouds) {
          if (h.pos.distanceTo(c.pos) < c.r && h.state !== 'stinky') {
            h.state = 'stinky';
            h.stinkT = 5;
            h.suspicion = 0;
            h.aim = 0;
            h.setMarker('');
            h.say(pick(STINK_QUIPS));
            const away = h.pos.clone().sub(c.pos).setY(0).normalize().multiplyScalar(25);
            h.target = h.pos.clone().add(away);
            c.hits++;
            if (c.hits === 3) this.opts.onEvent({ type: 'stink', count: 3 });
          }
        }
      }

      let laserOn = kind === 'ghillie' && !h.oblivious;
      let laserTarget: THREE.Vector3 | null = null;

      if (h.state === 'stunned') {
        h.stunT -= dt;
        h.rig.body.rotation.z += (Math.PI / 2 - h.rig.body.rotation.z) * Math.min(1, dt * 8);
        if (h.stunT <= 0) this.afterStun(h);
      } else if (h.state !== 'sleep') {
        h.rig.body.rotation.z += (0 - h.rig.body.rotation.z) * Math.min(1, dt * 6);
      }

      if (h.state === 'stinky') {
        h.stinkT -= dt;
        if (!h.stationary) this.moveTowards(h, h.target, h.chaseSpeed, dt);
        h.rig.body.rotation.y = Math.sin(this.time * 20) * 0.15;
        if (h.stinkT <= 0) {
          h.state = 'patrol';
          h.rig.body.rotation.y = 0;
          h.target = kind === 'king' ? this.kingPatrolPoint() : this.world.freePoint(8);
        }
      }

      if (h.state === 'flee') {
        h.target.y = 0;
        if (this.moveTowards(h, h.target, h.chaseSpeed * 1.4, dt) || h.pos.distanceTo(h.target) < 3.5) {
          h.state = 'hidden';
          h.hideT = 25;
          h.rig.root.visible = false;
          h.setMarker('');
          if (h.dog) h.dog.freeT = 9999;
        }
        h.quipT -= dt;
        if (h.quipT <= 0) {
          h.quipT = 2.5;
          h.say(pick(SCARED_QUIPS), 2);
        }
      }

      if (h.state === 'sleep') {
        h.stunT -= dt;
        h.rig.body.rotation.z += (0.35 - h.rig.body.rotation.z) * Math.min(1, dt * 3);
        h.quipT -= dt;
        if (h.quipT <= 0) {
          h.quipT = 4;
          h.say(pick(SLEEP_QUIPS), 2);
        }
        const woke = p.sprinting && h.pos.distanceTo(p.pos) < 7;
        if (h.stunT <= 0 || woke) {
          h.state = woke ? 'curious' : 'patrol';
          h.suspicion = woke ? 0.5 : 0;
          h.lastSeen.copy(p.pos);
          h.sleepT = h.standPhase === 'up' ? 12 + Math.random() * 14 : 25 + Math.random() * 20;
          h.say(woke ? 'HUH?! *hic* Who\'s there?' : '*yawn* Where am I?');
        }
      }

      h.ignoreT = Math.max(0, h.ignoreT - dt);
      const vis = this.demo || h.ignoreT > 0 || h.oblivious ? { seen: false, dist: h.pos.distanceTo(p.pos), rate: 0 } : this.visibilityTo(h);
      h.canSee = vis.seen;

      if (!h.oblivious) {
        // Perception
        if (vis.seen) {
          h.suspicion += vis.rate * dt * (h.state === 'search' ? 1.8 : 1);
          h.lastSeen.copy(p.pos);
        } else if (!this.demo && p.orangeT <= 0 && p.sprinting && p.onGround && vis.dist < h.def.hearing * this.animal.noise) {
          h.suspicion += 0.45 * dt;
          h.lastSeen.copy(p.pos);
          if (h.state === 'patrol') h.state = 'curious';
        } else if (h.state !== 'alert') {
          h.suspicion -= dt * 0.3;
        }
        h.suspicion = Math.max(0, Math.min(1.2, h.suspicion));

        if (h.suspicion >= 1 && h.state !== 'alert') {
          h.state = 'alert';
          h.lostT = 0;
          // Fumbling for the safety buys the player a moment to dive into cover.
          h.aim = -0.7;
          sfx.alert();
          if (h.spotQuipCd <= 0) {
            h.say(kind === 'drone' ? `${critterNoun(this.animal.id)} at my chair! ${critterNoun(this.animal.id).toUpperCase()} AT MY CHAIR!`.replace(/^./, (c) => c.toUpperCase()) : pick(SPOT_QUIPS), 1.6);
            h.spotQuipCd = 6;
          }
          if (kind === 'drone') this.alertOthers(h.pos, 60, p.pos, h, ['Copy that, Dan!', 'Coming, Dan!']);
        } else if (h.state === 'patrol' && h.suspicion > 0.3) {
          h.state = 'curious';
        }

        switch (h.state) {
          case 'patrol': {
            if (h.standPhase === 'walk') {
              if (this.moveTowards(h, this.stands[h.standIdx].ladder, h.speed, dt)) {
                h.standPhase = 'climb';
                h.elev = 0;
              }
              break;
            }
            if (h.standPhase === 'up' && !this.demo && kind !== 'drunk') {
              // It's warm up there, and hunting is mostly waiting.
              h.sleepT -= dt;
              if (h.sleepT <= 0) {
                h.state = 'sleep';
                h.stunT = 12 + Math.random() * 8;
                h.quipT = 0;
              }
            }
            if (p.orangeT > 0 && vis.dist < 7) {
              h.quipT -= dt * 2;
              if (h.quipT <= 0) {
                h.quipT = 8 + Math.random() * 6;
                h.say(pick(['Mornin\'.', `Seen a ${critterNoun(this.animal.id)} around, pal?`, 'Nice vest. Cabela\'s?', `You look kinda... ${this.animal.id === 'duck' ? 'feathery' : 'furry'} today, Bob.`]));
              }
            }
            if (h.stationary) {
              h.yaw = h.baseYaw + Math.sin(this.time * 0.35 + h.phase) * 0.9;
            } else if (this.moveTowards(h, h.target, h.speed, dt)) {
              h.target = kind === 'king' ? this.kingPatrolPoint() : this.world.freePoint(8);
            }
            if (h.idn.look.tipsy) h.yaw += Math.sin(this.time * 1.7 + h.phase) * dt * 1.2;
            h.stuckT += dt;
            if (h.stuckT > 2.5) {
              if (h.pos.distanceTo(h.lastPos) < 0.5 && !h.stationary) h.target = kind === 'king' ? this.kingPatrolPoint() : this.world.freePoint(8);
              h.lastPos.copy(h.pos);
              h.stuckT = 0;
            }
            h.quipT -= dt;
            if (h.quipT <= 0) {
              h.quipT = 9 + Math.random() * 12;
              if (vis.dist < 45) h.say(h.unplugged ? 'Anyone got a charger? Anyone?' : pick(h.def.quips));
            }
            if (kind === 'drunk' && !this.demo) {
              h.sleepT -= dt;
              if (h.sleepT <= 0) {
                h.state = 'sleep';
                h.stunT = 10 + Math.random() * 6;
                h.quipT = 0;
              }
            }
            if (kind === 'trapper' && !this.demo) {
              h.trapT -= dt;
              const mine = this.traps.filter((t) => t.owner === h).length;
              if (h.trapT <= 0 && mine < 3 && h.pos.distanceTo(this.world.playerStart) > 14) {
                h.trapT = 14 + Math.random() * 8;
                this.placeTrap(h);
              }
            }
            break;
          }
          case 'curious':
            this.faceTowards(h, h.lastSeen.x, h.lastSeen.z, dt, 2.5);
            if (h.suspicion <= 0.05) {
              h.state = 'patrol';
              if (Math.random() < 0.5) h.say(pick(LOST_QUIPS));
            }
            break;
          case 'search':
            if (h.stationary || this.moveTowards(h, h.lastSeen, h.chaseSpeed * 0.8, dt)) {
              h.searchT += dt;
              h.yaw += dt * 1.5;
              if (h.searchT > 4) {
                h.state = 'patrol';
                h.suspicion = Math.min(h.suspicion, 0.2);
                h.target = kind === 'king' ? this.kingPatrolPoint() : this.world.freePoint(8);
                h.say(pick(LOST_QUIPS));
              }
            }
            if (h.stationary) this.faceTowards(h, h.lastSeen.x, h.lastSeen.z, dt, 2);
            break;
          case 'alert': {
            if (vis.seen) h.lostT = 0;
            else h.lostT += dt;
            if (h.lostT > 3.5) {
              h.state = 'search';
              h.searchT = 0;
              h.suspicion = 0.7;
              h.aim = 0;
              break;
            }
            if (h.def.projectile === 'none') {
              this.faceTowards(h, h.lastSeen.x, h.lastSeen.z, dt, 4);
              break;
            }
            if (kind === 'ebike') {
              // Rev up facing the critter, lock a straight line through where it is, then commit: no steering
              // mid-charge, so a sidestep makes him miss and sail on past.
              if (h.chargeTo && this.time > h.chargeEnd + 1) h.chargeTo = null;
              if (!h.chargeTo) {
                const aim = vis.seen ? p.pos : h.lastSeen;
                this.faceTowards(h, aim.x, aim.z, dt, 6);
                h.windT += dt;
                if (h.windT >= 0.7) {
                  const dir = aim.clone().sub(h.pos).setY(0);
                  if (dir.lengthSq() < 0.01) dir.copy(h.forward);
                  dir.normalize();
                  h.chargeTo = aim.clone().addScaledVector(dir, 22);
                  this.world.resolve(h.chargeTo, 0.9);
                  h.chargeEnd = this.time + h.pos.distanceTo(h.chargeTo) / h.chaseSpeed + 0.6;
                  h.chargeHit = false;
                  h.windT = 0;
                }
                break;
              }
              this.moveTowards(h, h.chargeTo, h.chaseSpeed, dt);
              if (!h.unplugged && Math.random() < dt * 2) sfx.hum(Math.max(0, 1 - vis.dist / 30));
              if (!h.unplugged && !h.chargeHit && vis.dist < 1.6 + p.radius && Math.abs(p.pos.y - h.pos.y) < 1.5) {
                this.damage(h);
                h.chargeHit = true;
                h.say(pick(['Sorry! On your left!', 'BIKE LANE!', 'New PR!']), 1.6);
              }
              if (Math.hypot(h.chargeTo.x - h.pos.x, h.chargeTo.z - h.pos.z) < 1.5 || this.time > h.chargeEnd) {
                // Coasts on, then loops back around for another pass.
                h.state = 'patrol';
                h.suspicion = 0;
                h.ignoreT = h.chargeHit ? 7 : 3;
                h.target = h.pos.clone().addScaledVector(h.forward, 18);
                this.world.resolve(h.target, 0.9);
                h.chargeTo = null;
              }
              break;
            }
            if (kind === 'king' && h.vulnerableT > 0) {
              // Fumbling with shells: he can't aim, and he's boopable from any side.
              h.rig.body.rotation.x = Math.sin(this.time * 12) * 0.08;
              break;
            }
            h.rig.body.rotation.x = 0;
            const off = this.faceTowards(h, h.lastSeen.x, h.lastSeen.z, dt, 6);
            if (vis.seen && off < 0.25) {
              h.aim += dt;
              if (kind === 'rifle' || kind === 'ghillie' || kind === 'hound' || kind === 'drunk') {
                laserOn = kind !== 'drunk';
                laserTarget = p.pos.clone().add(new THREE.Vector3(0, p.rig.height * 0.45, 0));
              }
              if (h.aim >= h.aimTime && h.reload <= 0) {
                this.fire(h, vis.dist);
                h.aim = 0;
                h.reload = h.def.reload;
                if (kind === 'king') {
                  h.vulnerableT = 3.2 - h.enrage * 0.4;
                  h.say(pick(['RELOADING! Nobody move!', 'Hold on, hold on, shells...', 'Where are my golden shells?!']), 2);
                }
              }
            } else {
              if (h.aim > 0) h.aim = Math.max(0, h.aim - dt);
              if (!vis.seen && !h.stationary) this.moveTowards(h, h.lastSeen, h.chaseSpeed, dt);
            }
            break;
          }
        }
      }

      // Markers
      if (h.state === 'sleep') h.setMarker('Zz');
      else if (kind === 'king' && h.vulnerableT > 0) h.setMarker('!!');
      else if (h.state === 'alert') h.setMarker('!');
      else if (h.state === 'curious' || h.state === 'search' || (h.suspicion > 0.3 && !h.oblivious)) h.setMarker('?');
      else h.setMarker('');
      if (!h.oblivious) maxSus = Math.max(maxSus, h.suspicion);

      // Laser sight
      if (laserOn) {
        const from = h.eye().add(new THREE.Vector3(0, -0.3, 0)).add(h.forward.multiplyScalar(0.8));
        const to = laserTarget ?? from.clone().add(h.forward.multiplyScalar(h.def.viewRange * 0.6));
        const pos = h.laser.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, from.x, from.y, from.z);
        pos.setXYZ(1, to.x, to.y, to.z);
        pos.needsUpdate = true;
        (h.laser.material as THREE.LineBasicMaterial).opacity = laserTarget ? 0.4 + 0.6 * Math.max(0, h.aim / h.aimTime) : 0.35;
        h.laser.visible = true;
      } else {
        h.laser.visible = false;
      }

      // Pose
      h.pos.y = this.world.height(h.pos.x, h.pos.z) + h.elev;
      h.rig.root.position.copy(h.pos);
      h.rig.root.rotation.y = h.yaw;
      if (h.idn.look.tipsy && h.state !== 'stunned' && h.state !== 'sleep') h.rig.body.rotation.z = Math.sin(this.time * 2.3 + h.phase) * 0.08;
      const walking = h.state === 'patrol' || h.state === 'search' || h.state === 'stinky' || h.state === 'flee' || (h.state === 'alert' && !h.canSee);
      const s = walking && !h.stationary ? Math.sin(h.phase) * 0.6 : 0;
      h.rig.legs.forEach((l, i) => (l.rotation.x = i ? s : -s));
      if (h.marker) h.marker.position.y = h.rig.height / h.rig.root.scale.x + 0.1 + Math.abs(Math.sin(this.time * 6)) * 0.2;

      h.cone.visible = sniffing && !h.oblivious;
      h.sniffTag.visible = sniffing;

      // Deer passive: smell nearby hunters.
      if (this.animal.id === 'deer' && (vis.dist < 34 || sniffing)) {
        const d = h.pos.clone().sub(p.pos);
        const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
        const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
        pings.push({
          angle: Math.atan2(d.dot(right), d.dot(fwd)),
          strength: Math.max(0, 1 - vis.dist / 34),
          color: h.state === 'alert' ? '#ff2a2a' : h.suspicion > 0.3 ? '#ffd23f' : '#ffffff',
        });
      }
    }
    for (const t of this.traps) t.tag.visible = sniffing;
    this.hud.setStealth(maxSus);
    this.hud.setPings(pings);
    const king = this.hunters.find((h) => h.kind === 'king');
    if (king) this.hud.setBoss(king.hatsLeft, 3, king.vulnerableT > 0);
  }

  private afterStun(h: Hunter) {
    const p = this.player;
    if (h.kind === 'king') {
      h.state = 'alert';
      h.suspicion = 1;
      h.lastSeen.copy(p.pos);
      h.aim = -0.4;
      return;
    }
    switch (h.idn.personality) {
      case 'scaredy':
        h.state = 'flee';
        h.target = this.nearestTruck(h.pos);
        h.quipT = 0;
        this.opts.onEvent({ type: 'scared' });
        break;
      case 'grumpy':
        h.state = 'alert';
        h.suspicion = 1;
        h.lostT = 0;
        h.lastSeen.copy(p.pos);
        h.aim = -0.7;
        h.say(pick(['THAT\'S IT!', 'Oh, it is ON now.', 'You\'re going on the WALL, pal!']));
        break;
      default:
        h.state = 'curious';
        h.suspicion = 0.4;
        h.lastSeen.copy(p.pos);
        h.say(pick(['Who did that?!', 'Ow, my pride.', 'I\'m OK! I\'m OK!']));
    }
  }

  private placeTrap(h: Hunter) {
    const obj = buildTrap();
    const pos = h.pos.clone().addScaledVector(h.forward, -1.2);
    pos.y = this.world.height(pos.x, pos.z);
    obj.position.copy(pos);
    obj.rotation.y = Math.random() * 6;
    this.world.scene.add(obj);
    const tag = textSprite('TRAP', { bg: 'rgba(220,40,40,0.9)', fg: '#fff', size: 0.03 });
    tag.material.sizeAttenuation = false;
    tag.position.y = 1;
    tag.visible = false;
    obj.add(tag);
    this.traps.push({ obj, pos, owner: h, sprung: 0, tag });
    if (Math.random() < 0.4) h.say('Aaand... trap goes here. I\'ll remember that.');
  }

  /** Hunters blunder into each other's traps too. */
  private updateTrapsForHunters() {
    for (const t of this.traps) {
      if (t.sprung > 0) continue;
      for (const h of this.hunters) {
        if (h === t.owner || h.oblivious || h.stationary || h.kind === 'king') continue;
        if (Math.hypot(h.pos.x - t.pos.x, h.pos.z - t.pos.z) < 0.8) {
          t.sprung = 0.01;
          this.knockDown(h, 4, 'trap');
          break;
        }
      }
    }
  }

  private updateArrows(dt: number) {
    const p = this.player;
    const center = p.pos.clone().add(new THREE.Vector3(0, p.rig.height * 0.45, 0));
    for (const a of this.arrows) {
      a.life -= dt;
      if (!a.stuck) {
        a.vel.y -= 4 * dt;
        a.pos.addScaledVector(a.vel, dt);
        a.mesh.position.copy(a.pos);
        a.mesh.lookAt(a.pos.clone().add(a.vel));
        if (a.pos.distanceTo(center) < p.radius + 0.35) {
          this.damage(a.owner);
          a.life = 0;
        } else if (a.pos.y < this.world.height(a.pos.x, a.pos.z) || (a.pos.distanceTo(a.owner.pos) > 2.5 && this.world.solidAt(a.pos.x, a.pos.y, a.pos.z))) {
          a.stuck = true;
          a.life = Math.min(a.life, 2);
        }
      }
      if (a.life <= 0) this.world.scene.remove(a.mesh);
    }
    this.arrows = this.arrows.filter((a) => a.life > 0);
  }

  private addFx(obj: THREE.Object3D, life: number, update?: Fx['update'], vel?: THREE.Vector3) {
    this.world.scene.add(obj);
    this.fx.push({ obj, life, max: life, update, vel });
  }

  private updateFx(dt: number) {
    for (const f of this.fx) {
      f.life -= dt;
      f.update?.(f, dt);
      if (f.life <= 0) this.world.scene.remove(f.obj);
    }
    this.fx = this.fx.filter((f) => f.life > 0);
    for (const c of this.clouds) {
      c.life -= dt;
      c.obj.rotation.y += dt * 0.5;
      c.obj.children.forEach((m, i) => (m.position.y += Math.sin(this.time * 2 + i) * dt * 0.3));
      if (c.life <= 0) this.world.scene.remove(c.obj);
    }
    this.clouds = this.clouds.filter((c) => c.life > 0);
  }

  private updateCamera(dt: number) {
    const inp = this.input;
    if (!this.demo) {
      this.camYaw -= inp.lookDX * 0.005;
      this.camPitch = Math.max(0.05, Math.min(1.25, this.camPitch + inp.lookDY * 0.004));
    }
    const p = this.player;
    const want = p.pos.clone().add(new THREE.Vector3(0, p.rig.height * 0.75, 0));
    this.camTarget.lerp(want, Math.min(1, dt * 10));
    if (this.time < 0.1) this.camTarget.copy(want);
    const dist = this.camDist * (p.flying ? 1.4 : 1);
    const off = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch),
    ).multiplyScalar(dist);
    const cam = this.camTarget.clone().add(off);
    const gh = this.world.height(cam.x, cam.z) + 0.6;
    if (cam.y < gh) cam.y = gh;
    if (this.shake > 0) {
      this.shake -= dt;
      cam.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0));
    }
    this.camera.position.copy(cam);
    this.camera.lookAt(this.camTarget);
    this.camera.up.copy(UP);

    // Keep the shadow camera centered on the player.
    const sun = this.world.sun;
    sun.position.set(p.pos.x + 30, p.pos.y + 50, p.pos.z + 20);
    sun.target.position.copy(p.pos);
  }

  private updateSky() {
    const surv = this.map.objectives.find((o) => o.type === 'survive');
    if (!surv) return;
    const k = Math.min(1, this.progress.survive / surv.count);
    const sunset = new THREE.Color(0xff9a5c);
    const dusk = new THREE.Color(0x40305e);
    const c = k < 0.6 ? this.skyBase.clone().lerp(sunset, k / 0.6) : sunset.clone().lerp(dusk, (k - 0.6) / 0.4);
    (this.world.scene.background as THREE.Color).copy(c);
    (this.world.scene.fog as THREE.FogExp2).color.copy(c);
    this.world.sun.intensity = 1.8 * (1 - k * 0.6);
  }

  private finish(win: boolean, killer?: Hunter) {
    if (this.ended) return;
    this.ended = true;
    if (win) sfx.win();
    else sfx.lose();
    haptic(win ? 'success' : 'heavy');
    this.input.reset();
    const stars = [win, win && this.hitsTaken === 0, win && this.time <= this.map.parTime];
    const result: GameResult = {
      win,
      time: this.time,
      hitsTaken: this.hitsTaken,
      stars,
      killer: killer?.name,
      killerKind: killer?.kind,
      hats: this.runHats,
      secretDone: !!this.secret?.done,
      kingDefeated: win && this.kingDefeated,
    };
    setTimeout(() => this.opts.onEnd(result), win ? 600 : 1200);
  }

  update(dt: number) {
    if (this.paused) return;
    dt = Math.min(dt, 1 / 20);
    if (this.demo) {
      this.time += dt;
      this.updateHunters(dt, false);
      this.updateFx(dt);
      this.player.rig.root.position.copy(this.player.pos);
      this.updateCamera(dt);
      return;
    }
    this.input.update();
    if (this.input.consume('Escape', 'KeyP')) {
      this.input.endFrame();
      this.opts.onPause();
      return;
    }
    if (!this.ended) {
      this.time += dt;
      if (this.map.objectives.some((o) => o.type === 'survive')) this.progress.survive = this.time;
      this.updatePlayer(dt);
      const sniffing = this.animal.id === 'deer' && this.player.abilityT > 0;
      this.updateHunters(dt, sniffing);
      this.updateTrapsForHunters();
      this.updateArrows(dt);
      this.updateSecret(dt);
      this.checkObjectives();
      this.updateSky();
      const p = this.player;
      this.hud.setHearts(p.hearts, this.animal.hearts);
      this.hud.setStamina(p.stamina, p.winded);
      this.hud.setTime(this.time);
      this.hud.setAbility(p.abilityCd / this.animal.ability.cooldown, p.abilityT > 0);
      this.hud.setFlying(p.flying);
      const bt = this.boopTarget();
      this.hud.setBoop(!!bt && (!!bt.prop || !!bt.stand || this.canBoop(bt.hunter!)));
      this.hud.setOrange(p.orangeHeld, p.orangeT / ORANGE_TIME);
    }
    this.updateFx(dt);
    this.updateCamera(dt);
    this.input.endFrame();
  }

  render() {
    this.renderer.render(this.world.scene, this.camera);
  }

  dispose() {
    this.hud.destroy();
    this.world.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
      if (o instanceof THREE.Sprite) (o.material as THREE.SpriteMaterial).map?.dispose();
    });
  }
}

/** Used by the menus to list who can show up on a map. */
export function hunterLineup(map: MapDef) {
  return (Object.entries(map.hunters) as [HunterKind, number][]).map(([k, n]) => ({ def: HUNTERS[k], count: n }));
}
