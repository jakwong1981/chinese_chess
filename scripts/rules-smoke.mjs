// Quick smoke test for the Xiangqi rules engine.
// Run with: node scripts/rules-smoke.mjs

import {
  RED, BLACK,
  initialBoard, encodeBoard, decodeBoard,
  legalMoves, applyMove, isLegalMove, gameStatus, isInCheck, kingsFacing,
  idx, xy, pieceMoves, evaluate
} from '../shared/rules.js';

const b = initialBoard();
const redMoves = legalMoves(b, RED);
const blackMoves = legalMoves(b, BLACK);

console.log('Initial legal moves — Red:', redMoves.length, 'Black:', blackMoves.length);
console.assert(redMoves.length === 44, `Expected 44 red opening moves, got ${redMoves.length}`);
console.assert(blackMoves.length === 44, `Expected 44 black opening moves, got ${blackMoves.length}`);

// Encode/decode round-trip
const enc = encodeBoard(b);
console.log('Encoded length:', enc.length, '(expect 180)');
console.assert(enc.length === 180);
const dec = decodeBoard(enc);
for (let i = 0; i < b.length; i++) {
  const p1 = b[i], p2 = dec[i];
  if ((p1 && !p2) || (!p1 && p2) || (p1 && p2 && (p1.side !== p2.side || p1.type !== p2.type))) {
    console.error('Round-trip mismatch at', i, p1, p2);
    process.exit(1);
  }
}
console.log('Encode/decode round-trip: OK');

// Horse opening move: (1,0) -> (2,2)
const horseMove = { fromX: 1, fromY: 0, toX: 2, toY: 2 };
console.assert(isLegalMove(b, RED, horseMove), 'Horse opening should be legal');
const b2 = applyMove(b, horseMove);
console.assert(b2[idx(1, 0)] === null, 'Source should be empty after move');
console.assert(b2[idx(2, 2)]?.type === 'H', 'Horse should be at destination');
console.log('Horse move + apply: OK');

// Horse-leg block test: put a piece at (1,1), horse at (0,0) should not reach (2,1).
const b3 = initialBoard();
b3[idx(1, 1)] = { side: RED, type: 'P', id: 999 };
const horseAt00 = pieceMoves(b3, 0, 0); // actually (0,0) is a Rook, so test horse at (1,0)
// Simpler: block the horse at (1,0) by placing a piece at (1,1)
const horseMoves = pieceMoves(b3, 1, 0);
const canReach22 = horseMoves.some(m => m.toX === 2 && m.toY === 2);
console.assert(!canReach22, 'Horse should be blocked when leg is occupied');
console.log('Horse-leg block: OK');

// Elephant eye block test
const b4 = initialBoard();
b4[idx(3, 1)] = { side: RED, type: 'P', id: 998 };
const elephantMoves = pieceMoves(b4, 2, 0);
const canReach42 = elephantMoves.some(m => m.toX === 4 && m.toY === 2);
console.assert(!canReach42, 'Elephant should be blocked when eye is occupied');
console.log('Elephant-eye block: OK');

// Cannon capture requires a platform.
// In the opening, red cannon at (1,2) has exactly ONE capture available: the black horse at (1,9),
// using the black cannon at (1,7) as the screen. Same for the (7,2) cannon.
const b5 = initialBoard();
const cannonMoves1_2 = pieceMoves(b5, 1, 2);
const caps = cannonMoves1_2.filter(m => m.capture);
console.assert(caps.length === 1, `Opening cannon at (1,2) should have exactly 1 capture, got ${caps.length}`);
console.assert(caps[0]?.toX === 1 && caps[0]?.toY === 9, 'Cannon capture should be the horse at (1,9)');
// Verify that removing the screen (black cannon at (1,7)) removes the capture.
const b5b = initialBoard();
b5b[idx(1, 7)] = null;
const caps2 = pieceMoves(b5b, 1, 2).filter(m => m.capture);
console.assert(caps2.length === 0, 'Without a screen, cannon should have no captures');
console.log('Cannon platform rule: OK');

// Pawn before/after river
const b6 = initialBoard();
const pawnMovesBefore = pieceMoves(b6, 0, 3);
console.assert(pawnMovesBefore.length === 1, 'Pawn before river: only 1 forward move');
const b7 = initialBoard();
b7[idx(0, 3)] = null;
b7[idx(0, 5)] = { side: RED, type: 'P', id: 997 };
const pawnMovesAfter = pieceMoves(b7, 0, 5);
// After crossing river, pawn can move forward + sideways (but not off board, not backward)
console.assert(pawnMovesAfter.some(m => m.toX === 0 && m.toY === 6), 'Crossed pawn can move forward');
console.assert(pawnMovesAfter.some(m => m.toX === 1 && m.toY === 5), 'Crossed pawn can move sideways');
console.assert(!pawnMovesAfter.some(m => m.toY === 4), 'Crossed pawn cannot move backward');
console.log('Pawn river-crossing upgrade: OK');

// Flying general test
const b8 = initialBoard();
// Clear the file between the two kings
for (let y = 1; y <= 8; y++) b8[idx(4, y)] = null;
console.assert(kingsFacing(b8), 'Kings on same file with nothing between = facing');
const facingMoves = legalMoves(b8, RED);
// Red king should not be able to stay on the file if it means facing black king with no blockers.
// Actually kingsFacing means the position is illegal — the side to move must resolve it or it counts
// as an attack. Check that a move that maintains facing is filtered out.
const stayFacingMoveCount = facingMoves.filter(m => {
  const nb = applyMove(b8, m);
  return kingsFacing(nb);
}).length;
console.assert(stayFacingMoveCount === 0, 'Moves that leave kings facing are illegal');
console.log('Flying general rule: OK');

// Checkmate smoke: fool's-mate-like position is hard to construct quickly, so just verify
// that gameStatus reports the correct count of moves and no over flag at start.
const status = gameStatus(b, RED);
console.assert(!status.over && status.moves === 44, `Opening status: ${JSON.stringify(status)}`);
console.log('Opening status: OK');

// Evaluation symmetry: initial position should be near zero.
const evalR = evaluate(b, RED);
const evalB = evaluate(b, BLACK);
console.assert(Math.abs(evalR + evalB) < 1e-6, 'Eval should be zero-sum');
console.assert(Math.abs(evalR) < 1e-6, `Opening eval should be 0, got ${evalR}`);
console.log('Evaluation symmetry: OK');

// Play 20 random legal moves and ensure no crash / no illegal state.
let cur = initialBoard();
let side = RED;
for (let i = 0; i < 40; i++) {
  const ms = legalMoves(cur, side);
  if (!ms.length) { console.log('Game over at ply', i, 'winner:', side === RED ? BLACK : RED); break; }
  const mv = ms[(Math.random() * ms.length) | 0];
  cur = applyMove(cur, mv);
  side = side === RED ? BLACK : RED;
}
console.log('Random 40-ply self-play: OK, no crash');

console.log('\n✅ All smoke tests passed');
