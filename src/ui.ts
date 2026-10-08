// Menu screens: title, critter/map select, field guide, hunter log, achievements, case file, pause, results.
import {
  ACHIEVEMENTS, ANIMALS, HUNTERS, LODGE_PAGE, MAPS, REGULAR_KINDS,
  type AchievementDef, type AnimalDef, type HunterKind, type MapDef,
} from './data';
import type { GameResult } from './game';
import { muted, sfx, toggleMute, unlockAudio } from './audio';
import { formatHeight, PERSONALITY_LABEL, type Personality } from './hunters';
import type { HunterLook } from './models';
import { animalPortrait, hunterPortrait, lockedPortrait } from './portraits';
import { totalStars, type HatEntry, type SaveData } from './save';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const starStr = (n: number, of = 3) => `<span class="stars-inline">${'<i class="st on"></i>'.repeat(n)}${'<i class="st"></i>'.repeat(of - n)}</span>`;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export function animalUnlocked(save: SaveData, a: AnimalDef) {
  return a.unlockSecret ? save.kingDefeated : totalStars(save) >= a.unlockStars;
}

export function mapUnlocked(save: SaveData, m: MapDef) {
  return m.hidden ? save.secretsDone.includes('swamp') : totalStars(save) >= m.unlockStars;
}

export interface TitleActions {
  play: () => void;
  log: () => void;
  achievements: () => void;
  caseFile: () => void;
}

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

  title(save: SaveData, act: TitleActions) {
    const hasCase = save.secretsFound.length > 0;
    this.show(
      `<div class="title-card">
        <div class="logo">HUNT<span>DEER</span></div>
        <div class="title-art">
          <img src="${animalPortrait('deer')}" alt="" />
          <img class="flip" src="${hunterPortrait('title', 'rifle')}" alt="" />
        </div>
        <button class="big-btn play">PLAY</button>
        <div class="title-row">
          <button class="mid-btn log">Hunter Log <b>${save.hats.length}</b></button>
          <button class="mid-btn ach">Achievements <b>${Object.keys(save.achievements).length}/${ACHIEVEMENTS.length}</b></button>
        </div>
        ${hasCase ? `<button class="mid-btn case">Case File <b>${save.secretsDone.length + (save.kingDefeated ? 1 : 0)}/5</b></button>` : ''}
      </div>`,
      'title',
    );
    this.on('.play', act.play);
    this.on('.log', act.log);
    this.on('.ach', act.achievements);
    this.on('.case', act.caseFile);
  }

  select(save: SaveData, onStart: (a: AnimalDef, m: MapDef) => void, onGuide: () => void, onBack: () => void) {
    const stars = totalStars(save);
    if (!animalUnlocked(save, ANIMALS.find((a) => a.id === this.selAnimal)!)) this.selAnimal = 'deer';
    if (!mapUnlocked(save, MAPS.find((m) => m.id === this.selMap)!)) this.selMap = 'forest';
    const mainMaps = MAPS.filter((m) => !m.hidden);

    const animalCards = ANIMALS.filter((a) => !a.unlockSecret || save.kingDefeated || save.secretsFound.length > 0)
      .map((a) => {
        const ok = animalUnlocked(save, a);
        const how = a.unlockSecret ? 'Somewhere, a moose waits' : `Needs ${a.unlockStars} stars`;
        return `<button class="card animal ${ok ? '' : 'locked'} ${a.id === this.selAnimal ? 'sel' : ''}" data-id="${a.id}" ${ok ? '' : 'disabled'}>
          <img class="portrait" src="${ok ? animalPortrait(a.id) : lockedPortrait(a.id)}" alt="" />
          <div class="name">${ok ? a.name : '???'}</div>
          <div class="small">${ok ? a.ability.name : how}</div>
        </button>`;
      })
      .join('');
    const showLodge = save.secretsFound.length > 0;
    const mapCards = MAPS.filter((m) => !m.hidden || showLodge)
      .map((m) => {
        const ok = mapUnlocked(save, m);
        const st = save.stars[m.id] ?? 0;
        const sub = ok ? (m.hidden ? (save.kingDefeated ? 'Dethroned' : 'Gala night') : starStr(st)) : m.hidden ? 'Follow the clues' : `Needs ${m.unlockStars} stars`;
        const solved = m.secret && save.secretsDone.includes(m.id);
        return `<button class="card map ${ok ? '' : 'locked'} ${m.id === this.selMap ? 'sel' : ''} ${m.hidden ? 'hidden-map' : ''}" data-id="${m.id}" ${ok ? '' : 'disabled'}>
          <div class="swatch" style="background:linear-gradient(${hex(m.sky)} 0 45%, ${hex(m.ground)} 45%)">${solved ? '<span class="solved">CASE CLOSED</span>' : ''}</div>
          <div class="name">${ok ? m.name : '???'}</div>
          <div class="small">${sub}</div>
        </button>`;
      })
      .join('');

    const a = ANIMALS.find((x) => x.id === this.selAnimal)!;
    const m = MAPS.find((x) => x.id === this.selMap)!;
    const hunters = (Object.entries(m.hunters) as [HunterKind, number][])
      .map(([k, n]) => `<span class="chip">${n}× ${HUNTERS[k].name}</span>`)
      .join('');
    const vis = a.visibility < 0.8 ? 'sneaky' : a.visibility > 1.2 ? 'very visible' : 'average';
    let secretLine = '';
    if (m.secret && save.secretsDone.includes(m.id)) secretLine = `<div class="secret-line">Case file chapter ${m.secret.chapter}: solved.</div>`;
    else if (m.secret && save.secretsFound.includes(m.id)) secretLine = `<div class="secret-line">Something odd is still out here.</div>`;

    this.show(
      `<div class="select">
        <div class="sel-head"><button class="back-btn back" aria-label="Back"><i class="chev"></i>Back</button><h2>Pick your critter</h2><div class="stars-total"><i class="st on"></i> ${stars} / ${mainMaps.length * 3}</div></div>
        <div class="star-help"><i class="st on"></i><span>Each woods awards up to <b>3 stars</b>: escape, take no hits, and beat the par time. Stars unlock new critters and woods. You have <b>${stars}</b>${nextUnlock(stars)}.</span></div>
        <div class="row">${animalCards}</div>
        <div class="detail">
          <b>${a.name}</b> <i>${a.tagline}</i><br/>
          <span class="ability-name">${a.ability.name}:</span> ${a.ability.desc}
          <div class="stats">Hearts ${a.hearts} · Top speed ${a.runSpeed} · ${vis}</div>
        </div>
        <h2>Pick your woods</h2>
        <div class="row">${mapCards}</div>
        <div class="detail">
          <b>${m.name}</b> <i>${m.blurb}</i><br/>
          <div class="objlist">${m.objectives.map((o) => (o.type === 'eat' ? `Eat ${o.count} ${m.food.name}` : o.type === 'survive' ? `Survive ${o.count}s` : o.type === 'boop' || o.type === 'rescue' || o.type === 'collect' ? `${o.label} (${o.count})` : o.label)).join(' &rarr; ')}</div>
          ${secretLine}
          <div class="chips">${hunters}</div>
        </div>
        <div class="sel-actions">
          <button class="mid-btn guide">Field Guide</button>
          <button class="big-btn go">GO!</button>
        </div>
      </div>`,
      'menu',
    );
    const again = () => this.select(save, onStart, onGuide, onBack);
    this.on('.card.animal', (el) => {
      this.selAnimal = el.dataset.id!;
      again();
    });
    this.on('.card.map', (el) => {
      this.selMap = el.dataset.id!;
      again();
    });
    this.on('.guide', onGuide);
    this.on('.back', onBack);
    this.on('.go', () => onStart(a, m));
  }

  guide(save: SaveData, onBack: () => void) {
    const kinds: HunterKind[] = [...REGULAR_KINDS, ...(save.secretsDone.includes('swamp') ? (['king'] as HunterKind[]) : [])];
    const rows = kinds
      .map((k) => {
        const h = HUNTERS[k];
        const logged = save.hats.filter((x) => x.kind === k).length;
        return `<div class="guide-row">
          <img class="portrait" src="${hunterPortrait(`guide-${k}`, k)}" alt="" />
          <div><b>${h.name}</b> <span class="small">· ${logged} hat${logged === 1 ? '' : 's'} logged</span><br/>${h.desc}
          <div class="small">Sight ${h.viewRange}m · ${h.loudness ? 'loud' : 'silent'} · ${h.projectile === 'none' ? 'unarmed' : `aim time ${h.aimTime}s`} · Brags about: ${h.stat.label.toLowerCase()}</div>
          <div class="quote">"${esc(h.quips[0])}"</div></div>
        </div>`;
      })
      .join('');
    this.show(
      `<div class="select">
        <div class="sel-head"><button class="back-btn back" aria-label="Back"><i class="chev"></i>Back</button><h2>Field Guide: North American Hunters</h2><div></div></div>
        <p class="small">Know your enemy. Bushes hide you, sprinting is loud, and hunters can't see behind them. Sneak up behind a hunter (or catch one napping) and BOOP to knock their hat off, then grab it for your log.</p>
        ${rows}
      </div>`,
      'menu',
    );
    this.on('.back', onBack);
  }

  hunterLog(save: SaveData, onBack: () => void) {
    const hats = [...save.hats].sort((a, b) => b.score - a.score);
    const kindsLogged = new Set(hats.map((h) => h.kind)).size;
    const best = hats[0];
    const cards = hats.length
      ? hats.map((h, i) => trophyCard(h, i)).join('')
      : `<p class="empty">No hats yet. Sneak up behind a hunter, press BOOP, then grab the hat they drop.</p>`;
    this.show(
      `<div class="select">
        <div class="sel-head"><button class="back-btn back" aria-label="Back"><i class="chev"></i>Back</button><h2>Hunter Log</h2><div></div></div>
        <div class="log-summary">
          <div><b>${save.totalHats}</b><span>hats collected</span></div>
          <div><b>${kindsLogged}/${REGULAR_KINDS.length + 1}</b><span>species logged</span></div>
          <div><b>${best ? best.score : '-'}</b><span>best D&amp;C score</span></div>
        </div>
        <p class="small">Scored on the official Doe &amp; Crockett system: weight, height, bragging rights, and a big bonus for golden vests.</p>
        <div class="log-grid">${cards}</div>
      </div>`,
      'menu',
    );
    this.on('.back', onBack);
  }

  achievements(save: SaveData, onBack: () => void) {
    const cards = ACHIEVEMENTS.map((a) => {
      const got = save.achievements[a.id];
      const hide = a.secret && !got;
      return `<div class="ach-card ${got ? 'got' : ''}">
        <div class="ach-badge">${got ? '' : '?'}</div>
        <div><b>${hide ? 'Secret achievement' : a.name}</b><div class="small">${hide ? 'Keep exploring.' : a.desc}</div>${got ? `<div class="small date">${got}</div>` : ''}</div>
      </div>`;
    }).join('');
    this.show(
      `<div class="select">
        <div class="sel-head"><button class="back-btn back" aria-label="Back"><i class="chev"></i>Back</button><h2>Achievements</h2><div class="stars-total">${Object.keys(save.achievements).length}/${ACHIEVEMENTS.length}</div></div>
        <div class="ach-grid">${cards}</div>
      </div>`,
      'menu',
    );
    this.on('.back', onBack);
  }

  caseFile(save: SaveData, onBack: () => void) {
    const pages = MAPS.filter((m) => m.secret)
      .map((m) => {
        const s = m.secret!;
        const done = save.secretsDone.includes(m.id);
        const found = save.secretsFound.includes(m.id);
        if (done) return casePage(`Chapter ${s.chapter}: ${s.title}`, s.page, m.name);
        return `<div class="case-page locked"><h3>Chapter ${s.chapter}: ???</h3><p>${found ? `Unfinished business in ${m.name}.` : 'Not found yet. Something in these woods doesn\'t belong.'}</p></div>`;
      })
      .join('');
    const finale = save.kingDefeated
      ? casePage(`Finale: ${LODGE_PAGE.title}`, LODGE_PAGE.page, 'Trophy King Lodge')
      : save.secretsDone.includes('swamp')
        ? `<div class="case-page locked"><h3>Finale: ???</h3><p>The map leads to the Trophy King Lodge.</p></div>`
        : '';
    this.show(
      `<div class="select">
        <div class="sel-head"><button class="back-btn back" aria-label="Back"><i class="chev"></i>Back</button><h2>Case File</h2><div></div></div>
        <p class="small">Somebody is organizing these hunters. Piece it together.</p>
        ${pages}${finale}
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
        <button class="mid-btn mute">${muted ? 'Sound: off' : 'Sound: on'}</button>
        <button class="mid-btn quit">Quit to menu</button>
      </div>`,
      'overlay',
    );
    this.on('.resume', onResume);
    this.on('.quit', onQuit);
    this.on('.mute', (el) => {
      el.textContent = toggleMute() ? 'Sound: off' : 'Sound: on';
    });
  }

  result(
    r: GameResult,
    animal: AnimalDef,
    map: MapDef,
    extra: { unlocks: string[]; achievements: AchievementDef[]; story: { title: string; page: string } | null },
    onRetry: () => void,
    onMenu: () => void,
  ) {
    const t = `${Math.floor(r.time / 60)}:${Math.floor(r.time % 60).toString().padStart(2, '0')}`;
    const hats = r.hats.length
      ? `<div class="run-hats">${r.hats.map((h) => `<div class="mini-hat ${h.golden ? 'golden' : ''}"><img src="${hunterPortrait(h.id, h.kind, h.look as unknown as HunterLook)}" alt="" /><span>${esc(h.name)}</span><b>${h.score}</b></div>`).join('')}</div>`
      : '';
    const story = extra.story ? casePage(extra.story.title, extra.story.page, 'New case file page') : '';
    const unlocks = extra.unlocks.map((u) => `<div class="unlock">Unlocked: ${esc(u)}</div>`).join('');
    const ach = extra.achievements.map((a) => `<div class="unlock ach">Achievement: ${esc(a.name)}</div>`).join('');
    if (r.win) {
      const par = `${Math.floor(map.parTime / 60)}:${(map.parTime % 60).toString().padStart(2, '0')}`;
      const reasons = ['Escaped', 'Untouched', `Under ${par}`];
      const starHtml = r.stars.map((s, i) => `<div class="star ${s ? 'on' : ''}" style="animation-delay:${i * 0.25}s"><i class="st big ${s ? 'on' : ''}"></i><span>${reasons[i]}</span></div>`).join('');
      this.show(
        `<div class="title-card">
          <h2>${r.kingDefeated ? 'The King is dethroned!' : 'You survived!'}</h2>
          <div class="stars">${starHtml}</div>
          <p>${animal.name} lives to see another day.</p>
          <p class="small">Time ${t} · Hits taken ${r.hitsTaken} · Hats logged ${r.hats.length}</p>
          ${hats}${story}${unlocks}${ach}
          <button class="big-btn menu-btn">Continue</button>
          <button class="mid-btn retry">Play again</button>
        </div>`,
        'overlay',
      );
    } else {
      const k = r.killerKind;
      this.show(
        `<div class="title-card">
          <h2>You've been mounted.</h2>
          <div class="plaque">
            <img class="plaque-img" src="${animalPortrait(animal.id)}" alt="" />
            <div class="plaque-text">${animal.name}<br/><small>${map.name}, ${new Date().getFullYear()}</small></div>
          </div>
          <p class="quote">"${esc(k ? pickLine(k) : 'Got one!')}" - ${esc(r.killer ?? 'Some guy')}</p>
          <p class="small">Time ${t}. Tip: ${pickTip()}</p>
          ${hats}${story}${ach}
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

/** ", next unlock at N stars: X" for the select screen. */
function nextUnlock(stars: number) {
  const next = [...ANIMALS.filter((a) => !a.unlockSecret), ...MAPS.filter((m) => !m.hidden)]
    .filter((x) => x.unlockStars > stars)
    .sort((x, y) => x.unlockStars - y.unlockStars)[0];
  return next ? `; next unlock at <b>${next.unlockStars}</b>: ${next.name}` : '; everything is unlocked';
}

function casePage(title: string, text: string, sub: string) {
  const paras = text.split('\n\n').map((p) => `<p>${esc(p.trim())}</p>`).join('');
  return `<div class="case-page"><div class="case-sub">${esc(sub)}</div><h3>${esc(title)}</h3>${paras}</div>`;
}

function trophyCard(h: HatEntry, rank: number) {
  const def = HUNTERS[h.kind];
  const map = MAPS.find((m) => m.id === h.map);
  return `<div class="trophy ${h.golden ? 'golden' : ''}">
    <div class="trophy-rank">#${rank + 1}</div>
    <img class="portrait" src="${hunterPortrait(h.id, h.kind, h.look as unknown as HunterLook)}" alt="" />
    <div class="trophy-body">
      <b>${esc(h.name)}</b>
      <div class="small">${def.name}${h.golden ? ' · Golden Vest' : ''} · ${map?.name ?? ''}</div>
      <table>
        <tr><td>Weight</td><td>${h.weightLbs} lbs</td></tr>
        <tr><td>Height</td><td>${formatHeight(h.heightIn)}</td></tr>
        <tr><td>${esc(h.statLabel)}</td><td>${h.statValue}</td></tr>
        <tr><td>Temperament</td><td>${PERSONALITY_LABEL[h.personality as Personality] ?? esc(h.personality)}</td></tr>
      </table>
      <div class="score">D&amp;C score <b>${h.score}</b></div>
    </div>
  </div>`;
}

function pickLine(kind: HunterKind) {
  const lines: Record<HunterKind, string[]> = {
    bow: ['Didn\'t even hear me, did ya?', 'Traditional methods, baby.'],
    rifle: ['That one\'s going over the fireplace.', 'Gun number forty-two, here I come.'],
    shotgun: ['Spray and pray, honey.', 'Woo! Pass the shells!'],
    ebike: ['Sorry, didn\'t see you there. Actually I did.', 'Bike lanes are for everyone.'],
    ghillie: ['I was the bush all along.', '...'],
    drunk: ['*hic* ...did I get it?', 'Somebody hold my beer. Wait, no, I need it.'],
    trapper: ['Right where I left you.', 'Should\'ve watched your step, sugar.'],
    drone: ['Got it on camera, too.', 'Clip it! CLIP IT!'],
    hound: ['Good boy, Duke!', 'Duke found you. Duke always finds you.'],
    king: ['Every wall deserves a head.', 'Have this one bronzed.'],
  };
  const l = lines[kind];
  return l[Math.floor(Math.random() * l.length)];
}

function pickTip() {
  const tips = [
    'Hide in bushes. Hunters are bad at bushes.',
    'Sprinting is loud. Walking is sneaky.',
    'A red laser means somebody is about to fire. Move!',
    'Arrows are slow. Zig-zag!',
    'Napping hunters can be booped. Cooler Carl naps a lot.',
    'Hound dogs smell you through bushes, but not through water.',
    'Drones can\'t see under trees. Boop the pilot and the drone goes down.',
    'Trapper Tammy leaves traps everywhere. The deer can sniff them out.',
    'Some hunters scare easy. Boop one and watch them run for the truck.',
  ];
  return tips[Math.floor(Math.random() * tips.length)];
}
