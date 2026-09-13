// In-memory room + matchmaking manager for the mock backend.
// Handles: quick-match queue, private rooms, server-authoritative move validation,
// Fischer increment clocks, 15s consensual undo (casual rooms), and game-over broadcast.

import {
  RED, BLACK, opposite,
  initialBoard, encodeBoard, applyMove, isLegalMove, gameStatus, moveToNotation
} from '../shared/rules.js';

const ROOM_TTL_MS = 60 * 60 * 1000; // 1 hour

let nextRoomSeq = 1000;

function makeRoomCode() {
  return 'XQ' + (nextRoomSeq++).toString(36).toUpperCase().padStart(4, '0');
}

export class RoomManager {
  constructor(broker, ratings) {
    this.broker = broker;
    this.ratings = ratings || null;
    this.rooms = new Map();       // code -> room
    this.queue = [];              // waiting sessions for quick match
    this.playerRooms = new Map(); // sessionId -> roomCode
  }

  _playerRec(session, name) {
    const id = session.playerId || session.id;
    return this.ratings ? this.ratings.register(id, name) : null;
  }

  createRoom(opts = {}) {
    const code = opts.code || makeRoomCode();
    const room = {
      code,
      casual: opts.casual !== false,
      ranked: opts.ranked === true, // ranked games count toward the ladder
      baseMs: opts.baseMs ?? 10 * 60 * 1000,
      incMs: opts.incMs ?? 5 * 1000,
      players: { r: null, b: null }, // { session, playerId, name, side, ms }
      board: initialBoard(),
      turn: RED,
      history: [],
      status: 'waiting', // waiting | playing | over
      winner: null,
      reason: null,
      undoRequest: null, // { side, expiresAt, timer }
      clockTimer: null,
      lastTickAt: null,
      createdAt: Date.now()
    };
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) { return this.rooms.get(code); }

  joinByCode(session, code, name) {
    let room = this.rooms.get(code);
    if (!room) {
      // Private rooms are casual by default (undo allowed, no rating impact).
      room = this.createRoom({ code, casual: true, ranked: false });
    }
    return this._seat(session, room, name);
  }

  quickMatch(session, name) {
    // Find a waiting opponent, preferring the closest rating (ladder matchmaking).
    const candidates = this.queue.filter(q => q.session !== session && q.session.ws.readyState === 1);
    let waiting = null;
    if (this.ratings && candidates.length) {
      const selfId = session.playerId || session.id;
      const chosenId = this.ratings.bestMatch(candidates.map(c => c.session.playerId || c.session.id), selfId);
      waiting = candidates.find(c => (c.session.playerId || c.session.id) === chosenId) || candidates[0];
    } else {
      waiting = candidates[0] || null;
    }
    if (waiting) {
      this.queue = this.queue.filter(q => q !== waiting);
      const room = this.createRoom({ casual: false, ranked: true }); // quick match is ranked
      const a = this._seat(waiting.session, room, waiting.name, RED);
      const b = this._seat(session, room, name, BLACK);
      if (a && b) this._startGame(room);
      return room;
    }
    this.queue.push({ session, name });
    this.broker.sendTo(session, '/user/queue/matchmaking', { status: 'queued' });
    return null;
  }

  leaveQueue(session) {
    this.queue = this.queue.filter(q => q.session !== session);
  }

  _seat(session, room, name, preferredSide) {
    const other = Object.values(room.players).find(p => p && p.session !== session);
    let side = preferredSide;
    if (!side) side = other ? opposite(other.side) : (Math.random() < 0.5 ? RED : BLACK);
    if (room.players[side] && room.players[side].session !== session) {
      // Slot full — try opposite.
      const alt = opposite(side);
      if (room.players[alt]) return null;
      side = alt;
    }
    const playerId = session.playerId || session.id;
    room.players[side] = {
      session,
      playerId,
      name: name || 'player',
      side,
      ms: room.baseMs
    };
    const myRec = this._playerRec(session, name);
    this.playerRooms.set(session.id, room.code);
    this.broker.sendTo(session, '/user/queue/joined', {
      roomCode: room.code,
      side,
      casual: room.casual,
      ranked: room.ranked,
      baseMs: room.baseMs,
      incMs: room.incMs,
      opponent: other ? other.name : null,
      status: room.status,
      rating: myRec ? { rating: myRec.rating, wins: myRec.wins, losses: myRec.losses, draws: myRec.draws } : null
    });
    this._broadcastRoom(room, {
      type: 'PLAYER_JOINED',
      side,
      name: room.players[side].name,
      status: room.status
    });
    // Once both seats are filled, begin play (covers private-room joins, not just quick match).
    if (room.players.r && room.players.b && room.status === 'waiting') {
      this._startGame(room);
    }
    return room;
  }

  _startGame(room) {
    room.status = 'playing';
    room.board = initialBoard();
    room.turn = RED;
    room.history = [];
    room.lastTickAt = Date.now();
    if (room.clockTimer) clearInterval(room.clockTimer);
    room.clockTimer = setInterval(() => this._tick(room), 250);
    // Don't let the clock keep a bare process (e.g. the test runner) alive.
    room.clockTimer.unref?.();
    const playerInfo = (p) => p ? {
      name: p.name,
      rating: this.ratings ? this.ratings.ratingOf(p.playerId) : null
    } : null;
    this._broadcastRoom(room, {
      type: 'GAME_START',
      board: encodeBoard(room.board),
      turn: room.turn,
      ranked: room.ranked,
      players: {
        r: playerInfo(room.players.r),
        b: playerInfo(room.players.b)
      },
      clocks: this._clockSnapshot(room)
    });
  }

  _clockSnapshot(room) {
    return {
      r: Math.max(0, Math.round(room.players.r?.ms ?? 0)),
      b: Math.max(0, Math.round(room.players.b?.ms ?? 0))
    };
  }

  _tick(room) {
    if (room.status !== 'playing') return;
    const now = Date.now();
    const dt = now - (room.lastTickAt || now);
    room.lastTickAt = now;
    const cur = room.players[room.turn];
    if (!cur) return;
    cur.ms -= dt;
    if (cur.ms <= 0) {
      cur.ms = 0;
      this._finishGame(room, opposite(room.turn), 'timeout');
      return;
    }
    this._broadcastRoom(room, { type: 'CLOCK', clocks: this._clockSnapshot(room) });
  }

  handleMove(session, roomCode, mv) {
    const room = this.rooms.get(roomCode);
    if (!room) return this._reject(session, roomCode, 'no-room', 'Room not found');
    if (room.status !== 'playing') return this._reject(session, roomCode, 'not-playing', 'Game is not in progress');
    const player = Object.values(room.players).find(p => p && p.session === session);
    if (!player) return this._reject(session, roomCode, 'not-in-room', 'You are not in this room');
    if (player.side !== room.turn) return this._reject(session, roomCode, 'not-your-turn', 'Not your turn');
    const move = { fromX: +mv.fromX, fromY: +mv.fromY, toX: +mv.toX, toY: +mv.toY };
    if (!isLegalMove(room.board, room.turn, move)) {
      return this._reject(session, roomCode, 'illegal', 'Illegal move');
    }
    const captured = room.board[move.toY * 9 + move.toX];
    room.board = applyMove(room.board, move);
    // Apply Fischer increment to mover.
    player.ms += room.incMs;
    room.history.push({ ...move, side: room.turn, captured: captured?.type || null, at: Date.now() });
    const next = opposite(room.turn);
    room.turn = next;
    const status = gameStatus(room.board, next);
    const notation = moveToNotation(room.board, room.history[room.history.length - 1]);
    this._broadcastRoom(room, {
      type: 'MOVE_CONFIRMED',
      move: { ...move, side: player.side, captured: captured?.type || null },
      notation,
      board: encodeBoard(room.board),
      turn: next,
      clocks: this._clockSnapshot(room),
      inCheck: status.inCheck
    });
    if (status.over) {
      this._finishGame(room, status.winner, status.reason);
    }
    // Any pending undo is invalidated once a new move lands.
    this._clearUndo(room);
  }

  handleResign(session, roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== 'playing') return;
    const player = Object.values(room.players).find(p => p && p.session === session);
    if (!player) return;
    this._finishGame(room, opposite(player.side), 'resign');
  }

  handleUndoRequest(session, roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== 'playing') return this._reject(session, roomCode, 'not-playing', 'Game is not in progress');
    if (!room.casual) return this._reject(session, roomCode, 'not-casual', 'Undo is only allowed in casual rooms');
    const player = Object.values(room.players).find(p => p && p.session === session);
    if (!player) return;
    if (room.history.length === 0) return this._reject(session, roomCode, 'no-history', 'No moves to undo');
    if (room.undoRequest) return;
    room.undoRequest = { side: player.side, expiresAt: Date.now() + 15000 };
    room.undoRequest.timer = setTimeout(() => {
      if (!room.undoRequest) return;
      this._broadcastRoom(room, { type: 'UNDO_EXPIRED' });
      room.undoRequest = null;
    }, 15000);
    room.undoRequest.timer.unref?.();
    this._broadcastRoom(room, { type: 'UNDO_REQUESTED', by: player.side, expiresAt: room.undoRequest.expiresAt });
  }

  handleUndoResponse(session, roomCode, accept) {
    const room = this.rooms.get(roomCode);
    if (!room || !room.undoRequest) return;
    const player = Object.values(room.players).find(p => p && p.session === session);
    if (!player || player.side === room.undoRequest.side) return;
    if (!accept) {
      this._clearUndo(room);
      this._broadcastRoom(room, { type: 'UNDO_DECLINED', by: player.side });
      return;
    }
    // Pop the last move (the requester's own move).
    const last = room.history.pop();
    if (last) {
      // Rebuild board from history to stay honest.
      let b = initialBoard();
      for (const h of room.history) b = applyMove(b, h);
      room.board = b;
      room.turn = last.side;
    }
    this._clearUndo(room);
    this._broadcastRoom(room, {
      type: 'UNDO_APPLIED',
      board: encodeBoard(room.board),
      turn: room.turn,
      history: room.history.length
    });
  }

  _clearUndo(room) {
    if (room.undoRequest?.timer) clearTimeout(room.undoRequest.timer);
    room.undoRequest = null;
  }

  _reject(session, roomCode, code, message) {
    this.broker.publish(`/topic/room/${roomCode}`, {
      type: 'MOVE_REJECTED',
      code,
      message,
      to: session.id
    });
  }

  _finishGame(room, winner, reason) {
    room.status = 'over';
    room.winner = winner;
    room.reason = reason;
    if (room.clockTimer) { clearInterval(room.clockTimer); room.clockTimer = null; }
    this._clearUndo(room);
    // Ranked games update the ladder; casual games never touch it.
    let ratingUpdate = null;
    if (room.ranked && this.ratings && room.players.r && room.players.b) {
      ratingUpdate = this.ratings.recordResult(room.players.r.playerId, room.players.b.playerId, winner);
    }
    this._broadcastRoom(room, {
      type: 'GAME_OVER',
      winner,
      reason,
      board: encodeBoard(room.board),
      history: room.history,
      clocks: this._clockSnapshot(room),
      ranked: room.ranked,
      ratings: ratingUpdate
    });
    const t = setTimeout(() => this._cleanup(room.code), ROOM_TTL_MS);
    t.unref?.();
  }

  _broadcastRoom(room, payload) {
    this.broker.publish(`/topic/room/${room.code}`, payload);
  }

  _cleanup(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    if (room.clockTimer) clearInterval(room.clockTimer);
    this._clearUndo(room);
    for (const p of Object.values(room.players)) {
      if (p) this.playerRooms.delete(p.session.id);
    }
    this.rooms.delete(code);
  }

  handleDisconnect(session) {
    this.leaveQueue(session);
    const code = this.playerRooms.get(session.id);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    const player = Object.values(room.players).find(p => p && p.session === session);
    if (player && room.status === 'playing') {
      this._finishGame(room, opposite(player.side), 'disconnect');
    }
    if (player) room.players[player.side] = null;
    this.playerRooms.delete(session.id);
  }
}
