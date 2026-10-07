// Menu screens: title, critter/map select, pause, results.
import { ANIMALS, HUNTERS, MAPS, type AnimalDef, type HunterKind, type MapDef } from './data';
import type { GameResult } from './game';
import { muted, sfx, toggleMute, unlockAudio } from './audio';
import { totalStars, type SaveData } from './save';

const ANIMAL_EMOJI: Record<string, string> = { deer: '🦌', rabbit: '🐇', skunk: '🦨', bear: '🐻', duck: '🦆' };
const HUNTER_EMOJI: Record<HunterKind, string> = { bow: '🏹', rifle: '🔫', shotgun: '💥', ebike: '🚲', ghillie: '🌿' };
const MAP_EMOJI: Record<string, string> = { forest: '🌲', arctic: '❄️', jungle: '🌴', swamp: '🐸' };

export class Ui {
  private screen: HTMLDivElement;
  selAnimal = 'deer';
  selMap = 'forest';

  constructor(parent: HTMLElement) {
    this.screen = document.createElement('div');
    this.screen.className = 'screen';
    parent.appendChild(this.screen);
  }

  hide() {
    this.screen.style.display = 'none';
    this.screen.innerHTML = '';
  }

  private show(html: string, cls = '') {
    this.screen.className = `screen ${cls}`;
    this.screen.style.display = 'flex';
    this.screen.innerHTML = html;
    this.screen.scrollTop = 0;
  }

  private on(sel: string, fn: (el: HTMLElement) => void) {
    this.screen.querySelectorAll<HTMLElement>(sel).forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        unlockAudio();
        sfx.click();
        fn(el);
      }),
    );
  }

  title(onPlay: () => void) {
    this.show(
      `<div class="title-card">
        <div class="logo">HUNT<span>DEER</span></div>
        <div class="subtitle">The hunted becomes... still the hunted, but now it's funny.</div>
        <div class="title-art">🦌💨 &nbsp; 🧢🔫😤</div>
        <button class="big-btn play">PLAY</button>
        <div class="rating"><b>D</b> Rated D for Deer · Contains mild antlers</div>
      </div>`,
      'title',
    );
    this.on('.play', onPlay);
  }

  select(save: SaveData, onStart: (a: AnimalDef, m: MapDef) => void, onGuide: () => void) {
    const stars = totalStars(save);
    const animalUnlocked = (a: AnimalDef) => stars >= a.unlockStars;
    const mapUnlocked = (m: MapDef) => stars >= m.unlockStars;
    if (!animalUnlocked(ANIMALS.find((a) => a.id === this.selAnimal)!)) this.selAnimal = 'deer';
    if (!mapUnlocked(MAPS.find((m) => m.id === this.selMap)!)) this.selMap = 'forest';

    const animalCards = ANIMALS.map((a) => {
      const ok = animalUnlocked(a);
      return `<button class="card animal ${ok ? '' : 'locked'} ${a.id === this.selAnimal ? 'sel' : ''}" data-id="${a.id}" ${ok ? '' : 'disabled'}>
        <div class="emoji">${ok ? ANIMAL_EMOJI[a.id] : '🔒'}</div>
        <div class="name">${ok ? a.name : '???'}</div>
        <div class="small">${ok ? a.ability.name : `${a.unlockStars} ⭐ to unlock`}</div>
      </button>`;
    }).join('');
    const mapCards = MAPS.map((m) => {
      const ok = mapUnlocked(m);
      const st = save.stars[m.id] ?? 0;
      return `<button class="card map ${ok ? '' : 'locked'} ${m.id === this.selMap ? 'sel' : ''}" data-id="${m.id}" ${ok ? '' : 'disabled'}>
        <div class="emoji">${ok ? MAP_EMOJI[m.id] : '🔒'}</div>
        <div class="name">${ok ? m.name : '???'}</div>
        <div class="small">${ok ? '⭐'.repeat(st) + '☆'.repeat(3 - st) : `${m.unlockStars} ⭐ to unlock`}</div>
      </button>`;
    }).join('');

    const a = ANIMALS.find((x) => x.id === this.selAnimal)!;
    const m = MAPS.find((x) => x.id === this.selMap)!;
    const hunters = (Object.entries(m.hunters) as [HunterKind, number][])
      .map(([k, n]) => `<span class="chip">${HUNTER_EMOJI[k]} ${n}× ${HUNTERS[k].name}</span>`)
      .join('');

    this.show(
      `<div class="select">
        <div class="sel-head"><h2>Pick your critter</h2><div class="stars-total">⭐ ${stars} / ${MAPS.length * 3}</div></div>
        <div class="row">${animalCards}</div>
        <div class="detail">
          <b>${ANIMAL_EMOJI[a.id]} ${a.name}</b> <i>${a.tagline}</i><br/>
          <span class="ability-name">${a.ability.name}:</span> ${a.ability.desc}
          <div class="stats">❤️ ${a.hearts} · 💨 ${a.runSpeed} · 👀 ${a.visibility < 0.8 ? 'sneaky' : a.visibility > 1.2 ? 'very visible' : 'average'}</div>
        </div>
        <h2>Pick your woods</h2>
        <div class="row">${mapCards}</div>
        <div class="detail">
          <b>${MAP_EMOJI[m.id]} ${m.name}</b> <i>${m.blurb}</i><br/>
          <div class="objlist">🎯 ${m.objectives.map((o) => (o.type === 'eat' ? `Eat ${o.count} ${m.food.name}` : o.type === 'survive' ? `Survive ${o.count}s` : o.type === 'boop' || o.type === 'rescue' ? `${o.label} (${o.count})` : o.label)).join(' → ')}</div>
          <div class="chips">${hunters}</div>
        </div>
        <div class="sel-actions">
          <button class="mid-btn guide">📖 Hunter Field Guide</button>
          <button class="big-btn go">GO! ▶</button>
        </div>
      </div>`,
      'menu',
    );
    this.on('.card.animal', (el) => {
      this.selAnimal = el.dataset.id!;
      this.select(save, onStart, onGuide);
    });
    this.on('.card.map', (el) => {
      this.selMap = el.dataset.id!;
      this.select(save, onStart, onGuide);
    });
    this.on('.guide', onGuide);
    this.on('.go', () => onStart(a, m));
  }

  guide(onBack: () => void) {
    const rows = Object.values(HUNTERS)
      .map(
        (h) => `<div class="guide-row"><div class="emoji">${HUNTER_EMOJI[h.kind]}</div><div><b>${h.name}</b><br/>${h.desc}
          <div class="small">Sight ${h.viewRange}m · ${h.loudness ? 'LOUD' : 'silent'} · Aim time ${h.aimTime}s</div>
          <div class="quote">"${h.quips[0]}"</div></div></div>`,
      )
      .join('');
    this.show(
      `<div class="select">
        <h2>📖 Field Guide: North American Hunters</h2>
        <p class="small">Know your enemy. Tips: bushes hide you, sprinting is loud, and hunters can't see behind them. Sneak up from behind to <b>BOOP</b> them and steal their hat.</p>
        ${rows}
        <div class="sel-actions"><button class="big-btn back">Back</button></div>
      </div>`,
      'menu',
    );
    this.on('.back', onBack);
  }

  pause(onResume: () => void, onQuit: () => void) {
    this.show(
      `<div class="title-card small-card">
        <h2>Paused</h2>
        <p class="small">The hunters are also on a sandwich break.</p>
        <button class="big-btn resume">Resume</button>
        <button class="mid-btn mute">${muted ? '🔇 Sound off' : '🔊 Sound on'}</button>
        <button class="mid-btn quit">Quit to menu</button>
      </div>`,
      'overlay',
    );
    this.on('.resume', onResume);
    this.on('.quit', onQuit);
    this.on('.mute', (el) => {
      el.textContent = toggleMute() ? '🔇 Sound off' : '🔊 Sound on';
    });
  }

  result(r: GameResult, animal: AnimalDef, map: MapDef, newUnlocks: string[], onRetry: () => void, onMenu: () => void) {
    const t = `${Math.floor(r.time / 60)}:${Math.floor(r.time % 60).toString().padStart(2, '0')}`;
    if (r.win) {
      const reasons = ['Escaped', 'Untouched', `Under ${Math.floor(map.parTime / 60)}:${(map.parTime % 60).toString().padStart(2, '0')}`];
      const starHtml = r.stars.map((s, i) => `<div class="star ${s ? 'on' : ''}" style="animation-delay:${i * 0.25}s">★<span>${reasons[i]}</span></div>`).join('');
      this.show(
        `<div class="title-card">
          <h2>You survived! 🎉</h2>
          <div class="stars">${starHtml}</div>
          <p>${animal.name} lives to see another day. The hunters go home and eat Tofurky.</p>
          <p class="small">Time ${t} · Hits taken ${r.hitsTaken} · Hats stolen ${r.booped}</p>
          ${newUnlocks.map((u) => `<div class="unlock">🔓 Unlocked: ${u}</div>`).join('')}
          <button class="big-btn menu-btn">Continue</button>
          <button class="mid-btn retry">Play again</button>
        </div>`,
        'overlay',
      );
    } else {
      const k = r.killer;
      this.show(
        `<div class="title-card">
          <h2>You've been mounted. 🪵</h2>
          <div class="plaque">
            <div class="plaque-emoji">${ANIMAL_EMOJI[animal.id]}</div>
            <div class="plaque-text">${animal.name}<br/><small>${map.name}, ${new Date().getFullYear()}</small></div>
          </div>
          <p class="quote">"${k ? pickLine(k.kind) : 'Got him!'}" — ${k?.name ?? 'Some guy'}</p>
          <p class="small">Time ${t}. Tip: ${pickTip()}</p>
          <button class="big-btn retry">Try again</button>
          <button class="mid-btn menu-btn">Menu</button>
        </div>`,
        'overlay',
      );
    }
    this.on('.retry', onRetry);
    this.on('.menu-btn', onMenu);
  }
}

function pickLine(kind: HunterKind) {
  const lines: Record<HunterKind, string[]> = {
    bow: ['Didn\'t even hear me, did ya?', 'Traditional methods, baby.'],
    rifle: ['That one\'s going over the fireplace.', 'Tell my wife I\'ll be home for dinner.'],
    shotgun: ['Spray and pray, honey.', 'Woo! Pass the shells!'],
    ebike: ['Sorry, didn\'t see you there. Actually I did.', 'Bike lanes are for everyone.'],
    ghillie: ['I was the bush all along.', '...'],
  };
  const l = lines[kind];
  return l[Math.floor(Math.random() * l.length)];
}

function pickTip() {
  const tips = [
    'Hide in bushes. Hunters are bad at bushes.',
    'Sprinting is loud. Walking is sneaky.',
    'A red laser means Rifle Randy or Ghillie Gus is about to fire. Move!',
    'Arrows are slow. Zig-zag!',
    'Hunters can\'t see behind them. Boop them from behind.',
    'Ghillie Gus looks like a bush with eyes. Because he is.',
  ];
  return tips[Math.floor(Math.random() * tips.length)];
}
