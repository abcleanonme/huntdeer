// In-game heads-up display (DOM overlay on top of the canvas).
import type { AnimalDef } from './data';
import { getLayout } from './layout';

export interface ObjectiveView {
  label: string;
  have: number;
  need: number;
  done: boolean;
  locked: boolean;
  isTime?: boolean;
}

export interface Ping {
  angle: number;
  strength: number;
  color: string;
}

export class Hud {
  root: HTMLDivElement;
  private hearts: HTMLDivElement;
  private staminaFill: HTMLDivElement;
  private objectives: HTMLDivElement;
  private timer: HTMLDivElement;
  private stealth: HTMLDivElement;
  private stealthFill: HTMLDivElement;
  private stealthLabel: HTMLSpanElement;
  private abilityBtn: HTMLButtonElement;
  private abilityRing: HTMLDivElement;
  private boopBtn: HTMLButtonElement;
  private jumpBtn: HTMLButtonElement;
  private orangeBtn: HTMLButtonElement;
  private orangeFill: HTMLDivElement;
  private lastOrange = '';
  private toasts: HTMLDivElement;
  private pings: HTMLCanvasElement;
  private pingCtx: CanvasRenderingContext2D | null;
  private pingSize = { w: 0, h: 0, dpr: 0 };
  private pingsDrawn = false;
  private flash: HTMLDivElement;
  private hint: HTMLDivElement;
  private lastHearts = '';
  private lastObj = '';
  private lastSecret = '';
  private lastBoss = '';
  private secretEl: HTMLDivElement;
  private bossEl: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private bannerQueue: { title: string; desc: string }[] = [];
  private bannerBusy = false;

  constructor(
    parent: HTMLElement,
    animal: AnimalDef,
    isTouch: boolean,
    actions: { ability: () => void; boop: () => void; jump: () => void; pause: () => void; orange: () => void },
  ) {
    const r = (this.root = document.createElement('div'));
    r.className = 'hud';
    // .hud-view overlays the 3D view; .hud-panel holds stats, timer/pause and controls. In the full layout the panel is
    // display:contents so its children float over the view as before; in the split layout it becomes the
    // bottom panel (see layout.ts).
    r.innerHTML = `
      <div class="hud-view">
        <div class="boss-bar"><div class="boss-name">THE TROPHY KING</div><div class="boss-hats"></div><div class="boss-tip"></div></div>
        <div class="banner"></div>
        <div class="stealth"><span class="stealth-label">HIDDEN</span><div class="stealth-bar"><div class="stealth-fill"></div></div></div>
        <canvas class="pings"></canvas>
        <div class="toasts"></div>
        <div class="flash"></div>
        <div class="hint"></div>
        <div class="move-hint">drag here<br>to move</div>
      </div>
      <div class="hud-panel">
        <div class="hud-tr">
          <div class="timer">0:00</div>
          <button class="pause-btn" aria-label="Pause">II</button>
        </div>
        <div class="hud-tl">
          <div class="hearts"></div>
          <div class="stamina"><div class="stamina-fill"></div></div>
          <div class="objectives"></div>
          <div class="secret-obj"></div>
        </div>
        <div class="hud-br">
          <button class="act-btn orange-btn"><div class="orange-fill"></div><span>ORANGE</span></button>
          <button class="act-btn boop-btn">BOOP</button>
          <button class="act-btn jump-btn">JUMP</button>
          <button class="act-btn ability-btn"><div class="ability-ring"></div><span>${animal.ability.name}</span></button>
        </div>
      </div>
    `;
    parent.appendChild(r);
    const q = <T extends HTMLElement>(s: string) => r.querySelector(s) as T;
    this.hearts = q('.hearts');
    this.staminaFill = q('.stamina-fill');
    this.objectives = q('.objectives');
    this.timer = q('.timer');
    this.stealth = q('.stealth');
    this.stealthFill = q('.stealth-fill');
    this.stealthLabel = q('.stealth-label');
    this.abilityBtn = q('.ability-btn');
    this.abilityRing = q('.ability-ring');
    this.boopBtn = q('.boop-btn');
    this.jumpBtn = q('.jump-btn');
    this.orangeBtn = q('.orange-btn');
    this.orangeFill = q('.orange-fill');
    this.toasts = q('.toasts');
    this.pings = q('.pings');
    this.pingCtx = this.pings.getContext('2d');
    this.flash = q('.flash');
    this.hint = q('.hint');
    this.secretEl = q('.secret-obj');
    this.bossEl = q('.boss-bar');
    this.bannerEl = q('.banner');

    const bind = (el: HTMLElement, fn: () => void) => {
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      }, { passive: false });
      el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        fn();
      });
    };
    bind(this.abilityBtn, actions.ability);
    bind(this.boopBtn, actions.boop);
    bind(this.jumpBtn, actions.jump);
    bind(this.orangeBtn, actions.orange);
    bind(q('.pause-btn'), actions.pause);

    if (!isTouch) {
      r.classList.add('desktop');
      this.hint.textContent = 'WASD move · Shift sprint · Space jump · E ability · F boop · R wear orange · Mouse look · Esc pause';
      setTimeout(() => this.hint.classList.add('fade'), 9000);
    } else {
      r.classList.add('touch');
      this.hint.textContent = getLayout().mode === 'split' ? 'Bottom left: move (push far to sprint) · Drag the view: look' : 'Left side: move (push far to sprint) · Right side: look';
      setTimeout(() => this.hint.classList.add('fade'), 7000);
    }
  }

  setHearts(have: number, max: number) {
    const s = `${have}/${max}`;
    if (s === this.lastHearts) return;
    this.lastHearts = s;
    this.hearts.innerHTML = Array.from({ length: max }, (_, i) => `<span class="heart ${i < have ? '' : 'empty'}">♥</span>`).join('');
  }

  setStamina(v: number, winded: boolean) {
    this.staminaFill.style.width = `${v * 100}%`;
    this.staminaFill.classList.toggle('winded', winded);
  }

  setObjectives(list: ObjectiveView[]) {
    const html = list
      .map((o) => {
        const prog = o.isTime ? `${Math.min(o.have, o.need)}s / ${o.need}s` : o.need > 1 ? `${Math.min(o.have, o.need)}/${o.need}` : '';
        return `<div class="obj ${o.done ? 'done' : ''} ${o.locked ? 'locked' : ''}"><i class="tick"></i>${o.label} <b>${prog}</b></div>`;
      })
      .join('');
    if (html === this.lastObj) return;
    this.lastObj = html;
    this.objectives.innerHTML = html;
  }

  /** The hidden objective, shown under the regular ones once found. */
  setSecret(v: { label: string; have: number; need: number } | null) {
    const html = v ? `<div class="obj secret ${v.have >= v.need ? 'done' : ''}"><i class="tick"></i>${v.label} <b>${v.need > 1 ? `${Math.min(v.have, v.need)}/${v.need}` : ''}</b></div>` : '';
    if (html === this.lastSecret) return;
    this.lastSecret = html;
    this.secretEl.innerHTML = html;
  }

  setBoss(hatsLeft: number, total: number, vulnerable: boolean) {
    const key = `${hatsLeft}/${total}/${vulnerable}`;
    if (key === this.lastBoss) return;
    this.lastBoss = key;
    this.bossEl.classList.add('on');
    this.bossEl.classList.toggle('vuln', vulnerable);
    this.bossEl.querySelector('.boss-hats')!.innerHTML = Array.from({ length: total }, (_, i) => `<span class="bhat ${i < hatsLeft ? '' : 'gone'}"></span>`).join('');
    this.bossEl.querySelector('.boss-tip')!.textContent =
      hatsLeft <= 0 ? 'Dethroned!' : vulnerable ? 'Reloading! BOOP HIM NOW!' : 'Dodge his shot, then boop him while he reloads';
  }

  /** Achievement-style banner that slides in at the top. Queued so they never overlap. */
  banner(title: string, desc: string) {
    this.bannerQueue.push({ title, desc });
    if (!this.bannerBusy) this.nextBanner();
  }

  private nextBanner() {
    const b = this.bannerQueue.shift();
    if (!b) {
      this.bannerBusy = false;
      return;
    }
    this.bannerBusy = true;
    const el = this.bannerEl;
    el.innerHTML = `<div class="banner-k">Achievement</div><div class="banner-t"></div><div class="banner-d"></div>`;
    el.querySelector('.banner-t')!.textContent = b.title;
    el.querySelector('.banner-d')!.textContent = b.desc;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    setTimeout(() => {
      el.classList.remove('on');
      setTimeout(() => this.nextBanner(), 400);
    }, 3000);
  }

  setTime(t: number) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    this.timer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  setStealth(level: number) {
    const pct = Math.min(1, level) * 100;
    this.stealthFill.style.width = `${pct}%`;
    let label = 'HIDDEN';
    let cls = 'hidden';
    if (level >= 1) {
      label = 'SPOTTED!';
      cls = 'spotted';
    } else if (level > 0.35) {
      label = 'SUSPICIOUS';
      cls = 'sus';
    } else if (level > 0.02) {
      label = 'NOTICED?';
      cls = 'sus';
    }
    this.stealth.className = `stealth ${cls}`;
    this.stealthLabel.textContent = label;
  }

  setAbility(cooldownFrac: number, active: boolean) {
    const deg = (1 - cooldownFrac) * 360;
    this.abilityRing.style.background = `conic-gradient(rgba(255,255,255,0.9) ${deg}deg, rgba(0,0,0,0.35) ${deg}deg)`;
    this.abilityBtn.classList.toggle('ready', cooldownFrac <= 0);
    this.abilityBtn.classList.toggle('active', active);
  }

  setBoop(ready: boolean) {
    this.boopBtn.classList.toggle('ready', ready);
  }

  /** Hunter's orange: hidden when you have none; full when held; drains while worn. */
  setOrange(held: boolean, wornFrac: number) {
    const key = `${held}/${wornFrac.toFixed(2)}`;
    if (key === this.lastOrange) return;
    this.lastOrange = key;
    const show = held || wornFrac > 0;
    this.orangeBtn.style.display = show ? 'block' : 'none';
    this.orangeBtn.classList.toggle('ready', held && wornFrac <= 0);
    this.orangeBtn.classList.toggle('active', wornFrac > 0);
    this.orangeFill.style.height = `${(wornFrac > 0 ? wornFrac : 1) * 100}%`;
  }

  /** Hide the move-stick marker while the joystick is in use. */
  setStick(on: boolean) {
    this.root.classList.toggle('stick-on', on);
  }

  setFlying(f: boolean) {
    this.jumpBtn.classList.toggle('active', f);
  }

  /**
   * Direction arrows around the screen center. Drawn on a canvas that is fully cleared every frame:
   * the old version moved CSS triangles with drop-shadow filters inside a 0x0 box, and iOS WebKit
   * sometimes didn't repaint the area they left, which showed as cursor-trail style ghosts.
   */
  setPings(pings: Ping[]) {
    const ctx = this.pingCtx;
    if (!ctx) return;
    if (!pings.length && !this.pingsDrawn) return;
    const v = getLayout().view;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sz = this.pingSize;
    if (sz.w !== v.w || sz.h !== v.h || sz.dpr !== dpr) {
      // Resizing the backing store also clears it.
      this.pings.width = Math.round(v.w * dpr);
      this.pings.height = Math.round(v.h * dpr);
      this.pings.style.width = `${v.w}px`;
      this.pings.style.height = `${v.h}px`;
      this.pingSize = { w: v.w, h: v.h, dpr };
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.pings.width, this.pings.height);
    this.pingsDrawn = pings.length > 0;
    if (!pings.length) return;
    const radius = Math.min(v.w, v.h) * 0.36;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3 * dpr;
    for (const p of pings) {
      ctx.setTransform(dpr, 0, 0, dpr, (v.w / 2) * dpr, (v.h / 2) * dpr);
      ctx.rotate(p.angle);
      ctx.translate(0, -radius);
      ctx.globalAlpha = 0.25 + p.strength * 0.75;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(14, 12);
      ctx.lineTo(-14, 12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' | 'secret' = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toasts.appendChild(el);
    const life = kind === 'secret' ? 4200 : 2200;
    setTimeout(() => el.classList.add('out'), life);
    setTimeout(() => el.remove(), life + 600);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
  }

  hurt() {
    this.flash.classList.remove('on');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
  }

  destroy() {
    this.root.remove();
  }
}
