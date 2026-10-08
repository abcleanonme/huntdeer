// Individual hunters: who they are (name, looks, stats, personality) and their per-frame state.
import * as THREE from 'three';
import { FIRST_NAMES, HUNTERS, NICKNAMES, type HunterDef, type HunterKind } from './data';
import { buildDog, buildDrone, buildHunter, textSprite, type HunterLook, type Rig } from './models';

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export type Personality = 'brave' | 'scaredy' | 'grumpy';

export interface HunterIdentity {
  id: string;
  kind: HunterKind;
  first: string;
  nick: string | null;
  look: HunterLook;
  weightLbs: number;
  heightIn: number;
  statValue: number;
  personality: Personality;
}

export const PERSONALITY_LABEL: Record<Personality, string> = {
  brave: 'Stubborn',
  scaredy: 'Easily spooked',
  grumpy: 'Short fuse',
};

const SKIN = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x6b4226];
const BEARD = [0x6b4423, 0xb5651d, 0x9e9e9e, 0x2b1d12, 0xe6c27a, 0xd7ccc8];
const SHIRT = [0x8b2e2e, 0x2e4a8b, 0x2e6b3a, 0x5d4037, 0x455a64, 0x6a1b9a, 0xb71c1c, 0x1b5e20];
const PANTS = [0x6b5a45, 0x5b6b3a, 0x37474f, 0x3e2723, 0x4e5b31, 0x283593];

export function displayName(idn: HunterIdentity) {
  const def = HUNTERS[idn.kind];
  if (idn.kind === 'king') return def.name;
  return `${def.title} ${idn.first}${idn.nick ? ` "${idn.nick}"` : ''}`;
}

export function formatHeight(inches: number) {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

/** Roll a brand new hunter of the given kind. */
export function rollIdentity(kind: HunterKind, allowGolden: boolean): HunterIdentity {
  const def = HUNTERS[kind];
  const golden = allowGolden && kind !== 'king' && Math.random() < 0.05;
  const tipsy = kind === 'drunk' || (kind !== 'king' && kind !== 'ghillie' && Math.random() < 0.15);
  const belly = kind === 'king' ? 1.5 : rand(0.6, 1.5);
  const height = kind === 'king' ? 1 : rand(0.9, 1.1);
  const vest = pick(def.vests);
  const look: HunterLook = {
    vest,
    shirt: pick(SHIRT),
    pants: pick(PANTS),
    skin: pick(SKIN),
    beard: Math.random() < 0.3 ? null : pick(BEARD),
    hatColor: kind === 'bow' ? pick([0x4d5a2e, 0x6b5a3a, 0x8d6e63]) : kind === 'drone' ? pick([0x263238, 0xd32f2f, 0x1565c0]) : vest,
    belly,
    height,
    golden,
    tipsy,
  };
  const personality: Personality = kind === 'king' ? 'grumpy' : pick(['brave', 'brave', 'brave', 'scaredy', 'scaredy', 'grumpy']);
  const statValue = Math.round(rand(def.stat.min, def.stat.max) * (golden ? 1.3 : 1));
  return {
    id: Math.random().toString(36).slice(2, 10),
    kind,
    first: kind === 'king' ? 'Reginald' : pick(FIRST_NAMES),
    nick: kind !== 'king' && Math.random() < 0.35 ? pick(NICKNAMES) : null,
    look,
    weightLbs: Math.round(kind === 'king' ? 340 : 140 + belly * 80 + (height - 0.9) * 150 + rand(-10, 10)),
    heightIn: kind === 'king' ? 78 : Math.round(64 + ((height - 0.9) / 0.2) * 13),
    statValue,
    personality,
  };
}

/** "Doe & Crockett" score: the hunting-game trophy score, but for hunters. */
export function trophyScore(idn: HunterIdentity) {
  const def = HUNTERS[idn.kind];
  const statNorm = def.stat.max > def.stat.min ? (idn.statValue - def.stat.min) / (def.stat.max - def.stat.min) : 1;
  return Math.round(idn.weightLbs * 0.3 + idn.heightIn * 0.8 + Math.min(1.3, statNorm) * 60 + (idn.look.golden ? 50 : 0) + (idn.kind === 'king' ? 200 : 0));
}

export type HState = 'patrol' | 'curious' | 'alert' | 'search' | 'stunned' | 'stinky' | 'sleep' | 'flee' | 'hidden';

export interface Dog {
  rig: Rig;
  pos: THREE.Vector3;
  yaw: number;
  phase: number;
  barkT: number;
  /** Once his handler is booped (or he smells a skunk) the dog wanders off happily. */
  freeT: number;
  bubble: THREE.Sprite | null;
}

export interface Drone {
  obj: THREE.Group;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  light: THREE.Mesh;
  alertCd: number;
  crashed: boolean;
  vy: number;
}

export class Hunter {
  def: HunterDef;
  rig: Rig;
  pos: THREE.Vector3;
  yaw = Math.random() * Math.PI * 2;
  baseYaw = this.yaw;
  state: HState = 'patrol';
  suspicion = 0;
  target: THREE.Vector3;
  lastSeen = new THREE.Vector3();
  home: THREE.Vector3;
  aim = 0;
  reload = 0;
  lostT = 0;
  stunT = 0;
  stinkT = 0;
  searchT = 0;
  hideT = 0;
  sleepT = 25 + Math.random() * 20;
  trapT = 6 + Math.random() * 8;
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
  /** E-bike with its charger unplugged. */
  unplugged = false;
  dog: Dog | null = null;
  drone: Drone | null = null;
  // Trophy King only
  hatsLeft = 0;
  vulnerableT = 0;
  enrage = 0;

  constructor(public idn: HunterIdentity, pos: THREE.Vector3, scene: THREE.Scene) {
    this.def = HUNTERS[idn.kind];
    const def = this.def;
    this.rig = buildHunter(idn.kind, idn.look);
    this.pos = pos.clone();
    this.home = pos.clone();
    this.target = pos.clone();
    this.rig.root.position.copy(pos);
    scene.add(this.rig.root);
    if (idn.kind === 'king') this.hatsLeft = 3;

    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0 }));
    this.laser.frustumCulled = false;
    this.laser.visible = false;
    scene.add(this.laser);

    const coneGeo = new THREE.CircleGeometry(def.viewRange, 18, -Math.PI / 2 - def.fov, def.fov * 2).rotateX(-Math.PI / 2);
    this.cone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.cone.position.y = 0.4;
    this.cone.scale.setScalar(1 / this.rig.root.scale.x);
    this.cone.visible = false;
    this.rig.root.add(this.cone);

    this.sniffTag = textSprite(this.name, { bg: 'rgba(220,40,40,0.9)', fg: '#fff', size: 0.035 });
    // Screen-space size so the tag is readable at any distance.
    this.sniffTag.material.sizeAttenuation = false;
    this.sniffTag.position.y = this.rig.height / this.rig.root.scale.x + 1.6;
    this.sniffTag.visible = false;
    this.rig.root.add(this.sniffTag);

    if (idn.kind === 'hound') {
      const rig = buildDog();
      scene.add(rig.root);
      this.dog = { rig, pos: pos.clone().add(new THREE.Vector3(1.5, 0, 1.5)), yaw: 0, phase: 0, barkT: 0, freeT: 0, bubble: null };
    }
    if (idn.kind === 'drone') {
      const obj = buildDrone();
      const light = new THREE.Mesh(
        new THREE.ConeGeometry(5, 10, 16, 1, true).translate(0, -5, 0),
        new THREE.MeshBasicMaterial({ color: 0xfff59d, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
      );
      obj.add(light);
      scene.add(obj);
      const dpos = pos.clone().add(new THREE.Vector3(0, 10, 0));
      this.drone = { obj, pos: dpos, target: dpos.clone(), light, alertCd: 0, crashed: false, vy: 0 };
    }
  }

  get name() {
    return displayName(this.idn);
  }

  get kind() {
    return this.idn.kind;
  }

  /** Stationary hunters never walk anywhere. */
  get stationary() {
    return this.kind === 'ghillie' || this.kind === 'drone';
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get accuracy() {
    return this.def.accuracy * (this.idn.look.tipsy && this.kind !== 'drunk' ? 0.7 : 1) * (1 + this.enrage * 0.1);
  }

  get speed() {
    if (this.unplugged) return 1.4;
    return this.def.speed * (1 + this.enrage * 0.2);
  }

  get chaseSpeed() {
    if (this.unplugged) return 2.2;
    return this.def.chaseSpeed * (1 + this.enrage * 0.2);
  }

  get aimTime() {
    return this.def.aimTime * (1 - this.enrage * 0.15);
  }

  /** Not currently in the game (ran home to the truck, or out cold) for the purposes of noticing anything. */
  get oblivious() {
    return this.state === 'stunned' || this.state === 'stinky' || this.state === 'sleep' || this.state === 'flee' || this.state === 'hidden';
  }

  eye() {
    const h = this.kind === 'ghillie' ? 1.2 : this.kind === 'drone' ? 1.5 : 1.9;
    return this.pos.clone().add(new THREE.Vector3(0, h * this.rig.root.scale.y, 0));
  }

  say(text: string, dur = 2.6) {
    if (this.bubble) {
      this.rig.root.remove(this.bubble);
      (this.bubble.material as THREE.SpriteMaterial).map?.dispose();
    }
    this.bubble = textSprite(text, { size: 0.75 / this.rig.root.scale.x });
    this.bubble.position.y = this.rig.height / this.rig.root.scale.x + 0.9;
    this.rig.root.add(this.bubble);
    this.bubbleT = dur;
  }

  setMarker(kind: '' | '?' | '!' | 'Zz' | '!!') {
    if (kind === this.markerKind) return;
    this.markerKind = kind;
    if (this.marker) {
      this.rig.root.remove(this.marker);
      (this.marker.material as THREE.SpriteMaterial).map?.dispose();
      this.marker = null;
    }
    if (kind) {
      const color = kind === '!' ? '#ff2a2a' : kind === 'Zz' ? '#9ecbff' : kind === '!!' ? '#ffe14d' : '#ffd23f';
      this.marker = textSprite(kind, { bg: 'none', fg: color, size: 1.6 / this.rig.root.scale.x });
      this.marker.position.y = this.rig.height / this.rig.root.scale.x + 0.1;
      this.rig.root.add(this.marker);
    }
  }
}
