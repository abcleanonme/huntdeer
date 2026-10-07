// All the tunable game content lives here: animals, hunters and maps.

export type AnimalId = 'deer' | 'rabbit' | 'skunk' | 'bear' | 'duck';
export type HunterKind = 'bow' | 'rifle' | 'shotgun' | 'ebike' | 'ghillie';
export type MapId = 'forest' | 'arctic' | 'jungle' | 'swamp';

export interface AnimalDef {
  id: AnimalId;
  name: string;
  tagline: string;
  walkSpeed: number;
  runSpeed: number;
  jump: number;
  hearts: number;
  /** Multiplier on how easy you are to spot. */
  visibility: number;
  /** Multiplier on footstep noise while running. */
  noise: number;
  /** Seconds of sprint before you're winded. */
  stamina: number;
  ability: { name: string; desc: string; cooldown: number; duration: number };
  /** Stars needed to unlock. */
  unlockStars: number;
  color: number;
  accent: number;
}

export const ANIMALS: AnimalDef[] = [
  {
    id: 'deer',
    name: 'Doug the Deer',
    tagline: 'Fast, majestic, mildly anxious.',
    walkSpeed: 5,
    runSpeed: 11,
    jump: 9,
    hearts: 3,
    visibility: 1,
    noise: 1,
    stamina: 5,
    ability: {
      name: 'Super Sniffer',
      desc: 'Smell every hunter on the map through trees for a few seconds. Passive: nearby hunters ping on screen.',
      cooldown: 10,
      duration: 6,
    },
    unlockStars: 0,
    color: 0xb07a45,
    accent: 0xf3e2c4,
  },
  {
    id: 'rabbit',
    name: 'Bun Jovi',
    tagline: 'Small. Twitchy. Living on a prayer.',
    walkSpeed: 4.5,
    runSpeed: 10,
    jump: 11,
    hearts: 2,
    visibility: 0.55,
    noise: 0.5,
    stamina: 4.5,
    ability: {
      name: 'Mega Hop',
      desc: 'Launch into a giant leap with a speed boost. Great for escaping (or showing off).',
      cooldown: 4,
      duration: 1.2,
    },
    unlockStars: 2,
    color: 0xd9d2c7,
    accent: 0xffb3c1,
  },
  {
    id: 'skunk',
    name: 'Pepé Le Nope',
    tagline: 'Smells like victory. Mostly just smells.',
    walkSpeed: 4.2,
    runSpeed: 8.5,
    jump: 7,
    hearts: 3,
    visibility: 0.7,
    noise: 0.7,
    stamina: 4,
    ability: {
      name: 'Stink Bomb',
      desc: 'Drop a cloud of stank. Hunters inside gag, can\'t aim, and wander off.',
      cooldown: 12,
      duration: 6,
    },
    unlockStars: 4,
    color: 0x2b2b30,
    accent: 0xf4f4f4,
  },
  {
    id: 'bear',
    name: 'Bearnard',
    tagline: 'Big. Loud. Emotionally available.',
    walkSpeed: 4,
    runSpeed: 9,
    jump: 6,
    hearts: 5,
    visibility: 1.45,
    noise: 1.4,
    stamina: 3,
    ability: {
      name: 'Mighty Roar',
      desc: 'Roar so hard nearby hunters fall over and drop their hats.',
      cooldown: 14,
      duration: 0.6,
    },
    unlockStars: 6,
    color: 0x5a3b26,
    accent: 0x2f1e12,
  },
  {
    id: 'duck',
    name: 'Sir Quacksalot',
    tagline: 'It\'s duck season. It\'s ALWAYS duck season.',
    walkSpeed: 3.6,
    runSpeed: 7,
    jump: 7,
    hearts: 2,
    visibility: 0.6,
    noise: 0.6,
    stamina: 3.5,
    ability: {
      name: 'Flap Away',
      desc: 'Fly above the trees for a few seconds. Shotgun hunters get VERY excited.',
      cooldown: 9,
      duration: 4,
    },
    unlockStars: 9,
    color: 0x2e7d4f,
    accent: 0xf2c94c,
  },
];

export interface HunterDef {
  kind: HunterKind;
  name: string;
  desc: string;
  speed: number;
  chaseSpeed: number;
  viewRange: number;
  fov: number; // half-angle, radians
  hearing: number; // radius at which a running animal is heard
  aimTime: number;
  reload: number;
  accuracy: number;
  /** Radius around a shot within which other hunters are alerted. 0 = silent. */
  loudness: number;
  projectile: 'arrow' | 'bullet' | 'pellets' | 'ram';
  vest: number;
  quips: string[];
}

export const HUNTERS: Record<HunterKind, HunterDef> = {
  bow: {
    kind: 'bow',
    name: 'Bowhunter Bob',
    desc: 'Silent arrows. You won\'t hear him coming, but you can dodge.',
    speed: 2.2,
    chaseSpeed: 3.6,
    viewRange: 26,
    fov: 0.95,
    hearing: 14,
    aimTime: 1.0,
    reload: 2.8,
    accuracy: 0.8,
    loudness: 0,
    projectile: 'arrow',
    vest: 0x4d5a2e,
    quips: [
      'Shhh. I am one with nature.',
      'I made this bow myself. Out of regret.',
      'The deer cannot see me. I am a tree.',
      'Hmm. Smells like venison in here.',
    ],
  },
  rifle: {
    kind: 'rifle',
    name: 'Rifle Randy',
    desc: 'Long range, loud as heck. Every shot alerts his buddies.',
    speed: 2.0,
    chaseSpeed: 3.2,
    viewRange: 42,
    fov: 0.75,
    hearing: 18,
    aimTime: 1.5,
    reload: 3.2,
    accuracy: 0.65,
    loudness: 55,
    projectile: 'bullet',
    vest: 0xff6a00,
    quips: [
      'Here deery deery deer...',
      'I definitely saw a 14-pointer.',
      'My wife is gonna LOVE this one.',
      'Is it deer season or duck season?',
      'Blaze orange is a lifestyle.',
    ],
  },
  shotgun: {
    kind: 'shotgun',
    name: 'Shotgun Sheila',
    desc: 'Short range, big spread. Do NOT get close. Loves ducks.',
    speed: 2.4,
    chaseSpeed: 4.2,
    viewRange: 20,
    fov: 1.05,
    hearing: 16,
    aimTime: 0.9,
    reload: 2.4,
    accuracy: 0.72,
    loudness: 40,
    projectile: 'pellets',
    vest: 0xff3d7f,
    quips: [
      'Pull!',
      'Quack quack, you\'re a snack.',
      'I brought 400 shells. For balance.',
      'Did that bush just sneeze?',
    ],
  },
  ebike: {
    kind: 'ebike',
    name: 'E-Bike Brad',
    desc: 'Zooms around on a near-silent e-bike. Rams you. Very into his Strava.',
    speed: 7,
    chaseSpeed: 9.5,
    viewRange: 30,
    fov: 0.6,
    hearing: 12,
    aimTime: 0.5,
    reload: 6,
    accuracy: 0.9,
    loudness: 0,
    projectile: 'ram',
    vest: 0x22d3ee,
    quips: [
      'Pedal assist level 5, baby!',
      'This counts as cardio.',
      'Hunting AND a new Strava PR.',
      'It\'s electric! Boogie woogie woogie!',
    ],
  },
  ghillie: {
    kind: 'ghillie',
    name: 'Ghillie Gus',
    desc: 'Looks exactly like a bush. Never moves. Long-range laser sight is the only tell.',
    speed: 0,
    chaseSpeed: 0,
    viewRange: 55,
    fov: 0.45,
    hearing: 6,
    aimTime: 2.2,
    reload: 3.5,
    accuracy: 0.75,
    loudness: 60,
    projectile: 'bullet',
    vest: 0x3f6b2a,
    quips: [
      '...',
      'I am bush.',
      'Nobody suspects the bush.',
      '*rustles menacingly*',
    ],
  },
};

export type ObjectiveType = 'eat' | 'boop' | 'survive' | 'exit' | 'rescue';

export interface ObjectiveDef {
  type: ObjectiveType;
  count: number;
  label: string;
}

export interface MapDef {
  id: MapId;
  name: string;
  blurb: string;
  size: number;
  ground: number;
  groundAlt: number;
  sky: number;
  fog: number;
  fogDensity: number;
  trees: number;
  treeStyle: 'pine' | 'snowpine' | 'palm' | 'willow';
  bushes: number;
  rocks: number;
  hills: number;
  food: { name: string; color: number };
  snow?: boolean;
  water?: boolean;
  hunters: Partial<Record<HunterKind, number>>;
  objectives: ObjectiveDef[];
  parTime: number;
  unlockStars: number;
}

export const MAPS: MapDef[] = [
  {
    id: 'forest',
    name: 'Whispering Pines',
    blurb: 'A cozy forest full of apples and middle-aged men in orange.',
    size: 170,
    ground: 0x6aa84f,
    groundAlt: 0x4f8a3a,
    sky: 0x9fd4f2,
    fog: 0xb9e0f0,
    fogDensity: 0.012,
    trees: 150,
    treeStyle: 'pine',
    bushes: 70,
    rocks: 30,
    hills: 3,
    food: { name: 'apples', color: 0xe63946 },
    hunters: { rifle: 3, bow: 2 },
    objectives: [
      { type: 'eat', count: 8, label: 'Eat apples' },
      { type: 'exit', count: 1, label: 'Escape through the gap in the fence' },
    ],
    parTime: 150,
    unlockStars: 0,
  },
  {
    id: 'arctic',
    name: 'Frostbite Forest',
    blurb: 'Snowy pines. Your tracks are visible. So is your breath.',
    size: 170,
    ground: 0xeef4fa,
    groundAlt: 0xd5e3ef,
    sky: 0xc8dcef,
    fog: 0xe6eef6,
    fogDensity: 0.018,
    trees: 120,
    treeStyle: 'snowpine',
    bushes: 40,
    rocks: 45,
    hills: 5,
    food: { name: 'frozen berries', color: 0x6c5ce7 },
    snow: true,
    hunters: { rifle: 3, bow: 2, ebike: 1 },
    objectives: [
      { type: 'rescue', count: 3, label: 'Find your lost babies' },
      { type: 'exit', count: 1, label: 'Lead them to the cave' },
    ],
    parTime: 180,
    unlockStars: 2,
  },
  {
    id: 'jungle',
    name: 'Bungle Jungle',
    blurb: 'Dense, sweaty and full of hunters who took a wrong turn at Albuquerque.',
    size: 160,
    ground: 0x3d8b37,
    groundAlt: 0x2d6e2a,
    sky: 0x8fd18a,
    fog: 0x9fd69a,
    fogDensity: 0.022,
    trees: 190,
    treeStyle: 'palm',
    bushes: 130,
    rocks: 20,
    hills: 4,
    food: { name: 'mangoes', color: 0xffa62b },
    hunters: { shotgun: 2, bow: 2, ghillie: 2, ebike: 1 },
    objectives: [
      { type: 'boop', count: 3, label: 'Sneak up and steal hunter hats' },
      { type: 'eat', count: 5, label: 'Eat mangoes' },
    ],
    parTime: 200,
    unlockStars: 4,
  },
  {
    id: 'swamp',
    name: 'Soggy Bottom',
    blurb: 'Opening day of duck season. Survive the chaos.',
    size: 150,
    ground: 0x6b7f3a,
    groundAlt: 0x55692c,
    sky: 0xb7c99a,
    fog: 0xa7b98a,
    fogDensity: 0.02,
    trees: 90,
    treeStyle: 'willow',
    bushes: 90,
    rocks: 15,
    hills: 2,
    food: { name: 'bugs', color: 0x9b5de5 },
    water: true,
    hunters: { shotgun: 3, rifle: 1, ghillie: 1, ebike: 1 },
    objectives: [
      { type: 'survive', count: 60, label: 'Survive until sundown' },
      { type: 'boop', count: 2, label: 'Steal hunter hats' },
    ],
    parTime: 60,
    unlockStars: 6,
  },
];

export const BOOP_QUIPS = ['MY HAT!', 'Not again!', 'Was that a deer?!', 'I tripped on a twig!', 'Nobody saw that.'];
export const SPOT_QUIPS = ['THERE!', 'Hold still, buddy!', 'Gotcha now!', 'Ooh, that\'s a big one!'];
export const MISS_QUIPS = ['Dang scope!', 'Warning shot!', 'The sun was in my eyes!', 'I meant to do that.'];
export const LOST_QUIPS = ['Must\'ve been the wind.', 'Huh. Lost it.', 'Was it ever really there?', 'Time for a snack break.'];
export const STINK_QUIPS = ['OH GOD THE SMELL', 'My eyes!!', 'Not worth it!', '*gagging noises*'];
export const HIT_QUIPS = ['Ow!', 'Rude!', 'I felt that in my antlers.', 'That\'s gonna leave a mark.'];
