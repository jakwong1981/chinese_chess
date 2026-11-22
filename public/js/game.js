// Game controller: owns the current match state, syncs it with the 3D scene, dispatches
// moves to the AI (offline) or the STOMP broker (online), and emits events for the UI.

import * as THREE from 'three';
import {
  RED, BLACK, opposite,
  initialBoard, encodeBoard, decodeBoard,
  legalMoves, applyMove, isLegalMove, gameStatus, isInCheck, kingsFacing, findKing, idx, xy,
  moveToNotation
} from '../../shared/rules.js';
import { createPieceMesh, createHighlightRing, createMoveDot, PIECE_BASE_Y, PIECE_RADIUS } from './pieces.js';
import { gridToWorld } from './board.js';
import { CANNON_FLIGHT_MS } from './fx.js';
import { StompClient, DEST } from './net.js';
import { levelConfig, LEVELS } from './ai.js';

const ANIM_MS = 340;

export class Game {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.emitter = new EventTarget();
    this.mode = 'offline';            // 'offline' | 'online' | 'replay'
    this.humanSide = RED;
    this.aiLevel = 3;
    this.board = initialBoard();
    this.turn = RED;
    this.history = [];
    this.status = { over: false, inCheck: false };
    this._checkHold = false;
    this.pieceMeshes = new Map();     // board-index -> mesh
    this.markers = [];                // currently visible pooled markers
    this._quietDotPool = [];          // reusable quiet-move dots
    this._captureDotPool = [];        // reusable capture rings
    this.lastMoveRing = null;
    this.selectionRing = null;
    this.hoverRing = null;
    this.hintRing = null;
    this.hintDestRing = null;
    this._hintTimer = null;
    this._hoveredMesh = null;
    this.aiWorker = null;
    this._aiReqId = 0;
    this._aiStartedAt = 0;
    this._aiTimer = null;
    this._aiThinking = false;
    this.stomp = null;
    this.roomCode = null;
    this.onlineSide = null;
    this.opponentName = null;
    this.playerId = null;              // stable identity for the ladder
    this.playerRatings = { r: null, b: null }; // live ratings shown beside the clocks
    this.onlineRanked = false;         // whether the current online game counts toward the ladder
    this.clocks = { r: 600000, b: 600000 };
    this._animQueue = [];
    this._interactionEnabled = true;

    this._initWorker();
    this._buildPieces();
  }

  // -------- Event helpers --------
  // `on` auto-unwraps CustomEvent.detail so handlers receive the payload directly.
  on(type, cb) {
    const wrapped = (e) => cb(e.detail);
    this.emitter.addEventListener(type, wrapped);
    return () => this.emitter.removeEventListener(type, wrapped);
  }
  emit(type, detail) { this.emitter.dispatchEvent(new CustomEvent(type, { detail })); }

  // -------- Setup --------
  _initWorker() {
    try {
      this.aiWorker = new Worker(new URL('./ai.js', import.meta.url), { type: 'module' });
      this.aiWorker.onmessage = (ev) => this._onWorkerMessage(ev.data);
      this.aiWorker.onerror = (e) => console.warn('AI worker error:', e);
    } catch (err) {
      console.warn('Worker unavailable, falling back to main-thread AI', err);
      this.aiWorker = null;
    }
  }

  reset(opts = {}) {
    this._cancelPendingAI();
    this.mode = opts.mode || 'offline';
    this.humanSide = opts.humanSide || RED;
    this.aiLevel = opts.aiLevel ?? 3;
    this.board = initialBoard();
    this.turn = RED;
    this.history = [];
    this.status = { over: false, inCheck: false };
    this._checkHold = false;
    this.scene.fx?.clear();
    this.clocks = { r: opts.baseMs ?? 600000, b: opts.baseMs ?? 600000 };
    this._buildPieces();
    this._interactionEnabled = true;
    this.emit('reset', { mode: this.mode });
    this.emit('turn', { turn: this.turn });
    this.emit('clocks', { ...this.clocks });
    this.emit('history', { history: this.history });
    this._maybeAIMove();
  }

  _buildPieces() {
    const layer = this.scene.pieceLayer;
    while (layer.children.length) layer.remove(layer.children[0]);
    this.pieceMeshes.clear();
    this._hoveredMesh = null;
    this._clearMarkers();
    if (this.lastMoveRing) this.lastMoveRing.visible = false;
    if (this.selectionRing) this.selectionRing.visible = false;
    if (this.hoverRing) this.hoverRing.visible = false;
    if (this.hintRing) this.hintRing.visible = false;
    if (this.hintDestRing) this.hintDestRing.visible = false;

    for (let i = 0; i < this.board.length; i++) {
      const p = this.board[i];
      if (!p) continue;
      const mesh = createPieceMesh(p.side, p.type);
      const [x, y] = xy(i);
      const pos = gridToWorld(x, y, PIECE_BASE_Y);
      mesh.position.copy(pos);
      mesh.userData.pieceId = p.id;
      mesh.userData.gridPos = { x, y };
      this.scene.pieceLayer.add(mesh);
      this.pieceMeshes.set(i, mesh);
    }
    this._syncPieceIndices();
    this.scene.requestShadowUpdate();
  }

  getPieceAt(x, y) {
    return this.pieceMeshes.get(idx(x, y)) || null;
  }

  _syncPieceIndices() {
    // Ensure every mesh's userData.gridPos matches the current board index of that piece.
    for (const [i, mesh] of this.pieceMeshes) {
      const [x, y] = xy(i);
      mesh.userData.gridPos = { x, y };
    }
  }

  // -------- Interaction surface --------
  isInteractionEnabled() {
    if (!this._interactionEnabled) return false;
    if (this.mode === 'replay') return false;
    if (this.status.over) return false;
    if (this._checkHold) return false;
    if (this.mode === 'online') return this.turn === this.onlineSide && !this._animQueue.length;
    return this.turn === this.humanSide && !this._animQueue.length;
  }

  isOwnPiece(side) {
    if (this.mode === 'online') return side === this.onlineSide;
    return side === this.humanSide;
  }

  // Called by Input when the human selects a piece.
  onSelect({ x, y }) {
    this._clearMarkers();
    const i = idx(x, y);
    const p = this.board[i];
    if (!p) return;
    if (!this.isOwnPiece(p.side) || this.turn !== p.side) return;
    if (!this.selectionRing) {
      this.selectionRing = createHighlightRing(0xf0b429);
      this.scene.markerLayer.add(this.selectionRing);
    }
    const pos = gridToWorld(x, y, 0.01);
    this.selectionRing.position.copy(pos);
    this.selectionRing.visible = true;
    // Show legal destinations using pooled markers (zero GPU allocation/leaks).
    const moves = legalMoves(this.board, p.side).filter(m => m.fromX === x && m.fromY === y);
    let qIdx = 0;
    let cIdx = 0;
    for (const m of moves) {
      let dot;
      if (m.capture) {
        dot = this._captureDotPool[cIdx];
        if (!dot) {
          dot = createMoveDot(0.14, true);
          this.scene.markerLayer.add(dot);
          this._captureDotPool[cIdx] = dot;
        }
        cIdx++;
      } else {
        dot = this._quietDotPool[qIdx];
        if (!dot) {
          dot = createMoveDot(0.14, false);
          this.scene.markerLayer.add(dot);
          this._quietDotPool[qIdx] = dot;
        }
        qIdx++;
      }
      dot.position.copy(gridToWorld(m.toX, m.toY, 0.015));
      dot.visible = true;
      this.markers.push(dot);
    }
  }

  onSelectionCleared() {
    this._clearMarkers();
    if (this.selectionRing) this.selectionRing.visible = false;
  }

  onHover(mesh) {
    if (!mesh || !this.isInteractionEnabled()) {
      this._hoveredMesh = null;
      if (this.hoverRing) this.hoverRing.visible = false;
      return;
    }
    const piece = mesh.userData.piece;
    const pos = mesh.userData.gridPos;
    if (!piece || !pos || !this.isOwnPiece(piece.side) || this.turn !== piece.side) {
      this._hoveredMesh = null;
      if (this.hoverRing) this.hoverRing.visible = false;
      return;
    }
    this._hoveredMesh = mesh;
    if (!this.hoverRing) {
      this.hoverRing = createHighlightRing(0xffe099, PIECE_RADIUS * 1.08);
      this.scene.markerLayer.add(this.hoverRing);
    }
    this.hoverRing.position.copy(gridToWorld(pos.x, pos.y, 0.009));
    this.hoverRing.visible = true;
  }

  _clearMarkers() {
    for (const m of this.markers) m.visible = false;
    this.markers.length = 0;
  }

  // Called by Input when the human attempts a move. Returns true if accepted locally.
  onMove(mv) {
    if (!this.isInteractionEnabled()) return false;
    const side = this.turn;
    if (!isLegalMove(this.board, side, mv)) return false;
    if (this.mode === 'online') {
      this.stomp?.send(DEST.move(this.roomCode), mv);
      // Server will broadcast MOVE_CONFIRMED; don't apply locally.
      this._clearMarkers();
      if (this.selectionRing) this.selectionRing.visible = false;
      return true;
    }
    this._applyLocalMove(mv, side);
    return true;
  }

  onReject() {
    this.emit('toast', { message: 'Illegal move', kind: 'bad' });
  }

  // -------- Move application + animation --------
  _applyLocalMove(mv, side) {
    const captured = this.board[idx(mv.toX, mv.toY)];
    const nb = applyMove(this.board, mv);
    const notation = moveToNotation(this.board, mv);
    this.board = nb;
    this.history.push({ ...mv, side, captured: captured?.type || null, at: Date.now(), notation });
    this._animateMove(mv, captured);
    this.turn = opposite(side);
    this.status = gameStatus(this.board, this.turn);
    this._clearMarkers();
    if (this.selectionRing) this.selectionRing.visible = false;
    this._showLastMove(mv);
    this._updateCheckFlash();
    this._updateFlyingGeneralWarning();
    this.emit('history', { history: this.history, notation, move: mv });
    this.emit('turn', { turn: this.turn, inCheck: this.status.inCheck });
    const checking = this.status.inCheck || (this.status.over && this.status.reason === 'checkmate');
    if (checking) this._playCheckSpectacle();
    if (this.status.over) {
      this._interactionEnabled = false;
      this.emit('gameover', { winner: this.status.winner, reason: this.status.reason });
    } else if (!checking) {
      this._maybeAIMove();
    }
  }

  _playCheckSpectacle(victimSide = this.turn) {
    const kingI = findKing(this.board, victimSide);
    if (kingI < 0) return;
    const [kx, ky] = xy(kingI);
    const mate = !!(this.status.over && this.status.reason === 'checkmate');
    this._checkHold = true;
    this.scene.fx.playCheck({
      king: gridToWorld(kx, ky, 0),
      attackerSide: opposite(victimSide),
      mate,
      onDone: () => {
        this._checkHold = false;
        if (this.mode === 'offline' && !this.status.over && this.turn !== this.humanSide) {
          this._maybeAIMove();
        }
      }
    });
  }

  _animateMove(mv, capturedPiece) {
    const fromI = idx(mv.fromX, mv.fromY);
    const toI = idx(mv.toX, mv.toY);
    const mover = this.pieceMeshes.get(fromI);
    if (!mover) return;
    let capMesh = null;
    if (capturedPiece) {
      capMesh = this.pieceMeshes.get(toI) || null;
      if (capMesh) this.pieceMeshes.delete(toI);
    }
    this.pieceMeshes.delete(fromI);
    this.pieceMeshes.set(toI, mover);
    const target = gridToWorld(mv.toX, mv.toY, PIECE_BASE_Y);
    const start = mover.position.clone();
    const attackerType = mover.userData.piece?.type;
    const cannonShot = !!(capMesh && attackerType === 'C');
    if (capMesh) {
      this.scene.fx.playCapture({
        type: attackerType,
        from: start.clone(),
        to: target.clone(),
        victim: capMesh,
        mover
      });
    }
    const isRook = attackerType === 'R';
    const isHorse = attackerType === 'H';
    const apexY = Math.max(start.y, target.y) + (isRook ? 0.22 : isHorse ? 0.82 : 0.55);
    const delay = cannonShot ? CANNON_FLIGHT_MS : 0;
    const t0 = performance.now() + delay;
    const crossesRiver = (mv.fromY <= 4 && mv.toY >= 5) || (mv.fromY >= 5 && mv.toY <= 4);
    let rippleFired = false;
    const dx = target.x - start.x;
    const dz = target.z - start.z;
    const dist = Math.hypot(dx, dz) || 1;
    const tiltMul = isHorse ? 0.22 : 0.14;
    const tiltX = (dz / dist) * tiltMul;
    const tiltZ = -(dx / dist) * tiltMul;
    const anim = (now) => {
      if (now < t0) return true;
      const t = Math.min(1, (now - t0) / ANIM_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      mover.position.x = start.x + dx * e;
      mover.position.z = start.z + dz * e;
      const hop = Math.sin(Math.PI * t);
      mover.position.y = start.y + (target.y - start.y) * e + hop * (apexY - Math.max(start.y, target.y));
      mover.rotation.x = tiltX * hop;
      mover.rotation.z = tiltZ * hop;

      if (crossesRiver && !rippleFired && t >= 0.45) {
        rippleFired = true;
        this.scene.triggerRiverRipple((start.x + target.x) * 0.5, 0);
      }
      this.scene.requestShadowUpdate();

      if (t >= 1) {
        mover.position.copy(target);
        mover.rotation.x = 0;
        mover.rotation.z = 0;
        mover.userData.gridPos = { x: mv.toX, y: mv.toY };
        this._syncPieceIndices();
        this.scene.fx?.playLand?.({ at: target, isCapture: !!capMesh, type: attackerType });
        this.scene.requestShadowUpdate();
        return false;
      }
      mover.userData.gridPos = { x: mv.toX, y: mv.toY };
      return true;
    };
    this._animQueue.push(anim);
  }

  tickAnimations(now = performance.now(), dt = 0.016) {
    this.scene.fx?.tick(now, dt);
    if (!this._animQueue.length) {
      const damp = 1 - Math.exp(-16 * dt);
      for (const mesh of this.pieceMeshes.values()) {
        if (mesh.scale.x > 1.02) continue;
        const targetY = mesh === this._hoveredMesh ? PIECE_BASE_Y + 0.075 : PIECE_BASE_Y;
        const diff = targetY - mesh.position.y;
        if (Math.abs(diff) > 0.0005) {
          mesh.position.y += diff * damp;
          this.scene.requestShadowUpdate();
        } else if (mesh.position.y !== targetY) {
          mesh.position.y = targetY;
        }
      }
      return;
    }
    this._animQueue = this._animQueue.filter(fn => fn(now));
  }

  _showLastMove(mv) {
    if (!this.lastMoveRing) {
      this.lastMoveRing = createHighlightRing(0x48c78e);
      this.scene.markerLayer.add(this.lastMoveRing);
    }
    this.lastMoveRing.position.copy(gridToWorld(mv.toX, mv.toY, 0.008));
    this.lastMoveRing.visible = true;
  }

  _updateCheckFlash() {
    const el = document.getElementById('check-flash');
    if (!el) return;
    if (this.status.inCheck && !this.status.over) el.classList.remove('hidden');
    else el.classList.add('hidden');
  }

  _updateFlyingGeneralWarning() {
    // Show a red beam if kings currently face each other (should never be legal, but if the
    // human tries a move that would produce it, we flash the warning briefly).
    if (kingsFacing(this.board)) {
      const rk = findKing(this.board, RED);
      const [rx] = xy(rk);
      const p1 = gridToWorld(rx, 0, 0);
      const p2 = gridToWorld(rx, 9, 0);
      this.scene.showFlyingGeneralBeam(p1.x, p1.z, p2.z, true);
    } else {
      this.scene.showFlyingGeneralBeam(0, 0, 0, false);
    }
  }

  // -------- AI --------
  _cancelPendingAI() {
    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }
    this._aiReqId++;
    if (this._aiThinking) {
      this._aiThinking = false;
      this.emit('ai-thinking', { active: false });
    }
  }

  _maybeAIMove() {
    if (this.mode !== 'offline') return;
    if (this.status.over) return;
    if (this.turn === this.humanSide) return;
    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }
    const reqId = ++this._aiReqId;
    this._aiStartedAt = performance.now();
    this._interactionEnabled = false;
    this._aiThinking = true;
    this.emit('ai-thinking', { active: true, side: this.turn, level: this.aiLevel });
    const req = { type: 'move', reqId, boardEnc: encodeBoard(this.board), side: this.turn, level: this.aiLevel };
    if (this.aiWorker) {
      this.aiWorker.postMessage(req);
    } else {
      // Fallback: import AI lazily on the main thread.
      import('./ai.js').then(({ chooseMove }) => {
        if (reqId !== this._aiReqId) return;
        const mv = chooseMove(this.board, this.turn, this.aiLevel);
        this._onWorkerMessage({ type: 'move', reqId, move: mv });
      });
    }
  }

  _onWorkerMessage(msg) {
    if (msg.type === 'move') {
      if (msg.reqId !== this._aiReqId) return; // stale result after undo/reset/resign
      const reqId = msg.reqId;
      const cfg = levelConfig(this.aiLevel);
      const minMs = cfg.minMs ?? 320;
      const elapsed = performance.now() - this._aiStartedAt;
      const remain = Math.max(0, minMs - elapsed);
      const wait = remain > 0 ? Math.round(remain * (0.85 + Math.random() * 0.3)) : 0;
      const commit = () => {
        if (reqId !== this._aiReqId) return;
        this._aiTimer = null;
        this._aiThinking = false;
        this.emit('ai-thinking', { active: false });
        this._interactionEnabled = true;
        if (this.mode !== 'offline' || this.status.over) return;
        let move = msg.move;
        if (!move) return;
        // Ensure the move is legal (defensive — AI should never return illegal moves).
        if (!isLegalMove(this.board, this.turn, move)) {
          console.warn('AI returned illegal move', move);
          const legal = legalMoves(this.board, this.turn);
          if (!legal.length) return;
          move = legal[0];
        }
        this._applyLocalMove(move, this.turn);
      };
      if (wait > 0) this._aiTimer = setTimeout(commit, wait);
      else commit();
    } else if (msg.type === 'hint') {
      this._interactionEnabled = true;
      if (msg.move) this.showHintMarker(msg.move);
    } else if (msg.type === 'error') {
      console.warn('AI worker reported error:', msg.error);
      if (msg.reqId === this._aiReqId) {
        this._aiThinking = false;
        this.emit('ai-thinking', { active: false });
        this._interactionEnabled = true;
      }
    }
  }

  requestHint() {
    if (this.mode !== 'offline' || this.status.over) return;
    if (this.turn !== this.humanSide) {
      this.emit('toast', { message: 'Wait for your turn', kind: 'warn' });
      return;
    }
    const req = { type: 'hint', reqId: 'hint-' + Date.now(), boardEnc: encodeBoard(this.board), side: this.humanSide };
    if (this.aiWorker) this.aiWorker.postMessage(req);
    else import('./ai.js').then(({ suggestHint }) => {
      const mv = suggestHint(this.board, this.humanSide);
      this._onWorkerMessage({ type: 'hint', reqId: req.reqId, move: mv });
    });
  }

  showHintMarker(mv) {
    if (!this.hintRing) {
      this.hintRing = createHighlightRing(0x4ec9ff, PIECE_RADIUS * 1.2);
      this.scene.markerLayer.add(this.hintRing);
    }
    if (!this.hintDestRing) {
      this.hintDestRing = createHighlightRing(0x4ec9ff);
      this.scene.markerLayer.add(this.hintDestRing);
    }
    this.hintRing.position.copy(gridToWorld(mv.fromX, mv.fromY, 0.02));
    this.hintRing.visible = true;
    this.hintDestRing.position.copy(gridToWorld(mv.toX, mv.toY, 0.02));
    this.hintDestRing.visible = true;
    this.emit('toast', { message: `Hint: ${moveToNotation(this.board, mv)}`, kind: 'info' });
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => {
      if (this.hintRing) this.hintRing.visible = false;
      if (this.hintDestRing) this.hintDestRing.visible = false;
    }, 3200);
  }

  // Undo 2 ply (own move + AI reply). Unrestricted in offline mode per the spec.
  undo() {
    if (this.mode === 'online') {
      this.stomp?.send(DEST.undoRequest(this.roomCode), {});
      this.emit('toast', { message: 'Undo request sent (15s)', kind: 'info' });
      return;
    }
    if (this.mode === 'replay') return;
    if (this.history.length === 0) {
      this.emit('toast', { message: 'Nothing to undo', kind: 'warn' });
      return;
    }
    this._cancelPendingAI();
    // Pop until we've removed one of the human's own moves.
    let pops = 0;
    const targetPops = this.history.length >= 2 ? 2 : 1;
    for (let k = 0; k < targetPops && this.history.length; k++) {
      this.history.pop();
      pops++;
    }
    this._rebuildFromHistory();
    this._interactionEnabled = true;
    this.emit('toast', { message: `Undid ${pops} move${pops > 1 ? 's' : ''}`, kind: 'info' });
  }

  _rebuildFromHistory() {
    let b = initialBoard();
    for (const h of this.history) b = applyMove(b, h);
    this.board = b;
    this.turn = this.history.length ? opposite(this.history[this.history.length - 1].side) : RED;
    this.status = gameStatus(this.board, this.turn);
    this._buildPieces();
    const last = this.history[this.history.length - 1];
    if (last) this._showLastMove(last); else if (this.lastMoveRing) this.lastMoveRing.visible = false;
    this._updateCheckFlash();
    this._updateFlyingGeneralWarning();
    this.emit('history', { history: this.history });
    this.emit('turn', { turn: this.turn, inCheck: this.status.inCheck });
    if (this.status.over) this.emit('gameover', { winner: this.status.winner, reason: this.status.reason });
  }

  resign() {
    if (this.status.over) return;
    if (this.mode === 'online') {
      this.stomp?.send(DEST.resign(this.roomCode), {});
      return;
    }
    this._cancelPendingAI();
    this.status = { over: true, reason: 'resign', winner: opposite(this.humanSide) };
    this._interactionEnabled = false;
    this.emit('gameover', { winner: this.status.winner, reason: 'resign' });
  }

  // -------- Online mode --------
  setIdentity({ playerId } = {}) {
    this.playerId = playerId || this.playerId;
  }

  async connectOnline({ name, wsUrl, playerId } = {}) {
    this.setIdentity({ playerId });
    if (this.stomp) return this.stomp;
    const url = wsUrl || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const client = new StompClient(url);
    client.onStatusChange = (state, extra) => this.emit('net-status', { state, extra });
    client.subscribeUser('matchmaking', (m) => this.emit('matchmaking', m));
    client.subscribeUser('joined', (m) => this._onJoined(m));
    await client.connect(name || 'player');
    this.stomp = client;
    return client;
  }

  quickMatch(name) {
    this.stomp?.send(DEST.quickMatch, { name, playerId: this.playerId });
  }

  joinRoom(code, name) {
    this.stomp?.send(DEST.joinRoom(code), { name, playerId: this.playerId });
  }

  _onJoined(payload) {
    this._cancelPendingAI();
    this.roomCode = payload.roomCode;
    this.onlineSide = payload.side;
    this.onlineRanked = !!payload.ranked;
    this.mode = 'online';
    this.clocks = { r: payload.baseMs ?? 600000, b: payload.baseMs ?? 600000 };
    this.board = initialBoard();
    this.turn = RED;
    this.history = [];
    this.status = { over: false, inCheck: false };
    this._buildPieces();
    if (payload.rating && payload.side) {
      this.playerRatings[payload.side] = payload.rating;
      this.emit('ratings', { ratings: this.playerRatings, ranked: this.onlineRanked });
    }
    this.stomp?.subscribe(DEST.roomTopic(this.roomCode), (msg) => this._onRoomMessage(msg));
    this.emit('room-joined', payload);
    this.emit('turn', { turn: this.turn });
    this.emit('clocks', { ...this.clocks });
  }

  _onRoomMessage(msg) {
    switch (msg.type) {
      case 'PLAYER_JOINED':
        if (msg.side !== this.onlineSide) this.opponentName = msg.name;
        this.emit('opponent', { name: this.opponentName, side: opposite(this.onlineSide) });
        break;
      case 'GAME_START':
        this.board = decodeBoard(msg.board);
        this.turn = msg.turn;
        this.history = [];
        this.status = { over: false, inCheck: false };
        this.onlineRanked = !!msg.ranked;
        if (msg.players) {
          this.playerRatings = {
            r: msg.players.r ? { rating: msg.players.r.rating } : null,
            b: msg.players.b ? { rating: msg.players.b.rating } : null
          };
          if (msg.players[this.onlineSide === RED ? 'b' : 'r']?.name) {
            this.opponentName = msg.players[this.onlineSide === RED ? 'b' : 'r'].name;
            this.emit('opponent', { name: this.opponentName, side: opposite(this.onlineSide) });
          }
        }
        this.emit('ratings', { ratings: this.playerRatings, ranked: this.onlineRanked });
        this._buildPieces();
        this.emit('turn', { turn: this.turn });
        this.emit('clocks', msg.clocks);
        break;
      case 'MOVE_CONFIRMED': {
        const mv = msg.move;
        const captured = this.board[idx(mv.toX, mv.toY)];
        this.board = decodeBoard(msg.board);
        this.turn = msg.turn;
        this.history.push({ ...mv, side: mv.side, captured: captured?.type || null, at: Date.now(), notation: msg.notation });
        this._animateMove(mv, captured ? { type: captured } : null);
        this.status = { over: false, inCheck: !!msg.inCheck };
        this._showLastMove(mv);
        this._updateCheckFlash();
        this._updateFlyingGeneralWarning();
        this.emit('history', { history: this.history, notation: msg.notation, move: mv });
        this.emit('turn', { turn: this.turn, inCheck: msg.inCheck });
        if (msg.inCheck) this._playCheckSpectacle();
        this.emit('clocks', msg.clocks);
        break;
      }
      case 'MOVE_REJECTED':
        if (msg.to === this.stomp?.session?.id || !msg.to) {
          this.emit('toast', { message: `Rejected: ${msg.message}`, kind: 'bad' });
        }
        break;
      case 'CLOCK':
        this.emit('clocks', msg.clocks);
        break;
      case 'UNDO_REQUESTED':
        if (msg.by !== this.onlineSide) this.emit('undo-request', { by: msg.by, expiresAt: msg.expiresAt });
        break;
      case 'UNDO_DECLINED':
        this.emit('toast', { message: 'Undo declined', kind: 'warn' });
        break;
      case 'UNDO_EXPIRED':
        this.emit('toast', { message: 'Undo request expired', kind: 'warn' });
        break;
      case 'UNDO_APPLIED':
        this.board = decodeBoard(msg.board);
        this.turn = msg.turn;
        this.history = this.history.slice(0, msg.history);
        this._buildPieces();
        this.emit('history', { history: this.history });
        this.emit('turn', { turn: this.turn });
        break;
      case 'GAME_OVER':
        this.board = decodeBoard(msg.board);
        this.status = { over: true, winner: msg.winner, reason: msg.reason, inCheck: msg.reason === 'checkmate' };
        if (msg.reason === 'checkmate') this._playCheckSpectacle(opposite(msg.winner));
        this._interactionEnabled = false;
        if (msg.ratings) {
          // msg.ratings = { r: {rating, delta}, b: {rating, delta} } after a ranked game
          this.playerRatings = { r: msg.ratings.r, b: msg.ratings.b };
        }
        this._buildPieces();
        this.emit('clocks', msg.clocks);
        this.emit('gameover', { winner: msg.winner, reason: msg.reason, ranked: msg.ranked, ratings: msg.ratings });
        break;
      default:
        break;
    }
  }

  respondUndo(accept) {
    this.stomp?.send(DEST.undoRespond(this.roomCode), { accept });
  }

  // -------- Replay hooks --------
  loadReplay(history) {
    this._cancelPendingAI();
    this.mode = 'replay';
    this._interactionEnabled = false;
    this.history = history.slice();
    this.replayIndex = history.length;
    this._rebuildFromHistoryAt(this.replayIndex);
  }

  _rebuildFromHistoryAt(n, announceCheck = false) {
    let b = initialBoard();
    for (let i = 0; i < n; i++) b = applyMove(b, this.history[i]);
    this.board = b;
    this.turn = n === 0 ? RED : opposite(this.history[n - 1].side);
    this.status = n >= this.history.length ? gameStatus(this.board, this.turn) : { over: false, inCheck: isInCheck(this.board, this.turn) };
    this._buildPieces();
    const last = n > 0 ? this.history[n - 1] : null;
    if (last) this._showLastMove(last); else if (this.lastMoveRing) this.lastMoveRing.visible = false;
    this._updateCheckFlash();
    this._updateFlyingGeneralWarning();
    this.emit('turn', { turn: this.turn, inCheck: this.status.inCheck });
    this.emit('replay-index', { index: n, total: this.history.length });
    if (announceCheck && this.status.inCheck) this._playCheckSpectacle();
  }

  replaySeek(n) {
    n = Math.max(0, Math.min(this.history.length, n | 0));
    if (n === this.replayIndex) return;
    const forward = n === this.replayIndex + 1;
    this.replayIndex = n;
    this._rebuildFromHistoryAt(n, forward);
  }

  replayStep(delta) { this.replaySeek((this.replayIndex || 0) + delta); }

  // Fork: take history up to `n` and start a live offline game from there against AI.
  forkAt(n, { aiLevel, humanSide }) {
    this._cancelPendingAI();
    n = Math.max(0, Math.min(this.history.length, n | 0));
    this.mode = 'offline';
    this.aiLevel = aiLevel ?? this.aiLevel;
    this.humanSide = humanSide ?? this.humanSide;
    this.history = this.history.slice(0, n);
    this._rebuildFromHistory();
    this._interactionEnabled = true;
    this.status = gameStatus(this.board, this.turn);
    this.emit('toast', { message: `Forked at move ${n}`, kind: 'info' });
    this._maybeAIMove();
  }
}
