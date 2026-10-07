// One round of play: the player animal, the hunters, objectives, abilities and the camera.
import * as THREE from 'three';
import {
  BOOP_QUIPS, HIT_QUIPS, HUNTERS, LOST_QUIPS, MISS_QUIPS, SPOT_QUIPS, STINK_QUIPS,
  type AnimalDef, type HunterDef, type HunterKind, type MapDef, type ObjectiveType,
} from './data';
import { sfx } from './audio';
import { Hud, type ObjectiveView, type Ping } from './hud';
import { Input } from './input';
import { buildAnimal, buildFood, buildHatPickup, buildHunter, mat, textSprite, type Rig } from './models';
import { World } from './world';

export interface GameResult {
  win: boolean;
  time: number;
  hitsTaken: number;
  stars: boolean[];
  killer?: HunterDef;
  booped: number;
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const UP = new THREE.Vector3(0, 1, 0);

type HState = 'patrol' | 'curious' | 'alert' | 'search' | 'stunned' | 'stinky';

interface Fx {
  obj: THREE.Object3D;
  life: number;
  max: number;
  update?: (fx: Fx, dt: number) => void;
  vel?: THREE.Vector3;
}

class Hunter {
  rig: Rig;
  pos: THREE.Vector3;
  yaw = Math.random() * Math.PI * 2;
  baseYaw = this.yaw;
  state: HState = 'patrol';
  suspicion = 0;
  target: THREE.Vector3;
  lastSeen = new THREE.Vector3();
  aim = 0;
  reload = 0;
  lostT = 0;
  stunT = 0;
  stinkT = 0;
  searchT = 0;
  hatOn = true;
  quipT = 4 + Math.random() * 10;
  bubble: THREE.Sprite | null = null;
  bubbleT = 0;
  marker: THREE.Sprite | null = null;
  markerKind = '';
  phase = Math.random() * 10;
  stuckT = 0;
  lastPos = new THREE.Vector3();
  laser: THREE.Line;
  cone: THREE.Mesh;
  sniffTag: THREE.Sprite;
  canSee = false;
  spotQuipCd = 0;
  /** Seconds during which this hunter ignores the player (e.g. e-bike recharging after a ram). */
  ignoreT = 0;

  constructor(public def: HunterDef, pos: THREE.Vector3, scene: THREE.Scene) {
    this.rig = buildHunter(def.kind, def.vest);
    this.pos = pos.clone();
    this.target = pos.clone();
    this.rig.root.position.copy(pos);
    scene.add(this.rig.root);

    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0 }));
    this.laser.frustumCulled = false;
    scene.add(this.laser);

    const coneGeo = new THREE.CircleGeometry(def.viewRange, 18, -Math.PI / 2 - def.fov, def.fov * 2).rotateX(-Math.PI / 2);
    this.cone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.cone.position.y = 0.4;
    this.cone.visible = false;
    this.rig.root.add(this.cone);

    this.sniffTag = textSprite(`👃 ${def.name}`, { bg: 'rgba(255,60,60,0.9)', fg: '#fff', size: 0.035 });
    // Screen-space size so the tag is readable at any distance.
    this.sniffTag.material.sizeAttenuation = false;
    this.sniffTag.position.y = this.rig.height + 1.6;
    this.sniffTag.visible = false;
    this.rig.root.add(this.sniffTag);
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  eye() {
    return this.pos.clone().add(new THREE.Vector3(0, this.def.kind === 'ghillie' ? 1.2 : 1.9, 0));
  }

  say(text: string, dur = 2.6) {
    if (this.bubble) {
      this.rig.root.remove(this.bubble);
      (this.bubble.material as THREE.SpriteMaterial).map?.dispose();
    }
    this.bubble = textSprite(text, { size: 0.75 });
    this.bubble.position.y = this.rig.height + 0.9;
    this.rig.root.add(this.bubble);
    this.bubbleT = dur;
  }

  setMarker(kind: '' | '?' | '!') {
    if (kind === this.markerKind) return;
    this.markerKind = kind;
    if (this.marker) {
      this.rig.root.remove(this.marker);
      (this.marker.material as THREE.SpriteMaterial).map?.dispose();
      this.marker = null;
    }
    if (kind) {
      this.marker = textSprite(kind, { bg: 'none', fg: kind === '!' ? '#ff2a2a' : '#ffd23f', size: 1.6 });
      this.marker.position.y = this.rig.height + 0.1;
      this.rig.root.add(this.marker);
    }
  }
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
  clouds: { pos: THREE.Vector3; r: number; life: number; obj: THREE.Group }[] = [];
  fx: Fx[] = [];
  progress: Record<ObjectiveType, number> = { eat: 0, boop: 0, survive: 0, exit: 0, rescue: 0 };
  time = 0;
  hitsTaken = 0;
  camYaw = 0;
  camPitch = 0.38;
  camDist: number;
  shake = 0;
  paused = false;
  ended = false;
  exitOpen = false;
  private skyBase: THREE.Color;
  private camTarget = new THREE.Vector3();

  constructor(
    private renderer: THREE.WebGLRenderer,
    private input: Input,
    public map: MapDef,
    public animal: AnimalDef,
    hudParent: HTMLElement,
    private onEnd: (r: GameResult) => void,
    private onPause: () => void,
    /** Menu-backdrop mode: no input, nobody notices the player, nothing ends. */
    private demo = false,
  ) {
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
      radius: animal.id === 'bear' ? 1.0 : animal.id === 'deer' ? 0.7 : 0.45,
      phase: 0,
      stamina: 1,
      winded: false,
    };
    this.camDist = animal.id === 'bear' ? 10 : animal.id === 'deer' ? 8 : 6.5;

    this.hud = new Hud(hudParent, animal, input.isTouch, {
      ability: () => input.tap('KeyE'),
      boop: () => input.tap('KeyF'),
      jump: () => input.tap('Space'),
      pause: () => this.onPause(),
    });

    this.spawnHunters();
    this.spawnObjectives();
    this.onResize();
    this.hud.toast(`${map.name}: ${map.objectives.map((o) => o.label).join(', then ')}`, 'info');
  }

  private spawnHunters() {
    const start = this.world.playerStart;
    for (const [kind, count] of Object.entries(this.map.hunters) as [HunterKind, number][]) {
      for (let i = 0; i < count; i++) {
        const p = this.world.freePoint(10, start, 45);
        const h = new Hunter(HUNTERS[kind], p, this.world.scene);
        h.target = this.world.freePoint(8);
        if (kind === 'ghillie') h.yaw = h.baseYaw = Math.atan2(start.x - p.x, start.z - p.z) + (Math.random() - 0.5);
        this.hunters.push(h);
        // Ghillie Gus doesn't move, so he doesn't need to be pushed out of anything.
        if (kind !== 'ghillie') this.world.resolve(h.pos, 0.5);
      }
    }
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
      if (o.type === 'rescue') {
        for (let i = 0; i < o.count; i++) {
          const p = this.world.freePoint(10, start, 50);
          const rig = buildAnimal(this.animal.id, this.animal.color, this.animal.accent, 0.5);
          rig.root.position.copy(p);
          this.world.scene.add(rig.root);
          const tag = textSprite('Mom?! 😭', { size: 0.6 });
          tag.position.y = 3.2;
          tag.name = 'tag';
          rig.root.add(tag);
          this.babies.push({ rig, pos: p, following: false, yaw: 0, phase: 0 });
        }
      }
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
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
      this.world.exitGroup.visible = true;
      this.hud.toast(this.map.snow ? 'Head to the cave! Follow the light!' : 'The fence gap is open! Follow the light!', 'good');
      sfx.rescue();
    }
    if (views.every((v) => v.done)) this.finish(true);
  }

  // --- Player -----------------------------------------------------------

  private useAbility() {
    const p = this.player;
    if (p.abilityCd > 0) return;
    const a = this.animal.ability;
    p.abilityCd = a.cooldown;
    p.abilityT = a.duration;
    switch (this.animal.id) {
      case 'deer':
        sfx.sniff();
        this.hud.toast('*SNIIIIFF* You smell... hunters. And Axe body spray.', 'info');
        break;
      case 'rabbit':
        sfx.boing();
        p.vel.y = this.animal.jump * 1.7;
        p.onGround = false;
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
        this.clouds.push({ pos: p.pos.clone(), r: 7, life: a.duration, obj: g });
        break;
      }
      case 'bear': {
        sfx.roar();
        this.shake = 0.6;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 4, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
        ring.position.copy(p.pos).add(new THREE.Vector3(0, 1, 0));
        this.addFx(ring, 0.6, (fx) => {
          const k = 1 - fx.life / fx.max;
          fx.obj.scale.setScalar(1 + k * 13);
          ((fx.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k;
        });
        for (const h of this.hunters) {
          if (h.pos.distanceTo(p.pos) < 13) this.knockDown(h, 4.5, true);
        }
        break;
      }
      case 'duck':
        sfx.quack();
        p.flying = true;
        this.hud.toast('🦆 IT\'S DUCK SEASON (shotguns can see you!)', 'bad');
        break;
    }
  }

  private tryBoop() {
    const p = this.player;
    let best: Hunter | null = null;
    let bestD = 2.8 + p.radius;
    for (const h of this.hunters) {
      const d = h.pos.distanceTo(p.pos);
      if (d < bestD) {
        best = h;
        bestD = d;
      }
    }
    if (!best) return;
    if (this.canBoop(best)) {
      sfx.boop();
      this.knockDown(best, 5, false);
    } else {
      best.suspicion = 1;
      best.state = 'alert';
      best.lastSeen.copy(p.pos);
      best.say('HEY! I see you!');
      sfx.alert();
    }
  }

  private canBoop(h: Hunter) {
    if (h.state === 'stunned') return false;
    if (h.state === 'stinky') return true;
    const toP = this.player.pos.clone().sub(h.pos).setY(0).normalize();
    const behind = toP.dot(h.forward) < -0.1;
    return behind && h.state !== 'alert';
  }

  private knockDown(h: Hunter, dur: number, roar: boolean) {
    h.state = 'stunned';
    h.stunT = dur;
    h.suspicion = 0;
    h.aim = 0;
    h.setMarker('');
    if (h.hatOn) {
      h.hatOn = false;
      this.progress.boop++;
      if (h.rig.hat) {
        const world = new THREE.Vector3();
        h.rig.hat.getWorldPosition(world);
        h.rig.hat.visible = false;
        const flying = buildHatPickup();
        flying.position.copy(world);
        this.addFx(flying, 1.4, (fx, dt) => {
          fx.vel!.y -= 15 * dt;
          fx.obj.position.addScaledVector(fx.vel!, dt);
          fx.obj.rotation.x += dt * 10;
        }, new THREE.Vector3((Math.random() - 0.5) * 4, 8, (Math.random() - 0.5) * 4));
      }
      h.say(roar ? 'AAAAH! BEAR!' : pick(BOOP_QUIPS));
      this.hud.toast(roar ? `${h.def.name} dropped his hat!` : `BOOPED ${h.def.name}! Hat stolen 🧢`, 'good');
    } else {
      h.say(roar ? 'Not the bear again!' : 'I don\'t even HAVE a hat!');
    }
  }

  private damage(source: Hunter) {
    const p = this.player;
    if (p.invuln > 0 || this.ended) return;
    p.hearts--;
    p.invuln = 2;
    this.hitsTaken++;
    sfx.hit();
    this.hud.hurt();
    this.shake = 0.35;
    this.hud.toast(`${pick(HIT_QUIPS)} (${source.def.name})`, 'bad');
    if (p.hearts <= 0) {
      this.finish(false, source.def);
    }
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    const a = this.animal;
    const inp = this.input;
    const w = this.world;

    if (inp.consume('KeyE', 'KeyQ')) this.useAbility();
    if (inp.consume('KeyF')) this.tryBoop();

    p.abilityCd = Math.max(0, p.abilityCd - dt);
    p.abilityT = Math.max(0, p.abilityT - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.flying && p.abilityT <= 0) p.flying = false;

    // Movement relative to camera.
    const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const dir = fwd.multiplyScalar(-inp.moveY).add(right.multiplyScalar(inp.moveX));
    const mag = Math.min(1, dir.length());
    p.moving = mag > 0.05;
    p.sprinting = p.moving && inp.sprint && !p.winded && !p.flying;
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

    const ground = w.height(p.pos.x, p.pos.z);
    if (p.flying) {
      const targetY = ground + 11;
      p.pos.y += (targetY - p.pos.y) * Math.min(1, dt * 3);
      p.vel.y = 0;
      p.onGround = false;
    } else {
      if (inp.consume('Space') && p.onGround) {
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
    r.root.rotation.y = p.yaw;
    p.phase += dt * (p.moving ? speed * 1.6 : 0);
    const swing = p.moving && p.onGround ? Math.sin(p.phase) * 0.7 : 0;
    r.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? swing : -swing) * (a.id === 'duck' ? 0.8 : 1)));
    if (a.id === 'rabbit' && p.moving && p.onGround) r.body.position.y = Math.abs(Math.sin(p.phase * 0.5)) * 0.4;
    else r.body.position.y = p.moving && p.onGround ? Math.abs(Math.sin(p.phase)) * 0.08 : 0;
    r.body.rotation.x = !p.onGround && !p.flying ? -Math.sign(p.vel.y) * 0.25 : 0;
    if (r.wings) r.wings.forEach((wg, i) => (wg.rotation.z = p.flying || !p.onGround ? Math.sin(this.time * 25) * 0.9 * (i ? 1 : -1) : 0));
    r.root.visible = p.invuln > 0 ? Math.floor(this.time * 15) % 2 === 0 : true;

    // Food
    for (const f of this.foods) {
      if (f.eaten) {
        continue;
      }
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
      this.world.exitGroup.rotation.y += dt;
      const e = this.world.exitPos;
      if (Math.hypot(p.pos.x - e.x, p.pos.z - e.z) < 4.5) this.progress.exit = 1;
    }
  }

  // --- Hunters ----------------------------------------------------------

  private visibilityTo(h: Hunter): { seen: boolean; dist: number; rate: number } {
    const p = this.player;
    const eye = h.eye();
    const target = p.pos.clone().add(new THREE.Vector3(0, p.rig.height * 0.5, 0));
    const to = target.clone().sub(eye);
    const dist = Math.hypot(to.x, to.z);
    const duckSeason = p.flying && h.def.kind === 'shotgun';
    let vis = this.animal.visibility;
    if (!p.moving) vis *= 0.55;
    else if (p.sprinting) vis *= 1.2;
    else vis *= 0.8;
    if (!p.flying && this.world.inBush(p.pos.x, p.pos.z) && dist > 3.5) vis *= 0.28;
    if (p.flying) vis *= duckSeason ? 2.2 : 1.0;
    if (this.map.snow && this.animal.id !== 'rabbit') vis *= 1.1;
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
    this.faceTowards(h, target.x, target.z, dt, h.def.kind === 'ebike' ? 3 : 5);
    h.pos.addScaledVector(h.forward, Math.min(d, speed * dt));
    this.world.resolve(h.pos, h.def.kind === 'ebike' ? 0.9 : 0.5);
    h.phase += dt * speed * 2.2;
    return false;
  }

  private alertOthers(origin: THREE.Vector3, radius: number, where: THREE.Vector3, except: Hunter) {
    if (radius <= 0) return;
    for (const o of this.hunters) {
      if (o === except || o.state === 'stunned' || o.state === 'stinky' || o.state === 'alert') continue;
      if (o.pos.distanceTo(origin) > radius) continue;
      o.suspicion = Math.max(o.suspicion, 0.6);
      o.lastSeen.copy(where);
      o.state = 'search';
      o.searchT = 0;
      if (Math.random() < 0.5) o.say(pick(['Was that Randy?', 'Shots fired! Free venison!', 'Ooh, where?!', 'Save some for me!']));
    }
  }

  private fire(h: Hunter, dist: number) {
    const p = this.player;
    const from = h.eye().add(h.forward.multiplyScalar(0.9)).add(new THREE.Vector3(0, -0.3, 0));
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

    let chance = h.def.accuracy;
    if (p.sprinting) chance -= 0.3;
    else if (p.moving) chance -= 0.12;
    chance -= (dist / h.def.viewRange) * 0.35;
    if (kind === 'pellets') chance += dist < 8 ? 0.2 : -0.15;
    if (p.flying && h.def.kind === 'shotgun') chance += 0.15;
    if (this.animal.id === 'rabbit') chance -= 0.1;
    if (!p.onGround && !p.flying) chance -= 0.2;
    if (this.animal.id === 'bear') chance += 0.08;
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

  private updateHunters(dt: number, sniffing: boolean) {
    const p = this.player;
    let maxSus = 0;
    const pings: Ping[] = [];

    for (const h of this.hunters) {
      const kind = h.def.kind;
      h.reload = Math.max(0, h.reload - dt);
      h.spotQuipCd = Math.max(0, h.spotQuipCd - dt);
      if (h.bubble) {
        h.bubbleT -= dt;
        if (h.bubbleT <= 0) {
          h.rig.root.remove(h.bubble);
          (h.bubble.material as THREE.SpriteMaterial).map?.dispose();
          h.bubble = null;
        }
      }

      // Stink clouds override everything.
      if (h.state !== 'stunned') {
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
          }
        }
      }

      let laserOn = kind === 'ghillie' && h.state !== 'stunned' && h.state !== 'stinky';
      let laserTarget: THREE.Vector3 | null = null;

      if (h.state === 'stunned') {
        h.stunT -= dt;
        h.rig.body.rotation.z += (Math.PI / 2 - h.rig.body.rotation.z) * Math.min(1, dt * 8);
        if (h.stunT <= 0) {
          h.state = 'curious';
          h.suspicion = 0.4;
          h.lastSeen.copy(p.pos);
          h.say(pick(['Who did that?!', 'Ow, my pride.', 'I\'m OK! I\'m OK!']));
        }
      } else {
        h.rig.body.rotation.z += (0 - h.rig.body.rotation.z) * Math.min(1, dt * 6);
      }

      if (h.state === 'stinky') {
        h.stinkT -= dt;
        if (kind !== 'ghillie') this.moveTowards(h, h.target, h.def.chaseSpeed, dt);
        h.rig.body.rotation.y = Math.sin(this.time * 20) * 0.15;
        if (h.stinkT <= 0) {
          h.state = 'patrol';
          h.rig.body.rotation.y = 0;
          h.target = this.world.freePoint(8);
        }
      }

      h.ignoreT = Math.max(0, h.ignoreT - dt);
      const vis = this.demo || h.ignoreT > 0 || h.state === 'stunned' || h.state === 'stinky' ? { seen: false, dist: h.pos.distanceTo(p.pos), rate: 0 } : this.visibilityTo(h);
      h.canSee = vis.seen;

      if (h.state !== 'stunned' && h.state !== 'stinky') {
        // Perception
        if (vis.seen) {
          h.suspicion += vis.rate * dt * (h.state === 'search' ? 1.8 : 1);
          h.lastSeen.copy(p.pos);
        } else if (p.sprinting && p.onGround && vis.dist < h.def.hearing * this.animal.noise) {
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
            h.say(pick(SPOT_QUIPS), 1.6);
            h.spotQuipCd = 6;
          }
        } else if (h.state === 'patrol' && h.suspicion > 0.3) {
          h.state = 'curious';
        }

        switch (h.state) {
          case 'patrol': {
            if (kind === 'ghillie') {
              h.yaw = h.baseYaw + Math.sin(this.time * 0.35 + h.phase) * 0.9;
            } else if (this.moveTowards(h, h.target, h.def.speed, dt)) {
              h.target = this.world.freePoint(8);
            }
            h.stuckT += dt;
            if (h.stuckT > 2.5) {
              if (h.pos.distanceTo(h.lastPos) < 0.5 && kind !== 'ghillie') h.target = this.world.freePoint(8);
              h.lastPos.copy(h.pos);
              h.stuckT = 0;
            }
            h.quipT -= dt;
            if (h.quipT <= 0) {
              h.quipT = 9 + Math.random() * 12;
              if (vis.dist < 45) h.say(pick(h.def.quips));
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
            if (kind === 'ghillie' || this.moveTowards(h, h.lastSeen, h.def.chaseSpeed * 0.8, dt)) {
              h.searchT += dt;
              h.yaw += dt * 1.5;
              if (h.searchT > 4) {
                h.state = 'patrol';
                h.suspicion = Math.min(h.suspicion, 0.2);
                h.target = this.world.freePoint(8);
                h.say(pick(LOST_QUIPS));
              }
            }
            if (kind === 'ghillie') this.faceTowards(h, h.lastSeen.x, h.lastSeen.z, dt, 2);
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
            if (kind === 'ebike') {
              this.moveTowards(h, vis.seen ? p.pos : h.lastSeen, h.def.chaseSpeed, dt);
              if (Math.random() < dt * 2) sfx.hum(Math.max(0, 1 - vis.dist / 30));
              if (vis.dist < 1.6 + p.radius && h.reload <= 0 && Math.abs(p.pos.y - h.pos.y) < 1.5) {
                this.damage(h);
                h.reload = h.def.reload;
                h.say(pick(['Sorry! On your left!', 'BIKE LANE!', 'New PR!']), 1.6);
                // He overshoots and has to do a whole lap before coming back around.
                h.state = 'patrol';
                h.suspicion = 0;
                h.ignoreT = 8;
                h.target = h.pos.clone().addScaledVector(h.forward, 30);
                this.world.resolve(h.target, 0.9);
              }
              break;
            }
            const off = this.faceTowards(h, h.lastSeen.x, h.lastSeen.z, dt, 6);
            if (vis.seen && off < 0.25) {
              h.aim += dt;
              if (kind === 'rifle' || kind === 'ghillie') {
                laserOn = true;
                laserTarget = p.pos.clone().add(new THREE.Vector3(0, p.rig.height * 0.45, 0));
              }
              if (h.aim >= h.def.aimTime && h.reload <= 0) {
                this.fire(h, vis.dist);
                h.aim = 0;
                h.reload = h.def.reload;
              }
            } else {
              if (h.aim > 0) h.aim = Math.max(0, h.aim - dt);
              if (!vis.seen && kind !== 'ghillie') this.moveTowards(h, h.lastSeen, h.def.chaseSpeed, dt);
            }
            break;
          }
        }
      }

      // Markers
      if (h.state === 'alert') h.setMarker('!');
      else if (h.state === 'curious' || h.state === 'search' || h.suspicion > 0.3) h.setMarker('?');
      else h.setMarker('');
      if (h.state !== 'stunned' && h.state !== 'stinky') maxSus = Math.max(maxSus, h.suspicion);

      // Laser sight
      if (laserOn) {
        const from = h.eye().add(new THREE.Vector3(0, -0.3, 0)).add(h.forward.multiplyScalar(0.8));
        const to = laserTarget ?? from.clone().add(h.forward.multiplyScalar(h.def.viewRange * 0.6));
        const pos = h.laser.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, from.x, from.y, from.z);
        pos.setXYZ(1, to.x, to.y, to.z);
        pos.needsUpdate = true;
        (h.laser.material as THREE.LineBasicMaterial).opacity = laserTarget ? 0.4 + 0.6 * (h.aim / h.def.aimTime) : 0.35;
        h.laser.visible = true;
      } else {
        h.laser.visible = false;
      }

      // Pose
      h.pos.y = this.world.height(h.pos.x, h.pos.z);
      h.rig.root.position.copy(h.pos);
      h.rig.root.rotation.y = h.yaw;
      const walking = h.state === 'patrol' || h.state === 'search' || h.state === 'stinky' || (h.state === 'alert' && !h.canSee);
      const s = walking && kind !== 'ghillie' ? Math.sin(h.phase) * 0.6 : 0;
      h.rig.legs.forEach((l, i) => (l.rotation.x = i ? s : -s));
      if (h.marker) h.marker.position.y = h.rig.height + 0.1 + Math.abs(Math.sin(this.time * 6)) * 0.2;

      h.cone.visible = sniffing;
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
    this.hud.setStealth(maxSus);
    this.hud.setPings(pings);
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
        } else if (a.pos.y < this.world.height(a.pos.x, a.pos.z)) {
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

  private finish(win: boolean, killer?: HunterDef) {
    if (this.ended) return;
    this.ended = true;
    if (win) sfx.win();
    else sfx.lose();
    this.input.reset();
    const stars = [win, win && this.hitsTaken === 0, win && this.time <= this.map.parTime];
    setTimeout(() => this.onEnd({ win, time: this.time, hitsTaken: this.hitsTaken, stars, killer, booped: this.progress.boop }), win ? 600 : 1200);
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
      this.onPause();
      return;
    }
    if (!this.ended) {
      this.time += dt;
      if (this.map.objectives.some((o) => o.type === 'survive')) this.progress.survive = this.time;
      this.updatePlayer(dt);
      const sniffing = this.animal.id === 'deer' && this.player.abilityT > 0;
      this.updateHunters(dt, sniffing);
      this.updateArrows(dt);
      this.checkObjectives();
      this.updateSky();
      const p = this.player;
      this.hud.setHearts(p.hearts, this.animal.hearts);
      this.hud.setStamina(p.stamina, p.winded);
      this.hud.setTime(this.time);
      this.hud.setAbility(p.abilityCd / this.animal.ability.cooldown, p.abilityT > 0);
      this.hud.setFlying(p.flying);
      this.hud.setBoop(this.hunters.some((h) => h.pos.distanceTo(p.pos) < 2.8 + p.radius && this.canBoop(h)));
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
