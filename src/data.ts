// All the tunable game content lives here: animals, hunters and maps.

export type AnimalId = 'deer' | 'rabbit' | 'skunk' | 'bear' | 'duck' | 'moose';
export type HunterKind = 'bow' | 'rifle' | 'shotgun' | 'ebike' | 'ghillie' | 'drunk' | 'trapper' | 'drone' | 'hound' | 'king';
export type MapId = 'forest' | 'arctic' | 'jungle' | 'swamp' | 'lodge';

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
  /** Unlocked by finishing the hidden campaign instead of by stars. */
  unlockSecret?: boolean;
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
  {
    id: 'moose',
    name: 'The Old Moose',
    tagline: 'Retired. Rescued. Ready to rumble (politely).',
    walkSpeed: 4.4,
    runSpeed: 9.5,
    jump: 6,
    hearts: 4,
    visibility: 1.3,
    noise: 1.2,
    stamina: 4.5,
    ability: {
      name: 'Antler Charge',
      desc: 'Barrel forward. Any hunter in the way falls over and drops his hat.',
      cooldown: 8,
      duration: 1.1,
    },
    unlockStars: 99,
    unlockSecret: true,
    color: 0x5b3d26,
    accent: 0xd9c9a3,
  },
];

export interface HunterDef {
  kind: HunterKind;
  /** Archetype name, e.g. "Bowhunter Bob". Individuals get their own first names. */
  name: string;
  /** Title used in front of an individual's first name. */
  title: string;
  desc: string;
  /** The stat this archetype brags about in the hunter log. */
  stat: { label: string; min: number; max: number };
  /** Vest colors this archetype picks from. */
  vests: number[];
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
  projectile: 'arrow' | 'bullet' | 'pellets' | 'ram' | 'none';
  vest: number;
  quips: string[];
}

export const HUNTERS: Record<HunterKind, HunterDef> = {
  bow: {
    kind: 'bow',
    name: 'Bowhunter Bob',
    title: 'Bowhunter',
    desc: 'Silent arrows. You won\'t hear him coming, but you can dodge.',
    stat: { label: 'Arrows lost in the woods', min: 12, max: 340 },
    vests: [0x4d5a2e, 0x5f6b3a, 0x6b5a3a, 0x3f4f2a],
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
      'Twelve years of archery and I\'ve hit one (1) stump.',
    ],
  },
  rifle: {
    kind: 'rifle',
    name: 'Rifle Randy',
    title: 'Rifleman',
    desc: 'Long range, loud as heck. Every shot alerts his buddies.',
    stat: { label: 'Guns owned', min: 3, max: 41 },
    vests: [0xff6a00, 0xff7f11, 0xf25c05, 0xffa000],
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
    title: 'Shotgunner',
    desc: 'Short range, big spread. Do NOT get close. Loves ducks.',
    stat: { label: 'Shells per season', min: 200, max: 5200 },
    vests: [0xff3d7f, 0xe83f6f, 0xff5ea0, 0xd62f6a],
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
    title: 'E-Biker',
    desc: 'Zooms around on a near-silent e-bike. Rams you, then has to do a whole lap to recharge.',
    stat: { label: 'Strava kudos', min: 40, max: 9100 },
    vests: [0x22d3ee, 0x38bdf8, 0x2dd4bf, 0xa3e635],
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
      'Do these shorts make my calves look huntable?',
    ],
  },
  ghillie: {
    kind: 'ghillie',
    name: 'Ghillie Gus',
    title: 'Ghillie',
    desc: 'Looks exactly like a bush. Never moves. His laser sight is the only tell.',
    stat: { label: 'Hours spent as a bush', min: 120, max: 8800 },
    vests: [0x3f6b2a],
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
    quips: ['...', 'I am bush.', 'Nobody suspects the bush.', '*rustles menacingly*'],
  },
  drunk: {
    kind: 'drunk',
    name: 'Cooler Carl',
    title: 'Cooler',
    desc: 'Brought a cooler, a rifle and zero plans. Wobbles, misses a lot, and sometimes naps. Boop him while he snores.',
    stat: { label: 'Beers deep', min: 4, max: 23 },
    vests: [0xff6a00, 0xe07a1f, 0xc2410c],
    speed: 1.5,
    chaseSpeed: 2.6,
    viewRange: 30,
    fov: 0.9,
    hearing: 10,
    aimTime: 1.9,
    reload: 3.4,
    accuracy: 0.45,
    loudness: 50,
    projectile: 'bullet',
    vest: 0xff6a00,
    quips: [
      'This is my emotional support cooler.',
      'Who moved the forest?',
      'I\'m not drunk, the ground is just bumpy.',
      'Shhh. *hic* Hunting.',
      'Love you, man. You\'re a good tree.',
    ],
  },
  trapper: {
    kind: 'trapper',
    name: 'Trapper Tammy',
    title: 'Trapper',
    desc: 'Leaves snares wherever she walks and forgets where. Step in one and you\'re stuck. Carries a crossbow.',
    stat: { label: 'Traps forgotten', min: 5, max: 140 },
    vests: [0x7c4a2d, 0x8a5a3c, 0x6d4c41],
    speed: 2.0,
    chaseSpeed: 3.4,
    viewRange: 24,
    fov: 0.9,
    hearing: 15,
    aimTime: 1.1,
    reload: 3,
    accuracy: 0.62,
    loudness: 0,
    projectile: 'arrow',
    vest: 0x7c4a2d,
    quips: [
      'Now where did I put that one...',
      'Ow. Found it.',
      'Raccoon hat is real raccoon. His name was Gerald.',
      'I set 40 traps and caught 3 boots.',
    ],
  },
  drone: {
    kind: 'drone',
    name: 'Drone Dan',
    title: 'Drone Pilot',
    desc: 'Never leaves his lawn chair. His drone sweeps a spotlight around and radios every hunter nearby. Boop Dan and the drone falls out of the sky.',
    stat: { label: 'Drones crashed', min: 2, max: 61 },
    vests: [0x9ca3af, 0x64748b, 0x6b7280],
    speed: 0,
    chaseSpeed: 0,
    viewRange: 14,
    fov: 0.8,
    hearing: 8,
    aimTime: 1,
    reload: 3,
    accuracy: 0,
    loudness: 0,
    projectile: 'none',
    vest: 0x9ca3af,
    quips: [
      'Drone cam, activate.',
      'This is technically still hunting.',
      'Is that a deer or a pixel?',
      'Battery at 4%. Living on the edge.',
    ],
  },
  hound: {
    kind: 'hound',
    name: 'Houndsman Hank',
    title: 'Houndsman',
    desc: 'His beagle smells you through bushes. Stink and water throw the dog off.',
    stat: { label: 'Dogs named Duke', min: 1, max: 7 },
    vests: [0xff6a00, 0xf59e0b, 0xea580c],
    speed: 2.2,
    chaseSpeed: 3.6,
    viewRange: 32,
    fov: 0.8,
    hearing: 16,
    aimTime: 1.4,
    reload: 3.2,
    accuracy: 0.65,
    loudness: 55,
    projectile: 'bullet',
    vest: 0xff6a00,
    quips: [
      'Go get \'em, Duke!',
      'Duke, that\'s a stick. Duke.',
      'He\'s a great tracker. Mostly tracks sandwiches.',
      'Good boy! Who\'s a good boy?',
    ],
  },
  king: {
    kind: 'king',
    name: 'The Trophy King',
    title: 'The Trophy King',
    desc: 'Owner of the Lodge, sponsor of the Grand Hunt, wearer of many hats. Only vulnerable while reloading or from behind.',
    stat: { label: 'Heads on the wall', min: 312, max: 312 },
    vests: [0xd4af37],
    speed: 2.6,
    chaseSpeed: 4.2,
    viewRange: 40,
    fov: 1.0,
    hearing: 20,
    aimTime: 1.2,
    reload: 3.2,
    accuracy: 0.6,
    loudness: 60,
    projectile: 'pellets',
    vest: 0xd4af37,
    quips: [
      'Every wall deserves a head!',
      'Do you know how much this vest cost?',
      'Guards! GUARDS! Somebody!',
      'I didn\'t get this crown by being nice to deer.',
    ],
  },
};

/** Hunter types that can roll as regular roster members (not the boss). */
export const REGULAR_KINDS: HunterKind[] = ['bow', 'rifle', 'shotgun', 'ebike', 'ghillie', 'drunk', 'trapper', 'drone', 'hound'];

export const FIRST_NAMES = [
  'Bob', 'Randy', 'Sheila', 'Brad', 'Gus', 'Carl', 'Tammy', 'Dan', 'Hank', 'Earl', 'Darlene', 'Dwayne', 'Cletus',
  'Barb', 'Lyle', 'Wade', 'Doreen', 'Rusty', 'Bubba', 'Trish', 'Merle', 'Kyle', 'Brenda', 'Chad', 'Vern', 'Jolene',
  'Buck', 'Skip', 'Peggy', 'Duane', 'Lou', 'Gary', 'Rhonda', 'Clint', 'Bev', 'Hoyt',
];
export const NICKNAMES = [
  'Two-Beers', 'Big Gulp', 'The Whisperer', 'No-Scope', 'Old Reliable', 'Sasquatch', 'Mudflap', 'Kodak',
  'Jerky', 'Pickup', 'Camo Shorts', 'Tiny', 'Boomer', 'The Accountant', 'Lucky', 'Sneezy',
];

export type ObjectiveType = 'eat' | 'boop' | 'survive' | 'exit' | 'rescue' | 'boss';

export interface ObjectiveDef {
  type: ObjectiveType;
  count: number;
  label: string;
}

/** Things you can pick up or mess with as part of a map's secret. */
export type SecretItem = 'pear' | 'flyer' | 'radio' | 'battery' | 'charger' | 'key' | 'cage' | 'feather' | 'decoy' | 'lodgemap';

export interface SecretStep {
  /** trail: items appear one at a time, each farther along. sabotage: several props to boop at once. */
  kind: 'trail' | 'sabotage';
  item: SecretItem;
  count: number;
  label: string;
}

export interface SecretDef {
  chapter: number;
  /** The odd thing lying around that starts it. */
  trigger: SecretItem;
  found: string;
  steps: SecretStep[];
  /** Case file page revealed when the secret is complete. */
  title: string;
  page: string;
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
  night?: boolean;
  /** Only shows up once the hidden campaign reaches it. */
  hidden?: boolean;
  hunters: Partial<Record<HunterKind, number>>;
  objectives: ObjectiveDef[];
  parTime: number;
  unlockStars: number;
  secret?: SecretDef;
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
    hunters: { rifle: 3, bow: 2, drunk: 1 },
    objectives: [
      { type: 'eat', count: 8, label: 'Eat apples' },
      { type: 'exit', count: 1, label: 'Escape through the gap in the fence' },
    ],
    parTime: 150,
    unlockStars: 0,
    secret: {
      chapter: 1,
      trigger: 'pear',
      found: 'A golden pear? Pears don\'t grow here. Somebody put this here...',
      steps: [
        { kind: 'trail', item: 'pear', count: 8, label: 'Follow the golden pears' },
        { kind: 'trail', item: 'flyer', count: 1, label: 'Read the flyer on the tree stand by the trucks' },
      ],
      title: 'The Flyer',
      page:
        'TROPHY KING\'S GRAND HUNT. Bag a beast from every woods! Grand prize: the Golden Rifle and a lifetime supply of jerky. ' +
        'Sponsored by Trophy King Outfitters. "Every wall deserves a head." \n\nSo that\'s why there are so many of them this year. ' +
        'It isn\'t hunting season. It\'s a tournament. And the golden pears were bait.',
    },
  },
  {
    id: 'arctic',
    name: 'Frostbite Forest',
    blurb: 'Snowy pines, lost babies, and a hunter camp running on a very sketchy generator.',
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
    hunters: { rifle: 2, bow: 1, ebike: 2, trapper: 2, hound: 1 },
    objectives: [
      { type: 'rescue', count: 3, label: 'Find your lost babies' },
      { type: 'exit', count: 1, label: 'Lead them to the cave' },
    ],
    parTime: 190,
    unlockStars: 2,
    secret: {
      chapter: 2,
      trigger: 'radio',
      found: 'A walkie-talkie, half buried in the snow. It\'s dead. Maybe it just needs batteries...',
      steps: [
        { kind: 'trail', item: 'battery', count: 4, label: 'Find batteries for the walkie-talkie' },
        { kind: 'sabotage', item: 'charger', count: 1, label: 'Unplug the e-bike charging station' },
      ],
      title: 'Radio Chatter',
      page:
        '*krrsh* "...King says the Old Moose is already in the trophy cage up at the Lodge. Keep him fed till the Gala, boys. ' +
        'He wants it LIVE on the wall." *krrsh* "Brad, quit charging your bike off the camp generator!" \n\n' +
        'You unplug the charger. Somewhere in the snow, an e-bike sighs and dies. The Old Moose is alive. And they\'re keeping him somewhere called the Lodge.',
    },
  },
  {
    id: 'jungle',
    name: 'Bungle Jungle',
    blurb: 'Dense, sweaty, and somebody is shipping animals out of here in crates.',
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
    hunters: { shotgun: 2, bow: 1, ghillie: 2, ebike: 1, drone: 1, trapper: 1 },
    objectives: [
      { type: 'boop', count: 3, label: 'Sneak up and steal hunter hats' },
      { type: 'eat', count: 5, label: 'Eat mangoes' },
    ],
    parTime: 210,
    unlockStars: 4,
    secret: {
      chapter: 3,
      trigger: 'key',
      found: 'A rusty key with a tag: "PROPERTY OF TROPHY KING LODGE - CRATE DIVISION."',
      steps: [{ kind: 'sabotage', item: 'cage', count: 4, label: 'Free the caged animals' }],
      title: 'Jailbreak',
      page:
        'The parrots will not stop talking. "The Lodge! The Lodge! Big golden man! Wears ALL the hats!" ' +
        'The monkeys say the Old Moose taught every young animal in these woods how to dodge a hunter. ' +
        'Now he\'s in a cage with a gold padlock, waiting for the King\'s Gala. Somebody has to get him out.',
    },
  },
  {
    id: 'swamp',
    name: 'Soggy Bottom',
    blurb: 'Opening day of duck season. Also, why are some of these ducks beeping?',
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
    hunters: { shotgun: 3, rifle: 1, ghillie: 1, ebike: 1, drunk: 1, hound: 1, drone: 1 },
    objectives: [
      { type: 'survive', count: 60, label: 'Survive until sundown' },
      { type: 'boop', count: 2, label: 'Steal hunter hats' },
    ],
    parTime: 60,
    unlockStars: 6,
    secret: {
      chapter: 4,
      trigger: 'feather',
      found: 'A metal feather with a serial number. These "ducks" are robots!',
      steps: [
        { kind: 'sabotage', item: 'decoy', count: 6, label: 'Boop the robo-decoys' },
        { kind: 'trail', item: 'lodgemap', count: 1, label: 'Grab the map from the decoy crate' },
      ],
      title: 'The Decoy Factory',
      page:
        'Robo-decoys. Hundreds of them, all pointed at the swamp, all stamped TK OUTFITTERS. ' +
        'Inside the crate is a hand-drawn map: "TROPHY KING LODGE. Gala tonight. DO NOT let the deer in." \n\n' +
        'Well. Now you have to go.',
    },
  },
  {
    id: 'lodge',
    name: 'Trophy King Lodge',
    blurb: 'Gala night. Golden walls, three hundred mounted heads, and one moose in a cage.',
    size: 130,
    ground: 0x2f4a33,
    groundAlt: 0x243a28,
    sky: 0x141b33,
    fog: 0x1c2440,
    fogDensity: 0.02,
    trees: 90,
    treeStyle: 'pine',
    bushes: 60,
    rocks: 15,
    hills: 1,
    food: { name: 'canapes', color: 0xf2c94c },
    night: true,
    hidden: true,
    hunters: { king: 1, rifle: 2, shotgun: 1, hound: 1, drone: 1 },
    objectives: [
      { type: 'boss', count: 3, label: 'Knock the hats off the Trophy King' },
      { type: 'exit', count: 1, label: 'Free the Old Moose' },
    ],
    parTime: 240,
    unlockStars: 0,
  },
];

export const LODGE_PAGE = {
  title: 'Long Live the Moose',
  page:
    'The Trophy King trips over his last hat, crawls into his golden truck and drives off sobbing into a monogrammed hanky. ' +
    'The Gala is canceled. The Grand Hunt is "postponed pending review." \n\n' +
    'The Old Moose steps out of the cage, stretches, and says the first thing he\'s said in weeks: "Took you long enough, kid." ' +
    'The woods are quiet tonight. For now.',
};

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  /** Hidden achievements show as ??? until earned. */
  secret?: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_boop', name: 'Boop!', desc: 'Boop your first hunter.' },
  { id: 'hat_trick', name: 'Hat Trick', desc: 'Collect 3 hats in one run.' },
  { id: 'milliner', name: 'Milliner', desc: 'Collect 25 hats in total.' },
  { id: 'untouched', name: 'Not a Scratch', desc: 'Finish a map without getting hit.' },
  { id: 'speedy', name: 'Speed Deer', desc: 'Beat any map under par time.' },
  { id: 'all_stars', name: 'Star Collector', desc: 'Earn all 3 stars on all four main maps.' },
  { id: 'mounted', name: 'Wall Decoration', desc: 'Get mounted 10 times.' },
  { id: 'lucky_duck', name: 'Lucky Duck', desc: 'Survive Soggy Bottom as the duck.' },
  { id: 'golden', name: 'Golden Boy', desc: 'Collect a hat from a golden-vest hunter.' },
  { id: 'stink3', name: 'Air Quality Alert', desc: 'Stink out 3 hunters with one stink bomb.' },
  { id: 'roar3', name: 'Unbearable', desc: 'Knock down 3 hunters with one roar.' },
  { id: 'good_boy', name: 'Who\'s a Good Boy?', desc: 'Boop a houndsman. His dog doesn\'t mind.' },
  { id: 'designated', name: 'Designated Driver', desc: 'Boop a hunter mid-nap.' },
  { id: 'airspace', name: 'Airspace Violation', desc: 'Bring down a drone by booping its pilot.' },
  { id: 'snared', name: 'Snared', desc: 'Step in a trap. It happens to everyone.' },
  { id: 'scaredy', name: 'Boo!', desc: 'Make a hunter run crying back to their truck.' },
  { id: 'timber', name: 'Timber!', desc: 'Boop a tree stand with a hunter in it.' },
  { id: 'orange', name: 'Blaze of Glory', desc: 'Wear a hunter\'s orange.' },
  { id: 'field_guide', name: 'Field Guide', desc: 'Log a hat from every kind of regular hunter.' },
  { id: 'secret_forest', name: 'Pear Pressure', desc: 'Uncover the secret of Whispering Pines.', secret: true },
  { id: 'secret_arctic', name: 'Radio Silence', desc: 'Uncover the secret of Frostbite Forest.', secret: true },
  { id: 'secret_jungle', name: 'Jailbreak', desc: 'Uncover the secret of Bungle Jungle.', secret: true },
  { id: 'secret_swamp', name: 'Decoy Disaster', desc: 'Uncover the secret of Soggy Bottom.', secret: true },
  { id: 'king', name: 'Long Live the Moose', desc: 'Dethrone the Trophy King.', secret: true },
];

export const BOOP_QUIPS = ['MY HAT!', 'Not again!', 'Was that a deer?!', 'I tripped on a twig!', 'Nobody saw that.'];
export const SPOT_QUIPS = ['THERE!', 'Hold still, buddy!', 'Gotcha now!', 'Ooh, that\'s a big one!'];
export const MISS_QUIPS = ['Dang scope!', 'Warning shot!', 'The sun was in my eyes!', 'I meant to do that.'];
export const LOST_QUIPS = ['Must\'ve been the wind.', 'Huh. Lost it.', 'Was it ever really there?', 'Time for a snack break.'];
export const STINK_QUIPS = ['OH GOD THE SMELL', 'My eyes!!', 'Not worth it!', '*gagging noises*'];
export const HIT_QUIPS = ['Ow!', 'Rude!', 'I felt that in my antlers.', 'That\'s gonna leave a mark.'];
export const SCARED_QUIPS = ['MOMMAAAA!', 'I\'m going home!', 'Nope nope nope nope', 'Tell my truck I love it!'];
export const SLEEP_QUIPS = ['Zzz...', 'Zzzz... *hic*', 'Five more minutes...'];
