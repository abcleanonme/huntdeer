import * as THREE from 'three';
import { ANIMALS, MAPS, type AnimalDef, type MapDef } from './data';
import { Game, type GameResult } from './game';
import { Input } from './input';
import { loadSave, totalStars, writeSave } from './save';
import { Ui } from './ui';
import { unlockAudio } from './audio';

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

// A slowly rotating menu backdrop so the title screen isn't a void.
let backdrop: Game | null = null;

function startGame(animal: AnimalDef, map: MapDef) {
  unlockAudio();
  ui.hide();
  backdrop?.dispose();
  backdrop = null;
  game?.dispose();
  current = { animal, map };
  game = new Game(renderer, input, map, animal, app, onEnd, pause);
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
  showSelect();
}

function showSelect() {
  ensureBackdrop();
  ui.select(save, startGame, () => ui.guide(showSelect));
}

function onEnd(r: GameResult) {
  if (!game || !current) return;
  input.enabled = false;
  const { animal, map } = current;
  const before = totalStars(save);
  if (r.win) {
    const got = r.stars.filter(Boolean).length;
    save.stars[map.id] = Math.max(save.stars[map.id] ?? 0, got);
    save.bestTime[map.id] = Math.min(save.bestTime[map.id] ?? Infinity, r.time);
  } else {
    save.deaths++;
  }
  writeSave(save);
  const after = totalStars(save);
  const unlocks = [
    ...ANIMALS.filter((a) => a.unlockStars > before && a.unlockStars <= after).map((a) => a.name),
    ...MAPS.filter((m) => m.unlockStars > before && m.unlockStars <= after).map((m) => m.name),
  ];
  ui.result(r, animal, map, unlocks, () => startGame(animal, map), toMenu);
}

function ensureBackdrop() {
  if (backdrop) return;
  const map = MAPS[Math.floor(Math.random() * MAPS.length)];
  // Reuse the game scene as a menu background; it never receives input.
  const hudHost = document.createElement('div');
  backdrop = new Game(renderer, input, map, ANIMALS[0], hudHost, () => {}, () => {}, true);
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

ensureBackdrop();
ui.title(showSelect);

// Dev/testing hook: ?map=jungle&animal=bear jumps straight into a level.
const params = new URLSearchParams(location.search);
if (params.get('map')) {
  const m = MAPS.find((x) => x.id === params.get('map')) ?? MAPS[0];
  const a = ANIMALS.find((x) => x.id === params.get('animal')) ?? ANIMALS[0];
  startGame(a, m);
}
(window as unknown as { __huntdeer: unknown }).__huntdeer = { get game() { return game; } };
if (params.get('unlock') === 'all') {
  save = { ...save, stars: { forest: 3, arctic: 3, jungle: 3, swamp: 3 } };
}
