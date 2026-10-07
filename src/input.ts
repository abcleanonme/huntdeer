// Unified keyboard/mouse + touch input. Touch: left half = floating joystick, right half = drag to look.

export class Input {
  moveX = 0;
  moveY = 0;
  sprint = false;
  lookDX = 0;
  lookDY = 0;
  private pressed = new Set<string>();
  private edges = new Set<string>();
  readonly isTouch: boolean;

  private joyId: number | null = null;
  private joyStart = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private mouseDown = false;
  private joyBase: HTMLDivElement;
  private joyKnob: HTMLDivElement;
  enabled = false;

  constructor(el: HTMLElement) {
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this.joyBase = document.createElement('div');
    this.joyBase.className = 'joy-base';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    document.body.appendChild(this.joyBase);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.pressed.add(e.code);
      this.edges.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
    window.addEventListener('blur', () => this.pressed.clear());

    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.mouseDown = true;
      this.lookLast = { x: e.clientX, y: e.clientY };
      if (!this.isTouch && document.pointerLockElement !== el) {
        try {
          const r = el.requestPointerLock?.() as unknown as Promise<void> | undefined;
          r?.catch?.(() => {});
        } catch {
          // Pointer lock is optional; click-drag look still works.
        }
      }
    });
    window.addEventListener('mouseup', () => (this.mouseDown = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === el) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      } else if (this.mouseDown) {
        this.lookDX += e.clientX - this.lookLast.x;
        this.lookDY += e.clientY - this.lookLast.y;
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
    });

    el.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    el.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    el.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    el.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
  }

  private onTouchStart(e: TouchEvent) {
    e.preventDefault();
    if (!this.enabled) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth * 0.45 && this.joyId === null) {
        this.joyId = t.identifier;
        this.joyStart = { x: t.clientX, y: t.clientY };
        this.joyVec = { x: 0, y: 0 };
        this.joyBase.style.display = 'block';
        this.joyBase.style.left = `${t.clientX}px`;
        this.joyBase.style.top = `${t.clientY}px`;
        this.joyKnob.style.transform = 'translate(-50%, -50%)';
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  private onTouchMove(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) {
        const max = 55;
        let dx = t.clientX - this.joyStart.x;
        let dy = t.clientY - this.joyStart.y;
        const len = Math.hypot(dx, dy);
        if (len > max) {
          dx = (dx / len) * max;
          dy = (dy / len) * max;
        }
        this.joyVec = { x: dx / max, y: dy / max };
        this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (t.identifier === this.lookId) {
        this.lookDX += (t.clientX - this.lookLast.x) * 1.4;
        this.lookDY += (t.clientY - this.lookLast.y) * 1.4;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  private onTouchEnd(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.joyId) {
        this.joyId = null;
        this.joyVec = { x: 0, y: 0 };
        this.joyBase.style.display = 'none';
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
      }
    }
  }

  /** Simulate a key press from an on-screen button. */
  tap(code: string) {
    this.edges.add(code);
  }

  /** Returns true once per press. */
  consume(...codes: string[]) {
    let hit = false;
    for (const c of codes) if (this.edges.has(c)) hit = true;
    return hit;
  }

  update() {
    let x = 0;
    let y = 0;
    if (this.pressed.has('KeyW') || this.pressed.has('ArrowUp')) y -= 1;
    if (this.pressed.has('KeyS') || this.pressed.has('ArrowDown')) y += 1;
    if (this.pressed.has('KeyA') || this.pressed.has('ArrowLeft')) x -= 1;
    if (this.pressed.has('KeyD') || this.pressed.has('ArrowRight')) x += 1;
    const len = Math.hypot(x, y);
    if (len > 0) {
      x /= len;
      y /= len;
    }
    const joyLen = Math.hypot(this.joyVec.x, this.joyVec.y);
    if (joyLen > 0.1) {
      x = this.joyVec.x;
      y = this.joyVec.y;
    }
    this.moveX = x;
    this.moveY = y;
    this.sprint = this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight') || joyLen > 0.9;
  }

  endFrame() {
    this.edges.clear();
    this.lookDX = 0;
    this.lookDY = 0;
  }

  reset() {
    this.edges.clear();
    this.pressed.clear();
    this.joyId = null;
    this.lookId = null;
    this.joyVec = { x: 0, y: 0 };
    this.joyBase.style.display = 'none';
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
