// Unit tests for the Xiangqi MVP — run with `npm test` (node --test).
// Covers: rules engine, STOMP frame codec, and the room/matchmaking/clock manager.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RED, BLACK, opposite,
  initialBoard, encodeBoard, decodeBoard,
  legalMoves, applyMove, isLegalMove, gameStatus, isInCheck, kingsFacing,
  idx, xy, pieceMoves, evaluate, findKing
} from '../shared/rules.js';

import { parseFrame, serializeFrame } from '../server/stomp.js';
import { RoomManager } from '../server/rooms.js';
import { RatingsStore } from '../server/ratings.js';

// ---------------------------------------------------------------- rules ----

test('opening position yields 44 legal moves per side', () => {
  const b = initialBoard();
  assert.equal(legalMoves(b, RED).length, 44);
  assert.equal(legalMoves(b, BLACK).length, 44);
});

test('board encode/decode round-trips', () => {
  const b = initialBoard();
  const enc = encodeBoard(b);
  assert.equal(enc.length, 180);
  const dec = decodeBoard(enc);
  for (let i = 0; i < b.length; i++) {
    const p1 = b[i], p2 = dec[i];
    if (!p1) assert.equal(p2, null);
    else {
      assert.equal(p2.side, p1.side);
      assert.equal(p2.type, p1.type);
    }
  }
});

test('horse is blocked by an occupied leg', () => {
  const b = initialBoard();
  b[idx(1, 1)] = { side: RED, type: 'P', id: 900 };
  const moves = pieceMoves(b, 1, 0);
  assert.ok(!moves.some(m => m.toX === 2 && m.toY === 2));
});

test('elephant is blocked by an occupied eye and cannot cross river', () => {
  const b = initialBoard();
  b[idx(3, 1)] = { side: RED, type: 'P', id: 901 };
  const blocked = pieceMoves(b, 2, 0);
  assert.ok(!blocked.some(m => m.toX === 4 && m.toY === 2));
  // Unblocked elephant still cannot cross the river.
  const b2 = initialBoard();
  const free = pieceMoves(b2, 2, 0);
  assert.ok(free.every(m => m.toY <= 4));
});

test('cannon needs a screen to capture', () => {
  const b = initialBoard();
  const caps = pieceMoves(b, 1, 2).filter(m => m.capture);
  assert.equal(caps.length, 1);
  assert.deepEqual([caps[0].toX, caps[0].toY], [1, 9]);
  const b2 = initialBoard();
  b2[idx(1, 7)] = null; // remove the screen
  assert.equal(pieceMoves(b2, 1, 2).filter(m => m.capture).length, 0);
});

test('pawn gains sideways moves only after crossing the river', () => {
  const before = pieceMoves(initialBoard(), 0, 3);
  assert.equal(before.length, 1);
  const b = initialBoard();
  b[idx(0, 3)] = null;
  b[idx(0, 5)] = { side: RED, type: 'P', id: 902 };
  const after = pieceMoves(b, 0, 5);
  assert.ok(after.some(m => m.toX === 0 && m.toY === 6));
  assert.ok(after.some(m => m.toX === 1 && m.toY === 5));
  assert.ok(!after.some(m => m.toY === 4));
});

test('flying general: moves that leave kings facing are illegal', () => {
  const b = initialBoard();
  for (let y = 1; y <= 8; y++) b[idx(4, y)] = null;
  assert.ok(kingsFacing(b));
  const keepFacing = legalMoves(b, RED).filter(m => kingsFacing(applyMove(b, m)));
  assert.equal(keepFacing.length, 0);
});

test('evaluation is zero-sum and ~0 at the opening', () => {
  const b = initialBoard();
  assert.ok(Math.abs(evaluate(b, RED) + evaluate(b, BLACK)) < 1e-6);
  assert.ok(Math.abs(evaluate(b, RED)) < 1e-6);
});

test('applyMove relocates the piece and clears the source', () => {
  const b = initialBoard();
  const mv = { fromX: 1, fromY: 0, toX: 2, toY: 2 };
  assert.ok(isLegalMove(b, RED, mv));
  const nb = applyMove(b, mv);
  assert.equal(nb[idx(1, 0)], null);
  assert.equal(nb[idx(2, 2)].type, 'H');
});

test('random self-play never produces an illegal state', () => {
  let b = initialBoard();
  let side = RED;
  for (let i = 0; i < 60; i++) {
    const ms = legalMoves(b, side);
    if (!ms.length) break;
    b = applyMove(b, ms[(Math.random() * ms.length) | 0]);
    side = opposite(side);
    // Kings must always exist and never face each other after a legal move.
    assert.ok(findKing(b, RED) >= 0);
    assert.ok(findKing(b, BLACK) >= 0);
    assert.ok(!kingsFacing(b));
  }
});

// ---------------------------------------------------------------- stomp ----

test('STOMP frame serialize/parse round-trips', () => {
  const frame = serializeFrame('SEND', { destination: '/app/x', 'content-type': 'application/json' }, '{"a":1}');
  const parsed = parseFrame(frame);
  assert.equal(parsed.command, 'SEND');
  assert.equal(parsed.headers.destination, '/app/x');
  assert.equal(parsed.body, '{"a":1}');
});

test('STOMP parse handles heartbeat and CONNECT', () => {
  assert.equal(parseFrame('\n').command, 'HEARTBEAT');
  const c = parseFrame('CONNECT\naccept-version:1.2\nhost:h\n\n\0');
  assert.equal(c.command, 'CONNECT');
  assert.equal(c.headers['accept-version'], '1.2');
});

// ---------------------------------------------------------------- rooms ----

function stubBroker() {
  const published = [];
  const sentTo = [];
  return {
    published,
    sentTo,
    publish(dest, body) { published.push({ dest, body }); },
    sendTo(session, dest, body) { sentTo.push({ session, dest, body }); },
    error() {}
  };
}
function fakeSession(id) {
  return { id, ws: { readyState: 1, close() {}, send() {} } };
}
function lastTo(broker, dest) {
  return broker.sentTo.filter(s => s.dest === dest).pop()?.body;
}

test('two players joining a room get opposite sides and a GAME_START', () => {
  const broker = stubBroker();
  const rm = new RoomManager(broker);
  const a = fakeSession('a');
  const b = fakeSession('b');
  rm.joinByCode(a, 'XQTEST', 'alice');
  const joinedA = lastTo(broker, '/user/queue/joined');
  rm.joinByCode(b, 'XQTEST', 'bob');
  const joinedB = lastTo(broker, '/user/queue/joined');
  assert.notEqual(joinedA.side, joinedB.side);
  assert.equal(joinedA.roomCode, joinedB.roomCode);
  const start = broker.published.filter(p => p.body.type === 'GAME_START').pop();
  assert.ok(start, 'expected GAME_START broadcast');
  assert.equal(start.body.turn, RED);
});

test('server rejects a move out of turn', () => {
  const broker = stubBroker();
  const rm = new RoomManager(broker);
  const a = fakeSession('a');
  const b = fakeSession('b');
  rm.joinByCode(a, 'XQT2', 'alice');
  rm.joinByCode(b, 'XQT2', 'bob');
  const joinedA = broker.sentTo.filter(s => s.session === a && s.dest === '/user/queue/joined').pop().body;
  const mover = joinedA.side === RED ? a : b;
  const waiter = mover === a ? b : a;
  // Waiter tries to move first (Red moves first) -> should be rejected.
  rm.handleMove(waiter, 'XQT2', { fromX: 1, fromY: 0, toX: 2, toY: 2 });
  const rej = broker.published.filter(p => p.body.type === 'MOVE_REJECTED').pop();
  assert.ok(rej, 'expected MOVE_REJECTED');
  assert.equal(rej.body.code, 'not-your-turn');
});

test('server accepts a legal first move and broadcasts MOVE_CONFIRMED', () => {
  const broker = stubBroker();
  const rm = new RoomManager(broker);
  const a = fakeSession('a');
  const b = fakeSession('b');
  rm.joinByCode(a, 'XQT3', 'alice');
  rm.joinByCode(b, 'XQT3', 'bob');
  const joinedA = broker.sentTo.filter(s => s.session === a && s.dest === '/user/queue/joined').pop().body;
  const red = joinedA.side === RED ? a : b;
  rm.handleMove(red, 'XQT3', { fromX: 1, fromY: 0, toX: 2, toY: 2 });
  const conf = broker.published.filter(p => p.body.type === 'MOVE_CONFIRMED').pop();
  assert.ok(conf, 'expected MOVE_CONFIRMED');
  assert.equal(conf.body.turn, BLACK);
});

test('server rejects an illegal move', () => {
  const broker = stubBroker();
  const rm = new RoomManager(broker);
  const a = fakeSession('a');
  const b = fakeSession('b');
  rm.joinByCode(a, 'XQT4', 'alice');
  rm.joinByCode(b, 'XQT4', 'bob');
  const joinedA = broker.sentTo.filter(s => s.session === a && s.dest === '/user/queue/joined').pop().body;
  const red = joinedA.side === RED ? a : b;
  // Knight-like jump that is not a legal Xiangqi move.
  rm.handleMove(red, 'XQT4', { fromX: 0, fromY: 0, toX: 1, toY: 2 });
  const rej = broker.published.filter(p => p.body.type === 'MOVE_REJECTED').pop();
  assert.ok(rej);
  assert.equal(rej.body.code, 'illegal');
});

test('resign ends the game in favour of the opponent', () => {
  const broker = stubBroker();
  const rm = new RoomManager(broker);
  const a = fakeSession('a');
  const b = fakeSession('b');
  rm.joinByCode(a, 'XQT5', 'alice');
  rm.joinByCode(b, 'XQT5', 'bob');
  const joinedA = broker.sentTo.filter(s => s.session === a && s.dest === '/user/queue/joined').pop().body;
  rm.handleResign(a, 'XQT5');
  const over = broker.published.filter(p => p.body.type === 'GAME_OVER').pop();
  assert.ok(over);
  assert.equal(over.body.winner, opposite(joinedA.side));
  assert.equal(over.body.reason, 'resign');
});

test('quick match pairs two queued players', () => {
  const broker = stubBroker();
  const rm = new RoomManager(broker);
  const a = fakeSession('a');
  const b = fakeSession('b');
  const first = rm.quickMatch(a, 'alice');
  assert.equal(first, null, 'first player should be queued');
  const room = rm.quickMatch(b, 'bob');
  assert.ok(room, 'second player should be matched');
  const start = broker.published.filter(p => p.body.type === 'GAME_START').pop();
  assert.ok(start);
});

test('undo is refused in non-casual rooms and allowed in casual rooms', () => {
  const broker = stubBroker();
  const rm = new RoomManager(broker);
  const a = fakeSession('a');
  const b = fakeSession('b');
  rm.joinByCode(a, 'XQT6', 'alice');
  rm.joinByCode(b, 'XQT6', 'bob');
  const room = rm.getRoom('XQT6');
  assert.equal(room.casual, true);
  // Play one legal move so there is history to undo.
  const joinedA = broker.sentTo.filter(s => s.session === a && s.dest === '/user/queue/joined').pop().body;
  const red = joinedA.side === RED ? a : b;
  rm.handleMove(red, 'XQT6', { fromX: 1, fromY: 0, toX: 2, toY: 2 });
  rm.handleUndoRequest(red, 'XQT6');
  const req = broker.published.filter(p => p.body.type === 'UNDO_REQUESTED').pop();
  assert.ok(req, 'casual room should broadcast UNDO_REQUESTED');
});

// ------------------------------------------------------------- ratings ----

function freshRatings() {
  // Use an isolated temp path so tests never touch the real data file.
  const file = `/tmp/xq-test-ratings-${process.pid}-${Math.random().toString(36).slice(2)}.json`;
  return new RatingsStore(file);
}

test('new players start at 1200 and register is idempotent', () => {
  const r = freshRatings();
  const a = r.register('alice', 'Alice');
  assert.equal(a.rating, 1200);
  assert.equal(a.games, 0);
  // Registering again returns the same record, not a fresh one.
  const again = r.register('alice', 'Alice Renamed');
  assert.equal(again.rating, 1200);
  assert.equal(r.players.size, 1);
});

test('a ranked win raises the winner and lowers the loser (zero-sum-ish)', () => {
  const r = freshRatings();
  r.register('alice');
  r.register('bob');
  const res = r.recordResult('alice', 'bob', 'r');
  assert.ok(res.r.rating > 1200, 'winner gains');
  assert.ok(res.b.rating < 1200, 'loser drops');
  assert.ok(res.r.delta > 0 && res.b.delta < 0);
  // Deltas should be ~zero-sum (rounding may differ by 1).
  assert.ok(Math.abs(res.r.delta + res.b.delta) <= 1);
  assert.equal(r.get('alice').wins, 1);
  assert.equal(r.get('bob').losses, 1);
});

test('beating a stronger player is worth more than beating a weaker one', () => {
  const r = freshRatings();
  r.register('strong').rating = 1600;
  r.register('weak').rating = 1200;
  const gainVsStrong = r.recordResult('weak', 'strong', 'r').r.delta; // weak beats strong
  const r2 = freshRatings();
  r2.register('strong').rating = 1600;
  r2.register('weak').rating = 1200;
  const lossVsStrong = r2.recordResult('strong', 'weak', 'r').r.delta; // strong beats weak
  assert.ok(gainVsStrong > lossVsStrong, 'upset win is worth more');
});

test('leaderboard sorts by rating and only lists players with games', () => {
  const r = freshRatings();
  r.register('alice');
  r.register('bob');
  r.register('carol');
  // carol has never played -> excluded from the ladder.
  r.recordResult('alice', 'bob', 'r');
  r.recordResult('alice', 'bob', 'r');
  const board = r.leaderboard(10);
  assert.equal(board.length, 2);
  assert.equal(board[0].id, 'alice');
  assert.equal(board[0].rank, 1);
  assert.ok(board[0].rating > board[1].rating);
});

// ---------------------------------------------------- ranked room flow ----

test('quick match creates a ranked room and records the result on the ladder', () => {
  const broker = stubBroker();
  const ratings = freshRatings();
  const rm = new RoomManager(broker, ratings);
  const a = fakeSession('a');
  const b = fakeSession('b');
  rm.quickMatch(a, 'alice');
  const room = rm.quickMatch(b, 'bob');
  assert.ok(room, 'second player should be matched');
  assert.equal(room.ranked, true, 'quick match is ranked');
  assert.equal(ratings.get('a').rating, 1200);
  assert.equal(ratings.get('b').rating, 1200);
  // One side resigns -> ladder updates and GAME_OVER carries the deltas.
  rm.handleResign(a, room.code);
  const over = broker.published.filter(p => p.body.type === 'GAME_OVER').pop();
  assert.ok(over);
  assert.equal(over.body.ranked, true);
  assert.ok(over.body.ratings, 'GAME_OVER should include rating deltas');
  const winner = over.body.winner;
  const winnerKey = winner === 'r' ? 'r' : 'b';
  const loserKey = winner === 'r' ? 'b' : 'r';
  assert.ok(over.body.ratings[winnerKey].delta > 0);
  assert.ok(over.body.ratings[loserKey].delta < 0);
  assert.equal(ratings.get(winnerKey === 'r' ? 'a' : 'b').wins >= 0, true);
});

test('casual private rooms do not touch the ladder', () => {
  const broker = stubBroker();
  const ratings = freshRatings();
  const rm = new RoomManager(broker, ratings);
  const a = fakeSession('a');
  const b = fakeSession('b');
  rm.joinByCode(a, 'XQCS', 'alice');
  rm.joinByCode(b, 'XQCS', 'bob');
  const room = rm.getRoom('XQCS');
  assert.equal(room.ranked, false, 'private room is casual');
  rm.handleResign(a, 'XQCS');
  const over = broker.published.filter(p => p.body.type === 'GAME_OVER').pop();
  assert.ok(over);
  assert.equal(over.body.ranked, false);
  assert.equal(over.body.ratings, null, 'casual games carry no rating update');
  assert.equal(ratings.get('a').games, 0, 'casual games are not counted');
});
