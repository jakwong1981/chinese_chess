// DOM bindings: mode switch, controls, HUD updates, history list, clocks, toasts, overlays.
// All lookups use $ shorthand; nothing here talks to Three.js directly.

import { RED, BLACK, opposite, moveToNotation } from '../../shared/rules.js';
import { LEVELS } from './ai.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function fmtClock(ms) {
  if (ms == null || isNaN(ms)) return '--:--';
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 100) return `${m}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.mode = 'offline';
    this.humanSide = RED;
    this.replayCtl = null;
    this._toastTimer = null;
    this._undoCountdown = null;

    this.el = {
      modePill: $('#mode-pill'),
      turnBanner: $('#turn-banner'),
      historyList: $('#history-list'),
      clockRed: $('#clock-red'),
      clockBlack: $('#clock-black'),
      playerRed: $('#player-red'),
      playerBlack: $('#player-black'),
      aiLevel: $('#ai-level'),
      aiLevelOut: $('#ai-level-out'),
      aiLevelM: $('#ai-level-m'),
      camElev: $('#cam-elev'),
      offlineCfg: $('#offline-config'),
      onlineCfg: $('#online-config'),
      onlineStatus: $('#online-status'),
      playerName: $('#player-name'),
      roomCode: $('#room-code'),
      toast: $('#toast'),
      overlay: $('#overlay'),
      overlayTitle: $('#overlay-title'),
      overlayMsg: $('#overlay-msg'),
      overlayPrimary: $('#overlay-primary'),
      overlaySecondary: $('#overlay-secondary'),
      undoModal: $('#undo-modal'),
      undoCount: $('#undo-count'),
      undoAccept: $('#undo-accept'),
      undoDecline: $('#undo-decline'),
      panelLeft: $('#panel-left'),
      replayList: $('#replay-list'),
      replayControls: $('#replay-controls'),
      bottomSheet: $('#bottom-sheet'),
      ratingRed: $('#rating-red'),
      ratingBlack: $('#rating-black'),
      ladderList: $('#ladder-list'),
      ladderSelf: $('#ladder-self'),
      btnLadderRefresh: $('#btn-ladder-refresh')
    };

    this._bindStatic();
    this._bindGameEvents();
    this._initLevelLabels();
  }

  setReplayController(ctl) { this.replayCtl = ctl; }

  _bindStatic() {
    // Mode tabs (offline / online)
    $$('.segmented .seg-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.segmented .seg-btn[data-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        this.mode = mode;
        this.el.offlineCfg.classList.toggle('hidden', mode !== 'offline');
        this.el.onlineCfg.classList.toggle('hidden', mode !== 'online');
        this.el.modePill.textContent = mode === 'online' ? 'Online' : 'Offline';
        this.el.modePill.classList.toggle('online', mode === 'online');
      });
    });

    // Human side (offline)
    $$('.segmented .seg-btn[data-side]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.segmented .seg-btn[data-side]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.humanSide = btn.dataset.side === 'b' ? BLACK : RED;
      });
    });

    // AI level sliders (desktop + mobile kept in sync)
    const syncLevel = (v) => {
      const cfg = LEVELS[(v | 0) - 1];
      const txt = `Lv ${v} · ${cfg?.name.split(' ')[0] || ''}`;
      if (this.el.aiLevel) this.el.aiLevel.value = v;
      if (this.el.aiLevelM) this.el.aiLevelM.value = v;
      if (this.el.aiLevelOut) this.el.aiLevelOut.textContent = txt;
      this.game.aiLevel = v | 0;
    };
    this.el.aiLevel?.addEventListener('input', (e) => syncLevel(e.target.value));
    this.el.aiLevelM?.addEventListener('input', (e) => syncLevel(e.target.value));

    // Camera elevation
    this.el.camElev?.addEventListener('input', (e) => {
      this.game.scene.setElevation(Number(e.target.value));
    });

    // Offline new game
    $('#btn-new-offline')?.addEventListener('click', () => this.newOfflineGame());

    // Online controls
    $('#btn-quick')?.addEventListener('click', () => this.quickMatch());
    $('#btn-join')?.addEventListener('click', () => this.joinRoom());

    // Game controls (desktop + mobile)
    for (const id of ['btn-undo', 'btn-undo-m']) $(`#${id}`)?.addEventListener('click', () => this.game.undo());
    for (const id of ['btn-hint', 'btn-hint-m']) $(`#${id}`)?.addEventListener('click', () => this.game.requestHint());
    for (const id of ['btn-flip', 'btn-flip-m']) $(`#${id}`)?.addEventListener('click', () => this.game.scene.flip());
    for (const id of ['btn-resign', 'btn-resign-m']) $(`#${id}`)?.addEventListener('click', () => this.confirmResign());

    // Mobile menu button toggles the left panel drawer
    $('#btn-menu')?.addEventListener('click', () => this.el.panelLeft.classList.toggle('open'));

    // Bottom sheet drag/tap to expand
    this.el.bottomSheet?.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      this.el.bottomSheet.classList.toggle('open');
    });

    // Overlay buttons
    this.el.overlayPrimary?.addEventListener('click', () => {
      this.el.overlay.classList.add('hidden');
      if (this.mode === 'online') this.quickMatch();
      else this.newOfflineGame();
    });
    this.el.overlaySecondary?.addEventListener('click', () => this.el.overlay.classList.add('hidden'));

    // Undo modal
    this.el.undoAccept?.addEventListener('click', () => {
      this.game.respondUndo(true);
      this._closeUndoModal();
    });
    this.el.undoDecline?.addEventListener('click', () => {
      this.game.respondUndo(false);
      this._closeUndoModal();
    });

    // Replay list loading + fork
    $('#btn-replay-load')?.addEventListener('click', () => this.loadSelectedReplay());
    $('#btn-replay-fork')?.addEventListener('click', () => this.forkSelectedReplay());

    // Ladder
    this.el.btnLadderRefresh?.addEventListener('click', () => this.refreshLadder());

    // Replay transport
    $('#rp-start')?.addEventListener('click', () => this.replayCtl?.seek(0));
    $('#rp-prev')?.addEventListener('click', () => this.replayCtl?.step(-1));
    $('#rp-next')?.addEventListener('click', () => this.replayCtl?.step(1));
    $('#rp-end')?.addEventListener('click', () => this.replayCtl?.seek(Infinity));
    $('#rp-play')?.addEventListener('click', () => this.replayCtl?.togglePlay());
    $('#rp-scrub')?.addEventListener('input', (e) => this.replayCtl?.seek(Number(e.target.value)));
    $$('.segmented .seg-btn[data-speed]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.segmented .seg-btn[data-speed]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.replayCtl?.setSpeed(Number(btn.dataset.speed));
      });
    });
  }

  _initLevelLabels() {
    const v = Number(this.el.aiLevel?.value || 3);
    const cfg = LEVELS[v - 1];
    if (this.el.aiLevelOut && cfg) this.el.aiLevelOut.textContent = `Lv ${v} · ${cfg.name.split(' ')[0]}`;
  }

  _bindGameEvents() {
    const g = this.game;
    g.on('turn', ({ turn, inCheck }) => this.updateTurn(turn, inCheck));
    g.on('clocks', (c) => this.updateClocks(c));
    g.on('history', ({ history }) => this.renderHistory(history));
    g.on('toast', ({ message, kind }) => this.toast(message, kind));
    g.on('net-status', ({ state, extra }) => this.updateNetStatus(state, extra));
    g.on('matchmaking', (m) => this.updateNetStatus(m.status === 'queued' ? 'queued' : m.status));
    g.on('room-joined', (p) => this.onRoomJoined(p));
    g.on('opponent', (p) => this.updateOpponentName(p));
    g.on('ratings', ({ ratings, ranked }) => this.updateRatings(ratings, ranked));
    g.on('gameover', (r) => this.showGameOver(r));
    g.on('undo-request', (r) => this.showUndoModal(r));
    g.on('ai-thinking', () => this.toast('AI thinking…', 'info', 900));
    g.on('replay-index', ({ index, total }) => {
      const scrub = $('#rp-scrub');
      if (scrub) { scrub.max = total; scrub.value = index; }
    });
    g.on('reset', () => {
      this.el.overlay.classList.add('hidden');
      this.el.replayControls.classList.add('hidden');
      this.replayCtl?.stop();
    });
  }

  newOfflineGame() {
    this.mode = 'offline';
    this.el.panelLeft.classList.remove('open');
    this.game.reset({
      mode: 'offline',
      humanSide: this.humanSide,
      aiLevel: Number(this.el.aiLevel.value || 3)
    });
    this.updateTurn(this.game.turn, false);
  }

  confirmResign() {
    if (this.game.status.over) return;
    if (!confirm('Resign this game?')) return;
    this.game.resign();
  }

  async quickMatch() {
    const name = (this.el.playerName.value || 'player').trim();
    try {
      await this.game.connectOnline({ name });
      this.game.quickMatch(name);
      this.updateNetStatus('searching');
    } catch (e) {
      this.updateNetStatus('error', String(e.message || e));
    }
  }

  async joinRoom() {
    const name = (this.el.playerName.value || 'player').trim();
    const code = (this.el.roomCode.value || '').trim().toUpperCase();
    if (!code) { this.toast('Enter a room code', 'warn'); return; }
    try {
      await this.game.connectOnline({ name });
      this.game.joinRoom(code, name);
      this.updateNetStatus('joining');
    } catch (e) {
      this.updateNetStatus('error', String(e.message || e));
    }
  }

  onRoomJoined(payload) {
    this.el.roomCode.value = payload.roomCode;
    this.updateNetStatus('in-room', payload.roomCode);
    this.humanSide = payload.side;
    this.el.modePill.textContent = payload.ranked ? 'Online · Ranked' : 'Online · Casual';
    this.el.playerRed.querySelector('.p-name').textContent =
      payload.side === RED ? `You (Red 紅)` : `Opponent (Red 紅)`;
    this.el.playerBlack.querySelector('.p-name').textContent =
      payload.side === BLACK ? `You (Black 黑)` : `Opponent (Black 黑)`;
    this.toast(`Joined room ${payload.roomCode}${payload.ranked ? ' (ranked)' : ''}`, 'ok');
  }

  updateOpponentName({ name, side }) {
    const el = side === RED ? this.el.playerRed : this.el.playerBlack;
    if (!el) return;
    const nameEl = el.querySelector('.p-name');
    if (nameEl && name) nameEl.textContent = `${name} (${side === RED ? 'Red 紅' : 'Black 黑'})`;
  }

  // Show the live Elo badges beside each clock, with a delta flash after ranked games.
  updateRatings(ratings, ranked) {
    const set = (el, rec) => {
      if (!el) return;
      if (!rec || rec.rating == null) { el.classList.add('hidden'); el.replaceChildren(); return; }
      el.classList.remove('hidden');
      el.replaceChildren();
      const star = document.createElement('span');
      star.textContent = `★ ${rec.rating}`;
      el.appendChild(star);
      if (rec.delta != null && rec.delta !== 0) {
        const d = document.createElement('span');
        d.className = rec.delta > 0 ? 'delta-up' : 'delta-down';
        d.textContent = rec.delta > 0 ? `+${rec.delta}` : `${rec.delta}`;
        el.appendChild(d);
      }
    };
    set(this.el.ratingRed, ratings?.r);
    set(this.el.ratingBlack, ratings?.b);
    if (this.mode === 'online') {
      this.el.modePill.textContent = ranked ? 'Online · Ranked' : 'Online · Casual';
    }
  }

  updateNetStatus(state, extra) {
    const map = {
      connected: ['Connected', 'ok'],
      closed: ['Disconnected', 'err'],
      error: [`Error: ${extra || ''}`, 'err'],
      queued: ['Searching for opponent…', ''],
      searching: ['Searching for opponent…', ''],
      joining: ['Joining room…', ''],
      'in-room': [`In room ${extra || ''}`, 'ok'],
      cancelled: ['Cancelled', '']
    };
    const [text, cls] = map[state] || [state, ''];
    this.el.onlineStatus.textContent = text;
    this.el.onlineStatus.className = 'status' + (cls ? ' ' + cls : '');
  }

  updateTurn(turn, inCheck) {
    const red = turn === RED;
    this.el.turnBanner.textContent = `${red ? 'Red 紅' : 'Black 黑'} to move${inCheck ? ' — CHECK' : ''}`;
    this.el.turnBanner.classList.toggle('red', red);
    this.el.turnBanner.classList.toggle('black', !red);
    this.el.playerRed.classList.toggle('active', red);
    this.el.playerBlack.classList.toggle('active', !red);
  }

  updateClocks(clocks) {
    if (!clocks) return;
    this.el.clockRed.textContent = fmtClock(clocks.r);
    this.el.clockBlack.textContent = fmtClock(clocks.b);
    this.el.playerRed.classList.toggle('low-time', (clocks.r ?? 0) < 30000);
    this.el.playerBlack.classList.toggle('low-time', (clocks.b ?? 0) < 30000);
  }

  renderHistory(history) {
    const list = this.el.historyList;
    if (!list) return;
    list.replaceChildren();
    // Two-column ply layout: each row is a full move (Red + Black).
    for (let i = 0; i < history.length; i += 2) {
      const li = document.createElement('li');
      const no = document.createElement('span');
      no.className = 'mv-no';
      no.textContent = `${(i / 2) + 1}.`;
      const red = document.createElement('span');
      red.className = 'mv red';
      red.textContent = history[i]?.notation || '';
      red.dataset.ply = i;
      const black = document.createElement('span');
      black.className = 'mv black';
      black.textContent = history[i + 1]?.notation || '';
      black.dataset.ply = i + 1;
      li.append(no, red, black);
      list.appendChild(li);
    }
    // Highlight last ply
    const lastPly = history.length - 1;
    const last = list.querySelector(`[data-ply="${lastPly}"]`);
    if (last) { last.classList.add('current'); last.scrollIntoView({ block: 'nearest' }); }
    // Clicking a ply in replay mode seeks to it
    list.addEventListener('click', (e) => {
      const ply = e.target?.dataset?.ply;
      if (ply == null) return;
      if (this.game.mode === 'replay') this.replayCtl?.seek(Number(ply) + 1);
    });
  }

  toast(message, kind = 'info', ms = 2200) {
    const el = this.el.toast;
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    el.style.borderColor = kind === 'bad' ? 'var(--bad)' : kind === 'warn' ? 'var(--accent-2)' : kind === 'ok' ? 'var(--good)' : 'var(--line)';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  showGameOver({ winner, reason, ranked, ratings }) {
    const humanWon = winner === this.humanSide && this.mode !== 'online';
    const youWin = this.mode === 'online' ? winner === this.game.onlineSide : humanWon;
    const reasonText = {
      checkmate: 'checkmate',
      stalemate: 'stalemate (no legal moves — loses in Xiangqi)',
      resign: 'resignation',
      timeout: 'clock flag',
      disconnect: 'disconnect'
    }[reason] || reason;
    const winnerLabel = winner === RED ? 'Red 紅' : 'Black 黑';
    this.el.overlayTitle.textContent = youWin ? '🏆 Victory' : '💀 Defeat';
    this.el.overlayMsg.replaceChildren();
    const line1 = document.createElement('div');
    line1.append('Winner: ');
    const strong = document.createElement('strong');
    strong.textContent = winnerLabel;
    line1.appendChild(strong);
    const line2 = document.createElement('div');
    line2.textContent = `By ${reasonText}${ranked ? ' · ranked' : ''}`;
    this.el.overlayMsg.append(line1, line2);
    // Ranked games report the resulting ladder change.
    if (ranked && ratings) {
      const mk = (sideKey, label) => {
        const r = ratings[sideKey];
        if (!r) return null;
        const div = document.createElement('div');
        div.className = 'rating-line';
        div.append(`${label}: `);
        const s = document.createElement('strong');
        s.textContent = `${r.rating}`;
        div.appendChild(s);
        if (r.delta != null && r.delta !== 0) {
          const d = document.createElement('span');
          d.className = r.delta > 0 ? 'delta-up' : 'delta-down';
          d.textContent = ` (${r.delta > 0 ? '+' : ''}${r.delta})`;
          div.appendChild(d);
        }
        return div;
      };
      const lr = mk('r', 'Red 紅');
      const lb = mk('b', 'Black 黑');
      if (lr) this.el.overlayMsg.appendChild(lr);
      if (lb) this.el.overlayMsg.appendChild(lb);
    }
    this.el.overlay.classList.remove('hidden');
    // Refresh the ladder so the new standings show up.
    this.refreshLadder();
    // Auto-save the match for replay
    import('./storage.js').then(({ saveMatch, pushToServer }) => {
      const record = {
        mode: this.mode,
        level: this.game.aiLevel,
        side: this.humanSide,
        history: this.game.history.map(h => ({
          fromX: h.fromX, fromY: h.fromY, toX: h.toX, toY: h.toY, side: h.side, notation: h.notation, at: h.at
        })),
        result: { winner, reason }
      };
      saveMatch(record).then(id => {
        pushToServer({ ...record, matchId: id });
        this.refreshReplayList();
      });
    });
  }

  showUndoModal({ by, expiresAt }) {
    this.el.undoModal.classList.remove('hidden');
    const total = Math.max(1, Math.round((expiresAt - Date.now()) / 1000));
    let remain = total;
    this.el.undoCount.textContent = remain;
    clearInterval(this._undoCountdown);
    this._undoCountdown = setInterval(() => {
      remain -= 1;
      this.el.undoCount.textContent = Math.max(0, remain);
      if (remain <= 0) this._closeUndoModal();
    }, 1000);
  }

  _closeUndoModal() {
    clearInterval(this._undoCountdown);
    this.el.undoModal.classList.add('hidden');
  }

  async refreshLadder() {
    const list = this.el.ladderList;
    if (!list) return;
    try {
      const res = await fetch('/api/v1/leaderboard?limit=50');
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      this.renderLadder(data.players || []);
    } catch {
      // Offline or no ladder backend — show a friendly note instead of failing hard.
      list.replaceChildren();
      const li = document.createElement('li');
      li.className = 'ladder-empty';
      li.textContent = 'Ladder available in online mode';
      list.appendChild(li);
    }
  }

  renderLadder(players) {
    const list = this.el.ladderList;
    if (!list) return;
    list.replaceChildren();
    const selfId = this.game.playerId;
    const me = players.find(p => p.id === selfId);
    if (me && this.el.ladderSelf) {
      this.el.ladderSelf.classList.remove('hidden');
      this.el.ladderSelf.replaceChildren();
      const s = document.createElement('span');
      s.append('Your rank ');
      const strong = document.createElement('strong');
      strong.textContent = `#${me.rank} · ★ ${me.rating}`;
      s.appendChild(strong);
      s.append(` (${me.wins}W ${me.losses}L${me.draws ? ` ${me.draws}D` : ''})`);
      this.el.ladderSelf.appendChild(s);
    } else if (this.el.ladderSelf) {
      this.el.ladderSelf.classList.add('hidden');
      this.el.ladderSelf.replaceChildren();
    }
    if (!players.length) {
      const li = document.createElement('li');
      li.className = 'ladder-empty';
      li.textContent = 'No ranked games yet — play a Quick Match to get rated.';
      list.appendChild(li);
      return;
    }
    for (const p of players) {
      const li = document.createElement('li');
      if (p.id === selfId) li.classList.add('self');
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = p.rank;
      const name = document.createElement('span');
      name.className = 'l-name';
      name.textContent = p.name;
      const rating = document.createElement('span');
      rating.className = 'l-rating';
      rating.textContent = `★ ${p.rating}`;
      const rec = document.createElement('span');
      rec.className = 'l-record';
      rec.textContent = `${p.wins}W ${p.losses}L${p.draws ? ` ${p.draws}D` : ''}`;
      li.append(rank, name, rating, rec);
      list.appendChild(li);
    }
  }

  async refreshReplayList() {
    const { listMatches } = await import('./storage.js');
    const list = await listMatches().catch(() => []);
    const sel = this.el.replayList;
    if (!sel) return;
    sel.replaceChildren();
    if (!list.length) {
      const opt = document.createElement('option');
      opt.textContent = '— no saved matches —';
      opt.value = '';
      sel.appendChild(opt);
      return;
    }
    for (const m of list) {
      const opt = document.createElement('option');
      opt.value = m.matchId;
      const d = new Date(m.savedAt);
      const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const winner = m.result?.winner ? (m.result.winner === RED ? 'Red' : 'Black') : '—';
      opt.textContent = `${when} · ${m.mode} · ${(m.history?.length ?? 0)} ply · ${winner} won`;
      sel.appendChild(opt);
    }
  }

  async loadSelectedReplay() {
    const id = this.el.replayList.value;
    if (!id) { this.toast('Select a saved match', 'warn'); return; }
    const { loadMatch } = await import('./storage.js');
    const rec = await loadMatch(id);
    if (!rec) { this.toast('Match not found', 'bad'); return; }
    this.game.loadReplay(rec.history || []);
    this.el.replayControls.classList.remove('hidden');
    this.replayCtl?.attach(this.game);
    this.replayCtl?.seek(0);
    this.toast('Replay loaded', 'ok');
  }

  forkSelectedReplay() {
    const idx = this.game.replayIndex ?? this.game.history.length;
    this.game.forkAt(idx, { aiLevel: Number(this.el.aiLevel.value || 3), humanSide: this.humanSide });
    this.el.replayControls.classList.add('hidden');
    this.replayCtl?.stop();
    this.mode = 'offline';
  }
}
