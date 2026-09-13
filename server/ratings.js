// Persistent Elo ladder for online (ranked) matches.
// Ratings are kept in memory and flushed to data/ratings.json so they survive restarts.
// Every ranked game updates both players' ratings; casual games never touch the ladder.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'ratings.json');

const START_RATING = 1200;
const K_FACTOR = 32;
const MATCH_WINDOW = 300; // default rating band for matchmaking

export class RatingsStore {
  constructor(file = DATA_FILE) {
    this.file = file;
    this.players = new Map(); // id -> record
    this._saveTimer = null;
    this._loaded = false;
  }

  async load() {
    if (this._loaded) return;
    this._loaded = true;
    try {
      const raw = await readFile(this.file, 'utf8');
      const obj = JSON.parse(raw);
      for (const [id, rec] of Object.entries(obj.players || {})) {
        this.players.set(id, rec);
      }
    } catch {
      // No prior data file — start empty.
    }
  }

  async _persist() {
    try {
      await mkdir(DATA_DIR, { recursive: true });
      const obj = { players: Object.fromEntries(this.players) };
      await writeFile(this.file, JSON.stringify(obj, null, 2), 'utf8');
    } catch { /* ignore persistence errors */ }
  }

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._persist();
    }, 500);
    this._saveTimer.unref?.();
  }

  _ensure(id, name) {
    if (!id) return null;
    if (!this.players.has(id)) {
      this.players.set(id, {
        id,
        name: name || id,
        rating: START_RATING,
        wins: 0,
        losses: 0,
        draws: 0,
        games: 0,
        lastSeen: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    const rec = this.players.get(id);
    if (name) rec.name = name;
    rec.lastSeen = new Date().toISOString();
    return rec;
  }

  // Called when a player connects / joins so their record exists.
  register(id, name) {
    const rec = this._ensure(id, name);
    this._scheduleSave();
    return rec;
  }

  get(id) {
    return this.players.get(id) || null;
  }

  ratingOf(id) {
    return this.players.get(id)?.rating ?? START_RATING;
  }

  // Record a completed ranked game.
  // redId / blackId are stable player ids; winner is 'r' | 'b' | null (draw).
  // Returns { r: {...}, b: {...} } describing new ratings and deltas.
  recordResult(redId, blackId, winner) {
    const red = this._ensure(redId);
    const black = this._ensure(blackId);
    if (!red || !black) return null;

    const scoreR = winner === 'r' ? 1 : winner === 'b' ? 0 : 0.5;
    const scoreB = 1 - scoreR;
    const expR = 1 / (1 + Math.pow(10, (black.rating - red.rating) / 400));
    const expB = 1 - expR;
    const deltaR = Math.round(K_FACTOR * (scoreR - expR));
    const deltaB = Math.round(K_FACTOR * (scoreB - expB));

    red.rating += deltaR;
    black.rating += deltaB;
    red.games++; black.games++;
    if (winner === 'r') { red.wins++; black.losses++; }
    else if (winner === 'b') { black.wins++; red.losses++; }
    else { red.draws++; black.draws++; }
    red.updatedAt = new Date().toISOString();
    black.updatedAt = new Date().toISOString();

    this._scheduleSave();
    return {
      r: { id: red.id, name: red.name, rating: red.rating, delta: deltaR },
      b: { id: black.id, name: black.name, rating: black.rating, delta: deltaB }
    };
  }

  // Top N players by rating, most games first on ties.
  leaderboard(limit = 50) {
    return [...this.players.values()]
      .filter(p => p.games > 0)
      .sort((a, b) => b.rating - a.rating || b.games - a.games)
      .slice(0, limit)
      .map((p, i) => ({
        rank: i + 1,
        id: p.id,
        name: p.name,
        rating: p.rating,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        games: p.games
      }));
  }

  // Pick the best match for `id` from a list of queued player ids (simple rating window).
  bestMatch(candidateIds, selfId) {
    const selfRating = this.ratingOf(selfId);
    let best = null;
    let bestGap = Infinity;
    for (const cid of candidateIds) {
      if (cid === selfId) continue;
      const gap = Math.abs(this.ratingOf(cid) - selfRating);
      if (gap < bestGap) { bestGap = gap; best = cid; }
    }
    // Accept the closest opponent; a soft window keeps queue times short in MVP.
    return bestGap <= MATCH_WINDOW ? best : (candidateIds[0] ?? null);
  }
}
