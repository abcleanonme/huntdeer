// Progress persistence. localStorage is the working copy; on iOS it is mirrored to native Preferences,
// because WKWebView may clear localStorage when the device is low on space.
import { MAPS, type HunterKind, type MapId } from './data';
import { nativeLoad, nativeSave } from './native';

export interface HatEntry {
  id: string;
  kind: HunterKind;
  name: string;
  weightLbs: number;
  heightIn: number;
  statLabel: string;
  statValue: number;
  personality: string;
  score: number;
  golden: boolean;
  map: MapId;
  date: string;
  /** Look, so the log can draw a portrait. */
  look: Record<string, unknown>;
}

export interface SaveData {
  stars: Partial<Record<MapId, number>>;
  bestTime: Partial<Record<MapId, number>>;
  deaths: number;
  wins: number;
  hats: HatEntry[];
  totalHats: number;
  achievements: Record<string, string>;
  /** Maps whose secret has been found / completed. */
  secretsFound: MapId[];
  secretsDone: MapId[];
  kingDefeated: boolean;
  /** Every woods + critter pair that has been escaped, as "map:animal" keys. */
  cleared: Record<string, string>;
}

const KEY = 'huntdeer-save-v1';

function blank(): SaveData {
  return {
    stars: {},
    bestTime: {},
    deaths: 0,
    wins: 0,
    hats: [],
    totalHats: 0,
    achievements: {},
    secretsFound: [],
    secretsDone: [],
    kingDefeated: false,
    cleared: {},
  };
}

function parse(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    return { ...blank(), ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

export function loadSave(): SaveData {
  try {
    const s = parse(localStorage.getItem(KEY));
    if (s) return s;
  } catch {
    // ignore
  }
  return blank();
}

/** On native, pull the mirrored copy if it is newer than what localStorage has. */
export async function loadSaveNative(current: SaveData): Promise<SaveData> {
  const raw = await nativeLoad(KEY);
  const s = parse(raw);
  if (!s) return current;
  const score = (d: SaveData) => d.totalHats + d.wins + d.deaths + Object.keys(d.achievements).length;
  return score(s) > score(current) ? s : current;
}

export function writeSave(s: SaveData) {
  const raw = JSON.stringify(s);
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    // ignore
  }
  void nativeSave(KEY, raw);
}

export function totalStars(s: SaveData) {
  // The hidden lodge doesn't count toward unlocks.
  return MAPS.filter((m) => !m.hidden).reduce((a, m) => a + (s.stars[m.id] ?? 0), 0);
}
