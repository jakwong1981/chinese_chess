// Xiangqi AI — negamax with alpha-beta, MVV-LVA move ordering, material + PST evaluation.
// Level 1-10 controls search depth and per-move blunder probability.
// Runs inside a Web Worker to keep the UI responsive; also importable from the main thread.

import {
  RED, BLACK, opposite,
  legalMoves, applyMove, isInCheck, evaluate, PIECE_VALUE,
  initialBoard, encodeBoard, decodeBoard, idx
} from '../../shared/rules.js';

export const LEVELS = [
  { lv: 1,  name: '入門 Novice',        depth: 1, blunder: 0.40, jitter: 0.55, timeMs: 250 },
  { lv: 2,  name: '初學 Beginner',      depth: 1, blunder: 0.30, jitter: 0.40, timeMs: 400 },
  { lv: 3,  name: '業餘 Amateur',       depth: 2, blunder: 0.22, jitter: 0.28, timeMs: 600 },
  { lv: 4,  name: '熟手 Intermediate',  depth: 2, blunder: 0.15, jitter: 0.20, timeMs: 800 },
  { lv: 5,  name: '好手 Skilled',       depth: 3, blunder: 0.10, jitter: 0.14, timeMs: 1100 },
  { lv: 6,  name: '高手 Advanced',      depth: 3, blunder: 0.06, jitter: 0.09, timeMs: 1400 },
  { lv: 7,  name: '名家 Expert',        depth: 3, blunder: 0.03, jitter: 0.05, timeMs: 1800 },
  { lv: 8,  name: '大師 Master',        depth: 4, blunder: 0.015, jitter: 0.03, timeMs: 2400 },
  { lv: 9,  name: '特級大師 Grandmaster', depth: 4, blunder: 0.005, jitter: 0.015, timeMs: 3200 },
  { lv: 10, name: '棋聖 Chess Sage',    depth: 5, blunder: 0.0,  jitter: 0.005, timeMs: 4500 }
];

export function levelConfig(lv) {
  return LEVELS[Math.max(1, Math.min(10, lv | 0)) - 1];
}

// Move ordering: captures first (MVV-LVA), then checks, then quiet moves.
function orderMoves(board, moves) {
  const scored = moves.map(m => {
    let s = 0;
    if (m.capture && m.captured) s += 10000 + (PIECE_VALUE[m.captured] || 0) * 10 - (PIECE_VALUE[m.piece] || 0);
    return { m, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.map(x => x.m);
}

function negamax(board, side, depth, alpha, beta, deadline, ply = 0) {
  if (Date.now() > deadline) throw new Error('timeout');
  if (depth === 0) return evaluate(board, side);

  const moves = legalMoves(board, side);
  if (moves.length === 0) {
    // No legal moves: checkmate (side is in check) or stalemate — both lose for `side` in Xiangqi.
    return -99999 + ply;
  }
  const ordered = orderMoves(board, moves);
  let best = -Infinity;
  for (const mv of ordered) {
    const nb = applyMove(board, mv);
    const score = -negamax(nb, opposite(side), depth - 1, -beta, -alpha, deadline, ply + 1);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function search(board, side, cfg) {
  const deadline = Date.now() + cfg.timeMs;
  const moves = legalMoves(board, side);
  if (moves.length === 0) return null;
  const ordered = orderMoves(board, moves);

  let best = -Infinity;
  let bestMoves = [];
  for (const mv of ordered) {
    const nb = applyMove(board, mv);
    let score;
    try {
      score = -negamax(nb, opposite(side), cfg.depth - 1, -Infinity, Infinity, deadline, 1);
    } catch (e) {
      // Timeout: fall back to a shallow static eval for this move.
      score = evaluate(nb, opposite(side)) * -1;
    }
    // Add small jitter so equal-scoring moves aren't deterministic.
    score += (Math.random() - 0.5) * cfg.jitter * 60;
    if (score > best + 0.0001) { best = score; bestMoves = [mv]; }
    else if (Math.abs(score - best) < 0.0001) bestMoves.push(mv);
  }

  // Blunder injection: with probability `cfg.blunder`, pick a random legal move instead.
  if (cfg.blunder > 0 && Math.random() < cfg.blunder) {
    return { move: moves[(Math.random() * moves.length) | 0], score: best, blunder: true };
  }
  const pick = bestMoves[(Math.random() * bestMoves.length) | 0] || moves[0];
  return { move: pick, score: best, blunder: false };
}

// Public entry: choose a move for `side` given the current board.
export function chooseMove(board, side, level) {
  const cfg = levelConfig(level);
  const res = search(board, side, cfg);
  if (!res) return null;
  return res.move;
}

// Hint: run a low-blunder search regardless of level to suggest a strong move.
export function suggestHint(board, side) {
  const cfg = { depth: 4, blunder: 0, jitter: 0.005, timeMs: 2500 };
  const res = search(board, side, cfg);
  return res?.move || null;
}

// -------- Web Worker message interface --------
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
  self.onmessage = (ev) => {
    const msg = ev.data || {};
    try {
      if (msg.type === 'move') {
        const board = msg.boardEnc ? decodeBoard(msg.boardEnc) : initialBoard();
        const side = msg.side === BLACK ? BLACK : RED;
        const t0 = Date.now();
        const mv = chooseMove(board, side, msg.level || 3);
        self.postMessage({
          type: 'move',
          reqId: msg.reqId,
          move: mv,
          elapsed: Date.now() - t0
        });
      } else if (msg.type === 'hint') {
        const board = msg.boardEnc ? decodeBoard(msg.boardEnc) : initialBoard();
        const side = msg.side === BLACK ? BLACK : RED;
        const mv = suggestHint(board, side);
        self.postMessage({ type: 'hint', reqId: msg.reqId, move: mv });
      }
    } catch (e) {
      self.postMessage({ type: 'error', reqId: msg.reqId, error: String(e.message || e) });
    }
  };
}
