// Replay controller: attaches to a Game in `replay` mode, drives seeking and timed playback.
// Supports 1x / 2x / 4x speeds and a scrub slider bound to the ply count.

const BASE_PLY_MS = 1400; // 1x speed — milliseconds per ply

export class ReplayController {
  constructor() {
    this.game = null;
    this.playing = false;
    this.speed = 1;
    this._timer = null;
  }

  attach(game) {
    this.game = game;
    this.stop();
    const playBtn = document.getElementById('rp-play');
    if (playBtn) playBtn.textContent = '▶';
  }

  detach() {
    this.stop();
    this.game = null;
  }

  setSpeed(x) {
    this.speed = [1, 2, 4].includes(x) ? x : 1;
    if (this.playing) { this.stop(); this.play(); }
  }

  seek(n) {
    if (!this.game) return;
    const total = this.game.history.length;
    const target = n === Infinity ? total : Math.max(0, Math.min(total, n | 0));
    this.game.replaySeek(target);
  }

  step(delta) {
    if (!this.game) return;
    const next = (this.game.replayIndex ?? 0) + delta;
    this.seek(next);
  }

  play() {
    if (!this.game) return;
    this.playing = true;
    const btn = document.getElementById('rp-play');
    if (btn) btn.textContent = '⏸';
    const interval = Math.max(80, BASE_PLY_MS / this.speed);
    this._timer = setInterval(() => {
      const idx = this.game.replayIndex ?? 0;
      if (idx >= this.game.history.length) { this.stop(); return; }
      this.step(1);
    }, interval);
  }

  stop() {
    this.playing = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    const btn = document.getElementById('rp-play');
    if (btn) btn.textContent = '▶';
  }

  togglePlay() { this.playing ? this.stop() : this.play(); }
}
