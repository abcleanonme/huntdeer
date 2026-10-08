import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-800.css';
import './style.css';
import * as THREE from 'three';
import { ANIMALS, LODGE_PAGE, MAPS, type AchievementDef, type AnimalDef, type MapDef } from './data';
import { Achiever } from './achievements';
import { Game, type GameEvent, type GameResult } from './game';
import { Input } from './input';
import { initNative, haptic } from './native';
import { loadSave, loadSaveNative, totalStars, writeSave, type HatEntry } from './save';
import { animalUnlocked, mapUnlocked, Ui } from './ui';
import { sfx, unlockAudio } from './audio';

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const input = new Input(renderer.domElement);
const ui = new Ui(app);
let save = loadSave();
let game: Game | null = null;
let current: { animal: AnimalDef; map: MapDef } | null = null;
let runAchievements: AchievementDef[] = [];

const achiever = new Achiever(
  () => save,
  (a) => {
    runAchievements.push(a);
    sfx.achievement();
    haptic('success');
    game?.hud.banner(a.name, a.desc);
  },
);

// A slowly rotating menu backdrop so the title screen isn't a void.
let backdrop: Game | null = null;

/** Keep the hat log from growing forever: keep golden hats and the best scores. */
function logHat(e: HatEntry) {
  save.hats.push(e);
  save.totalHats++;
  if (save.hats.length > 200) {
    save.hats.sort((a, b) => Number(b.golden) - Number(a.golden) || b.score - a.score);
    save.hats.length = 200;
  }
}

function onEvent(e: GameEvent) {
  if (e.type === 'hat') logHat(e.entry);
  if (e.type === 'secretFound' && !save.secretsFound.includes(e.map)) save.secretsFound.push(e.map);
  if (e.type === 'secretDone' && !save.secretsDone.includes(e.map)) save.secretsDone.push(e.map);
  achiever.onEvent(e);
  // Hats and clues are kept even if the run ends badly.
  if (e.type === 'hat' || e.type === 'secretFound' || e.type === 'secretDone') writeSave(save);
}

function startGame(animal: AnimalDef, map: MapDef) {
  unlockAudio();
  ui.hide();
  backdrop?.dispose();
  backdrop = null;
  game?.dispose();
  current = { animal, map };
  runAchievements = [];
  achiever.startRun();
  game = new Game(renderer, input, map, animal, app, {
    onEnd,
    onPause: pause,
    onEvent,
    secret: !!map.secret && !save.secretsDone.includes(map.id),
  });
  input.enabled = true;
}

function pause() {
  if (!game || game.ended || game.paused) return;
  game.paused = true;
  input.reset();
  input.enabled = false;
  ui.pause(resume, toMenu);
}

function resume() {
  if (!game) return;
  ui.hide();
  game.paused = false;
  input.enabled = true;
}

function toMenu() {
  game?.dispose();
  game = null;
  input.enabled = false;
  input.reset();
  showTitle();
}

function showTitle() {
  ensureBackdrop();
  ui.title(save, {
    play: showSelect,
    log: () => ui.hunterLog(save, showTitle),
    achievements: () => ui.achievements(save, showTitle),
    caseFile: () => ui.caseFile(save, showTitle),
  });
}

function showSelect() {
  ensureBackdrop();
  ui.select(save, startGame, () => ui.guide(save, showSelect), showTitle);
}

function onEnd(r: GameResult) {
  if (!game || !current) return;
  input.enabled = false;
  const { animal, map } = current;
  const before = totalStars(save);
  const lodgeBefore = mapUnlocked(save, MAPS.find((m) => m.id === 'lodge')!);
  const mooseBefore = save.kingDefeated;
  if (r.win) {
    save.wins++;
    const got = r.stars.filter(Boolean).length;
    save.stars[map.id] = Math.max(save.stars[map.id] ?? 0, got);
    save.bestTime[map.id] = Math.min(save.bestTime[map.id] ?? Infinity, r.time);
    if (r.kingDefeated) save.kingDefeated = true;
  } else {
    save.deaths++;
  }
  achiever.onResult(r, map.id, animal.id);
  writeSave(save);
  const after = totalStars(save);
  const unlocks = [
    ...ANIMALS.filter((a) => !a.unlockSecret && a.unlockStars > before && a.unlockStars <= after).map((a) => a.name),
    ...MAPS.filter((m) => !m.hidden && m.unlockStars > before && m.unlockStars <= after).map((m) => m.name),
  ];
  if (!lodgeBefore && mapUnlocked(save, MAPS.find((m) => m.id === 'lodge')!)) unlocks.push('Trophy King Lodge');
  const moose = ANIMALS.find((a) => a.id === 'moose')!;
  if (!mooseBefore && animalUnlocked(save, moose)) unlocks.push(moose.name);
  const story = r.kingDefeated ? LODGE_PAGE : r.secretDone && map.secret ? { title: `Chapter ${map.secret.chapter}: ${map.secret.title}`, page: map.secret.page } : null;
  ui.result(r, animal, map, { unlocks, achievements: runAchievements, story }, () => startGame(animal, map), toMenu);
}

function ensureBackdrop() {
  if (backdrop) return;
  const pool = MAPS.filter((m) => !m.hidden);
  const map = pool[Math.floor(Math.random() * pool.length)];
  // Reuse the game scene as a menu background; it never receives input.
  const hudHost = document.createElement('div');
  backdrop = new Game(renderer, input, map, ANIMALS[0], hudHost, { onEnd: () => {}, onPause: () => {}, onEvent: () => {}, demo: true });
  backdrop.hud.root.style.display = 'none';
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  game?.onResize();
  backdrop?.onResize();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
document.addEventListener('pointerlockchange', () => {
  // Browsers swallow the Escape key that releases pointer lock, so treat losing the lock as "pause".
  if (!document.pointerLockElement && game && !game.ended && !game.paused && !input.isTouch) pause();
});

let last = performance.now();
function frame(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  if (game) {
    game.update(dt);
    game.render();
  } else if (backdrop) {
    backdrop.camYaw += dt * 0.1;
    backdrop.camPitch = 0.3;
    backdrop.update(dt);
    backdrop.render();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const params = new URLSearchParams(location.search);
// Dev/testing hook: ?unlock=all opens everything.
if (params.get('unlock') === 'all') {
  save = {
    ...save,
    stars: { forest: 3, arctic: 3, jungle: 3, swamp: 3 },
    secretsFound: ['forest', 'arctic', 'jungle', 'swamp'],
    secretsDone: ['forest', 'arctic', 'jungle', 'swamp'],
    kingDefeated: true,
  };
}

ensureBackdrop();
showTitle();
void initNative();
void loadSaveNative(save).then((s) => {
  if (s === save) return;
  save = s;
  if (!game) showTitle();
});

// Dev/testing hook: ?map=jungle&animal=bear jumps straight into a level.
if (params.get('map')) {
  const m = MAPS.find((x) => x.id === params.get('map')) ?? MAPS[0];
  const a = ANIMALS.find((x) => x.id === params.get('animal')) ?? ANIMALS[0];
  startGame(a, m);
}
(window as unknown as { __huntdeer: unknown }).__huntdeer = {
  get game() {
    return game;
  },
  get save() {
    return save;
  },
};
