// In-game heads-up display (DOM overlay on top of the canvas).
import type { AnimalDef } from './data';

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
  private toasts: HTMLDivElement;
  private pings: HTMLDivElement;
  private pingEls: HTMLDivElement[] = [];
  private flash: HTMLDivElement;
  private hint: HTMLDivElement;
  private lastHearts = '';
  private lastObj = '';

  constructor(
    parent: HTMLElement,
    animal: AnimalDef,
    isTouch: boolean,
    actions: { ability: () => void; boop: () => void; jump: () => void; pause: () => void },
  ) {
    const r = (this.root = document.createElement('div'));
    r.className = 'hud';
    r.innerHTML = `
      <div class="hud-tl">
        <div class="hearts"></div>
        <div class="stamina"><div class="stamina-fill"></div></div>
        <div class="objectives"></div>
      </div>
      <div class="hud-tr">
        <div class="timer">0:00</div>
        <button class="pause-btn" aria-label="Pause">II</button>
      </div>
      <div class="stealth"><span class="stealth-label">HIDDEN</span><div class="stealth-bar"><div class="stealth-fill"></div></div></div>
      <div class="pings"></div>
      <div class="toasts"></div>
      <div class="flash"></div>
      <div class="hint"></div>
      <div class="hud-br">
        <button class="act-btn boop-btn">BOOP</button>
        <button class="act-btn jump-btn">JUMP</button>
        <button class="act-btn ability-btn"><div class="ability-ring"></div><span>${animal.ability.name}</span></button>
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
    this.toasts = q('.toasts');
    this.pings = q('.pings');
    this.flash = q('.flash');
    this.hint = q('.hint');

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
    bind(q('.pause-btn'), actions.pause);

    if (!isTouch) {
      r.classList.add('desktop');
      this.hint.textContent = 'WASD move · Shift sprint · Space jump · E ability · F boop · Mouse look · Esc pause';
      setTimeout(() => this.hint.classList.add('fade'), 9000);
    } else {
      this.hint.textContent = 'Left side: move (push far to sprint) · Right side: look';
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
        return `<div class="obj ${o.done ? 'done' : ''} ${o.locked ? 'locked' : ''}">${o.done ? '✔' : o.locked ? '🔒' : '○'} ${o.label} <b>${prog}</b></div>`;
      })
      .join('');
    if (html === this.lastObj) return;
    this.lastObj = html;
    this.objectives.innerHTML = html;
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

  setFlying(f: boolean) {
    this.jumpBtn.classList.toggle('active', f);
  }

  setPings(pings: Ping[]) {
    while (this.pingEls.length < pings.length) {
      const el = document.createElement('div');
      el.className = 'ping';
      this.pings.appendChild(el);
      this.pingEls.push(el);
    }
    this.pingEls.forEach((el, i) => {
      const p = pings[i];
      if (!p) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      el.style.transform = `rotate(${p.angle}rad) translateY(calc(-1 * min(36vh, 36vw)))`;
      el.style.opacity = `${0.25 + p.strength * 0.75}`;
      el.style.borderBottomColor = p.color;
    });
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toasts.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2800);
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
