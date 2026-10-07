// Progress persistence. localStorage can be unavailable (private mode), so every access is guarded.
import type { MapId } from './data';

export interface SaveData {
  stars: Partial<Record<MapId, number>>;
  bestTime: Partial<Record<MapId, number>>;
  deaths: number;
}

const KEY = 'huntdeer-save-v1';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { stars: {}, bestTime: {}, deaths: 0, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { stars: {}, bestTime: {}, deaths: 0 };
}

export function writeSave(s: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function totalStars(s: SaveData) {
  return Object.values(s.stars).reduce((a, b) => a + (b ?? 0), 0);
}
