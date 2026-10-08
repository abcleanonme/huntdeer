// Achievement rules. Fed by in-game events and end-of-run results; writes unlocks into the save.
import { ACHIEVEMENTS, MAPS, REGULAR_KINDS, type AchievementDef, type AnimalId, type MapId } from './data';
import type { GameEvent, GameResult } from './game';
import type { SaveData } from './save';

export class Achiever {
  private runHats = 0;

  constructor(
    private save: () => SaveData,
    private notify: (a: AchievementDef) => void,
  ) {}

  startRun() {
    this.runHats = 0;
  }

  private grant(id: string) {
    const s = this.save();
    if (s.achievements[id]) return;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return;
    s.achievements[id] = new Date().toISOString().slice(0, 10);
    this.notify(def);
  }

  /** Anything that can be decided from the save alone (hat totals, stars, deaths, secrets). */
  checkSave() {
    const s = this.save();
    if (s.totalHats >= 25) this.grant('milliner');
    if (s.deaths >= 10) this.grant('mounted');
    if (s.hats.some((h) => h.golden)) this.grant('golden');
    if (REGULAR_KINDS.every((k) => s.hats.some((h) => h.kind === k))) this.grant('field_guide');
    if (MAPS.filter((m) => !m.hidden).every((m) => (s.stars[m.id] ?? 0) >= 3)) this.grant('all_stars');
    for (const m of s.secretsDone) this.grant(`secret_${m}`);
    if (s.kingDefeated) this.grant('king');
  }

  onEvent(e: GameEvent) {
    switch (e.type) {
      case 'boop':
        this.grant('first_boop');
        if (e.kind === 'hound') this.grant('good_boy');
        if (e.asleep) this.grant('designated');
        break;
      case 'hat':
        this.runHats++;
        if (this.runHats >= 3) this.grant('hat_trick');
        if (e.entry.golden) this.grant('golden');
        break;
      case 'trap':
        this.grant('snared');
        break;
      case 'drone':
        this.grant('airspace');
        break;
      case 'timber':
        this.grant('timber');
        break;
      case 'orange':
        this.grant('orange');
        break;
      case 'scared':
        this.grant('scaredy');
        break;
      case 'roar':
        if (e.count >= 3) this.grant('roar3');
        break;
      case 'stink':
        if (e.count >= 3) this.grant('stink3');
        break;
      case 'secretDone':
        this.grant(`secret_${e.map}`);
        break;
      case 'secretFound':
        break;
    }
    this.checkSave();
  }

  onResult(r: GameResult, map: MapId, animal: AnimalId) {
    if (r.win) {
      if (r.hitsTaken === 0) this.grant('untouched');
      if (r.stars[2]) this.grant('speedy');
      if (map === 'swamp' && animal === 'duck') this.grant('lucky_duck');
    }
    this.checkSave();
  }
}
