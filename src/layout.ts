// Screen layout for phones, tablets and foldables.
//
// "full":  the 3D view fills the screen and the HUD floats on top (regular phones, unfolded inner screen).
// "split": the 3D view sits in the top part and the controls plus stats get their own panel below.
//          Used for the half-folded "laptop" pose (fold runs across the screen). Flat portrait screens
//          (e.g. the iPhone Duo outer screen held upright) stay "full" with a portrait HUD.
//
// Fold detection uses the web standards WebKit exposes for foldables when available
// (Viewport Segments API and Device Posture API) and falls back to the viewport shape.
// The player can force a layout from the pause menu.

export type LayoutMode = 'full' | 'split';
export type LayoutPref = 'auto' | 'split' | 'full';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  mode: LayoutMode;
  /** Why this mode was chosen, for debugging (`?layout-debug`). */
  reason: 'pref' | 'fold' | 'hinge' | 'posture' | 'default';
  width: number;
  height: number;
  /** Where the 3D view goes. */
  view: Rect;
  /** Controls and stats panel (split mode only). */
  panel: Rect | null;
}

// v2: layouts changed (portrait no longer splits), so earlier test choices start fresh at auto.
const PREF_KEY = 'huntdeer.layout.v2';

interface ViewportSegments {
  segments?: DOMRect[] | null;
}
interface DevicePosture extends EventTarget {
  type?: string;
}

function readPref(): LayoutPref {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'split' || v === 'full' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

let pref: LayoutPref = readPref();

/**
 * Native hinge state from the iOS app (UIHingeInteraction, iOS 27.1+; see SceneDelegate.swift).
 * WKWebView doesn't expose the web fold APIs, so this is the main signal on the iPhone Duo.
 */
let hinge: { status: string; angle: number } | null = null;
(window as unknown as { __huntdeerHinge: (status: string, angle: number) => void }).__huntdeerHinge = (status, angle) => {
  hinge = { status, angle };
  refreshLayout();
};
export function hingeState() {
  return hinge;
}
let current: Layout | null = null;
const listeners = new Set<(l: Layout) => void>();

export function layoutPref() {
  return pref;
}

export function setLayoutPref(p: LayoutPref) {
  pref = p;
  try {
    localStorage.setItem(PREF_KEY, p);
  } catch {
    // Private mode etc.: the choice just lasts for this session.
  }
  refreshLayout();
}

function viewportSize() {
  // The app root is position:fixed inset:0, so its box is the real drawable area even while
  // window.innerWidth/innerHeight still report the previous screen after a fold or unfold.
  const app = document.getElementById('app');
  const r = app?.getBoundingClientRect();
  const w = Math.round(r && r.width > 0 ? r.width : window.innerWidth);
  const h = Math.round(r && r.height > 0 ? r.height : window.innerHeight);
  return { w, h };
}

/** Two segments stacked top/bottom means the fold runs horizontally across the screen. */
function stackedSegments(): DOMRect[] | null {
  const segs = (window as unknown as { viewport?: ViewportSegments }).viewport?.segments;
  if (!segs || segs.length !== 2) return null;
  const [a, b] = segs[0].top <= segs[1].top ? [segs[0], segs[1]] : [segs[1], segs[0]];
  return b.top >= a.bottom - 1 ? [a, b] : null;
}

function posture(): string | undefined {
  return (navigator as unknown as { devicePosture?: DevicePosture }).devicePosture?.type;
}

/** Split with the view on top taking `frac` of the height. */
function splitAt(w: number, h: number, viewH: number, gap = 0): { view: Rect; panel: Rect } {
  const vh = Math.round(viewH);
  return {
    view: { x: 0, y: 0, w, h: vh },
    panel: { x: 0, y: vh + gap, w, h: h - vh - gap },
  };
}

export function computeLayout(): Layout {
  const { w, h } = viewportSize();
  const full = (reason: Layout['reason']): Layout => ({ mode: 'full', reason, width: w, height: h, view: { x: 0, y: 0, w, h }, panel: null });
  const split = (reason: Layout['reason'], viewH: number, gap = 0): Layout => ({ mode: 'split', reason, width: w, height: h, ...splitAt(w, h, viewH, gap) });
  // Portrait view gets a bit more than half; the panel needs ~260px for the controls.
  const defaultSplit = () => Math.max(h * 0.4, Math.min(h * 0.58, h - 260));

  if (pref === 'full') return full('pref');
  const segs = stackedSegments();
  if (segs) {
    // Use the real fold line so nothing important sits on the crease.
    const gap = Math.max(0, segs[1].top - segs[0].bottom);
    return split('fold', segs[0].bottom, gap);
  }
  if (pref === 'split') return split('pref', w > h ? h * 0.55 : defaultSplit());
  // Half-folded with the crease running across the screen: split exactly at the crease.
  const crease = divisions.find((d) => d.w > d.h);
  if (crease) return split('fold', crease.y, crease.h);
  // Half-folded without a crease rect: laptop pose, fold assumed across the middle.
  // (A vertical crease is the book pose; the game stays full there.)
  if (hinge?.status === 'partiallyOpen' && !divisions.length) return split('hinge', h / 2);
  // Posture says half-folded but there are no segments to tell us where: assume the fold is mid-screen.
  // Only for a landscape viewport; a portrait one is handled below anyway.
  if (posture() === 'folded' && w > h) return split('posture', h / 2);
  return full('default');
}

function same(a: Layout | null, b: Layout) {
  if (!a) return false;
  const r = (x: Rect | null, y: Rect | null) => (!x && !y) || (!!x && !!y && x.x === y.x && x.y === y.y && x.w === y.w && x.h === y.h);
  return a.mode === b.mode && a.reason === b.reason && a.width === b.width && a.height === b.height && r(a.view, b.view) && r(a.panel, b.panel);
}

function apply(l: Layout) {
  const root = document.documentElement;
  root.dataset.layout = l.mode;
  root.dataset.orient = l.width < l.height ? 'portrait' : 'landscape';
  root.style.setProperty('--view-h', `${l.view.h}px`);
  root.style.setProperty('--panel-top', `${l.panel ? l.panel.y : l.height}px`);
  root.style.setProperty('--panel-h', `${l.panel ? l.panel.h : 0}px`);
}

export function refreshLayout() {
  const l = computeLayout();
  if (same(current, l)) return current!;
  current = l;
  apply(l);
  for (const fn of listeners) fn(l);
  return l;
}

export function getLayout(): Layout {
  return current ?? refreshLayout();
}

export function onLayout(fn: (l: Layout) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Watch everything that can change the drawable area. Folding, unfolding and moving between the
 * outer and inner screen do not always fire `resize` at a moment when the new size is final,
 * so also observe the root element and re-check a little later.
 */
export function watchLayout() {
  let timers: number[] = [];
  const kick = () => {
    refreshLayout();
    timers.forEach(clearTimeout);
    timers = [120, 400, 1000].map((ms) => window.setTimeout(refreshLayout, ms));
  };
  window.addEventListener('resize', kick);
  window.addEventListener('orientationchange', kick);
  window.visualViewport?.addEventListener('resize', kick);
  const app = document.getElementById('app');
  if (app && 'ResizeObserver' in window) new ResizeObserver(kick).observe(app);
  (navigator as unknown as { devicePosture?: DevicePosture }).devicePosture?.addEventListener('change', kick);
  for (const q of ['(horizontal-viewport-segments: 2)', '(vertical-viewport-segments: 2)', '(device-posture: folded)']) {
    try {
      window.matchMedia(q).addEventListener('change', kick);
    } catch {
      // Older WebKit: matchMedia exists but the feature is unknown, which is fine.
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick();
  });
  refreshLayout();
}

/**
 * Occluded areas from iOS (iPhone Duo outer camera; UIKit reserved regions), in CSS px of the page.
 * iOS also reports a whole-edge safe-area inset for that camera (~84px), which pushed the HUD far
 * from the edge. With the real rects we hug the edges and only step around the camera itself.
 */
type Occl = { x: number; y: number; w: number; h: number };
let occlusions: Occl[] | null = null;
/** Fold (crease) rects from iOS while half-folded; a horizontal one gives the exact split line. */
let divisions: Occl[] = [];
(window as unknown as { __huntdeerRegions: (r: { occlusion: Occl[]; division: Occl[] }) => void }).__huntdeerRegions = (r) => {
  occlusions = r.occlusion ?? [];
  divisions = r.division ?? [];
  applyOcclusions();
  refreshLayout();
};
function applyOcclusions() {
  const root = document.documentElement;
  const { w, h } = viewportSize();
  const cut = { tl: 0, tr: 0, bl: 0, br: 0 };
  for (const r of occlusions ?? []) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const top = cy < h / 2;
    const key = `${top ? 't' : 'b'}${cx < w / 2 ? 'l' : 'r'}` as keyof typeof cut;
    // Clearance from that corner's top/bottom edge to past the camera, plus a small gap.
    cut[key] = Math.max(cut[key], Math.min(Math.round((top ? r.y + r.h : h - r.y) + 6), Math.round(h * 0.35)));
  }
  for (const k of Object.keys(cut) as (keyof typeof cut)[]) root.style.setProperty(`--cut-${k}`, `${cut[k]}px`);
  if (occlusions) root.dataset.occl = occlusions.length ? 'corner' : 'none';
  else delete root.dataset.occl;
  // Book pose (crease running top to bottom): menus move to one side so nothing sits on the fold.
  const vCrease = divisions.find((d) => d.h > d.w);
  if (vCrease) {
    root.dataset.crease = 'v';
    root.style.setProperty('--crease-r', `${Math.round(vCrease.x + vCrease.w)}px`);
  } else delete root.dataset.crease;
}
onLayout(() => applyOcclusions());
