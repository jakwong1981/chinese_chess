// Xiangqi AI — iterative-deepening negamax with alpha-beta pruning, a Zobrist
// transposition table, quiescence search, killer/history move ordering, and
// in-place make/unmake so a search node allocates nothing.
//
// Runs inside a Web Worker (see game.js) so the 3D scene never stutters.
// Also importable from Node for tests.

import {
  RED, BLACK, opposite,
  KING,
  FILES,
  pieceMoves, makeMove, unmakeMove, isKingAttackedAt, findKing,
  evaluate, PIECE_VALUE, initialBoard, decodeBoard
} from '../../shared/rules.js';

// ---------------------------------------------------------------------------
// Difficulty ladder
// maxDepth is a *cap*: iterative deepening stops earlier when the clock runs
// out, so a level never exceeds timeMs. minMs is the floor the UI uses to keep
// the opponent from answering instantly (see game.js).
// ---------------------------------------------------------------------------
export const LEVELS = [
  { lv: 1,  name: '入門 Novice',        maxDepth: 1, qDepth: 2, blunder: 0.40,  jitter: 0.55,  timeMs: 250,  minMs: 320, ttBits: 15 },
  { lv: 2,  name: '初學 Beginner',      maxDepth: 1, qDepth: 2, blunder: 0.30,  jitter: 0.40,  timeMs: 400,  minMs: 320, ttBits: 15 },
  { lv: 3,  name: '業餘 Amateur',       maxDepth: 2, qDepth: 2, blunder: 0.22,  jitter: 0.28,  timeMs: 600,  minMs: 320, ttBits: 15 },
  { lv: 4,  name: '熟手 Intermediate',  maxDepth: 2, qDepth: 2, blunder: 0.15,  jitter: 0.20,  timeMs: 800,  minMs: 450, ttBits: 15 },
  { lv: 5,  name: '好手 Skilled',       maxDepth: 3, qDepth: 4, blunder: 0.10,  jitter: 0.14,  timeMs: 1100, minMs: 450, ttBits: 17 },
  { lv: 6,  name: '高手 Advanced',      maxDepth: 3, qDepth: 4, blunder: 0.06,  jitter: 0.09,  timeMs: 1400, minMs: 450, ttBits: 17 },
  { lv: 7,  name: '名家 Expert',        maxDepth: 4, qDepth: 4, blunder: 0.03,  jitter: 0.05,  timeMs: 1800, minMs: 600, ttBits: 17 },
  { lv: 8,  name: '大師 Master',        maxDepth: 4, qDepth: 6, blunder: 0.015, jitter: 0.03,  timeMs: 2400, minMs: 600, ttBits: 17 },
  { lv: 9,  name: '特級大師 Grandmaster', maxDepth: 5, qDepth: 6, blunder: 0.005, jitter: 0.015, timeMs: 3200, minMs: 600, ttBits: 17 },
  { lv: 10, name: '棋聖 Chess Sage',    maxDepth: 6, qDepth: 6, blunder: 0.0,   jitter: 0.005, timeMs: 4500, minMs: 600, ttBits: 17 }
];

export function levelConfig(lv) {
  return LEVELS[Math.max(1, Math.min(10, lv | 0)) - 1];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MATE = 30000;
const MATE_LIMIT = MATE - 200;
const INF = 1000000;
const MAX_PLY = 64;
const MAX_MOVES = 192;
const TIMEOUT = { timeout: true };

const EXACT = 1;
const LOWER = 2;
const UPPER = 3;

const TYPE_SLOT = { K: 0, A: 1, E: 2, H: 3, R: 4, C: 5, P: 6 };

// ---------------------------------------------------------------------------
// Zobrist keys (two 32-bit halves — no BigInt allocation in the hot loop)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const Z_HI = new Uint32Array(14 * 90);
const Z_LO = new Uint32Array(14 * 90);
const SIDE_KEY = { r: { hi: 0, lo: 0 }, b: { hi: 0, lo: 0 } };
// XORing both side keys flips the side-to-move bit without knowing which side moved.
let SIDE_TOGGLE_HI = 0;
let SIDE_TOGGLE_LO = 0;
{
  const rnd = mulberry32(0x9e3779b9);
  for (let i = 0; i < Z_HI.length; i++) {
    Z_HI[i] = rnd();
    Z_LO[i] = rnd();
  }
  SIDE_KEY.r.hi = rnd() | 0;
  SIDE_KEY.r.lo = rnd() | 0;
  SIDE_KEY.b.hi = rnd() | 0;
  SIDE_KEY.b.lo = rnd() | 0;
  SIDE_TOGGLE_HI = (SIDE_KEY.r.hi ^ SIDE_KEY.b.hi) | 0;
  SIDE_TOGGLE_LO = (SIDE_KEY.r.lo ^ SIDE_KEY.b.lo) | 0;
}

const slotOf = (side, type) => (side === RED ? 0 : 7) + TYPE_SLOT[type];

/** Piece-placement hash only. The side-to-move key must be XORed in by the caller. */
export function zobristHash(board) {
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (!p) continue;
    const k = slotOf(p.side, p.type) * 90 + i;
    hi = (hi ^ Z_HI[k]) | 0;
    lo = (lo ^ Z_LO[k]) | 0;
  }
  return { hi, lo };
}

// ---------------------------------------------------------------------------
// Search state (module-level: one search at a time per worker)
// ---------------------------------------------------------------------------
let nodes = 0;
let deadline = 0;
let qDepth = 2;
let jitterAmount = 0;
let hashHi = 0;
let hashLo = 0;
const kings = { r: 4, b: 85 };

// Per-ply move pools. Reusing slot objects means the search allocates nothing
// per node; MAX_PLY entries are plenty for depth + quiescence combined.
function createMoveSlot() {
  return {
    fromX: 0, fromY: 0, toX: 0, toY: 0,
    piece: '', captured: null, capture: false,
    _from: 0, _to: 0, _slot: 0, _capSlot: -1, score: 0
  };
}

const movePool = [];
for (let p = 0; p <= MAX_PLY + 2; p++) {
  const list = new Array(MAX_MOVES);
  for (let i = 0; i < MAX_MOVES; i++) list[i] = createMoveSlot();
  movePool.push(list);
}

const killerFrom = new Int32Array(MAX_PLY * 2).fill(-1);
const killerTo = new Int32Array(MAX_PLY * 2).fill(-1);
const history = new Int32Array(2 * 90 * 90);

// ---------------------------------------------------------------------------
// Transposition table (typed arrays, generation-based ageing)
// ---------------------------------------------------------------------------
let ttBits = 0;
let ttMask = 0;
let ttKeyHi = null;
let ttKeyLo = null;
let ttScore = null;
let ttMove = null;
let ttDepth = null;
let ttFlag = null;
let ttGen = null;
let ttAge = 1;
let probeScore = 0;
let probeMove = -1;

function ttResize(bits) {
  if (bits === ttBits) return;
  ttBits = bits;
  ttMask = (1 << bits) - 1;
  const n = 1 << bits;
  ttKeyHi = new Int32Array(n);
  ttKeyLo = new Int32Array(n);
  ttScore = new Int32Array(n);
  ttMove = new Int32Array(n);
  ttDepth = new Int8Array(n);
  ttFlag = new Uint8Array(n);
  ttGen = new Uint8Array(n);
  ttAge = 1;
}

function ttClear() {
  if (!ttFlag) return;
  ttFlag.fill(0);
  ttGen.fill(0);
  ttAge = 1;
}

/** 0 = miss, 1 = best-move hint only, 2 = cutoff (probeScore is valid). */
function ttProbe(depth, alpha, beta, ply) {
  const i = hashLo & ttMask;
  if (ttFlag[i] === 0) return 0;
  if (ttKeyHi[i] !== hashHi || ttKeyLo[i] !== hashLo) return 0;
  probeMove = ttMove[i];
  if (ttDepth[i] < depth) return 1;

  let s = ttScore[i];
  if (s > MATE_LIMIT) s -= ply;
  else if (s < -MATE_LIMIT) s += ply;

  const f = ttFlag[i];
  if (f === EXACT) { probeScore = s; return 2; }
  if (f === LOWER && s >= beta) { probeScore = s; return 2; }
  if (f === UPPER && s <= alpha) { probeScore = s; return 2; }
  return 1;
}

function ttStore(depth, score, moveCode, flag, ply) {
  const i = hashLo & ttMask;
  if (ttGen[i] === ttAge && ttDepth[i] > depth) return;
  let s = score;
  if (s > MATE_LIMIT) s += ply;
  else if (s < -MATE_LIMIT) s -= ply;
  ttKeyHi[i] = hashHi;
  ttKeyLo[i] = hashLo;
  ttScore[i] = s;
  ttMove[i] = moveCode;
  ttDepth[i] = depth;
  ttFlag[i] = flag;
  ttGen[i] = ttAge;
}

function hashAfterMove(mv) {
  const f = mv._slot * 90 + mv._from;
  const t = mv._slot * 90 + mv._to;
  hashHi = (hashHi ^ Z_HI[f] ^ Z_HI[t]) | 0;
  hashLo = (hashLo ^ Z_LO[f] ^ Z_LO[t]) | 0;
  if (mv._capSlot >= 0) {
    const c = mv._capSlot * 90 + mv._to;
    hashHi = (hashHi ^ Z_HI[c]) | 0;
    hashLo = (hashLo ^ Z_LO[c]) | 0;
  }
  hashHi = (hashHi ^ SIDE_TOGGLE_HI) | 0;
  hashLo = (hashLo ^ SIDE_TOGGLE_LO) | 0;
}

// ---------------------------------------------------------------------------
// Move generation: pseudo-legal, then filtered by make/unmake + king safety.
// isKingAttackedAt() also covers the flying-general rule, so a separate
// kingsFacing() test is unnecessary here.
// ---------------------------------------------------------------------------
function genMoves(ply, board, side, kingSq) {
  const pool = movePool[ply];
  const base = side === RED ? 0 : 7;
  let n = 0;

  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (!p || p.side !== side) continue;
    const x = i % FILES;
    const y = (i / FILES) | 0;
    const pseudo = pieceMoves(board, x, y);
    const slot = base + TYPE_SLOT[p.type];

    for (let k = 0; k < pseudo.length; k++) {
      const m = pseudo[k];
      const to = m.toY * FILES + m.toX;
      const cap = board[to];

      const undo = makeMove(board, x, y, m.toX, m.toY);
      const kSq = p.type === KING ? to : kingSq;
      const attacked = isKingAttackedAt(board, kSq % FILES, (kSq / FILES) | 0, side);
      unmakeMove(board, undo);
      if (attacked) continue;

      if (n >= MAX_MOVES) break;
      const mv = pool[n++];
      mv.fromX = x;
      mv.fromY = y;
      mv.toX = m.toX;
      mv.toY = m.toY;
      mv.piece = p.type;
      mv.capture = !!cap;
      mv.captured = cap ? cap.type : null;
      mv._from = i;
      mv._to = to;
      mv._slot = slot;
      mv._capSlot = cap ? slotOf(opposite(side), cap.type) : -1;
      mv.score = 0;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Move ordering: TT move > captures (MVV-LVA) > killers > history
// ---------------------------------------------------------------------------
function scoreMove(mv, ttMoveCode, ply, side) {
  const code = mv._from * 90 + mv._to;
  if (ttMoveCode >= 0 && code === ttMoveCode) { mv.score = 100000000; return; }
  if (mv.capture) {
    mv.score = 10000000 + (PIECE_VALUE[mv.captured] || 0) * 10 - (PIECE_VALUE[mv.piece] || 0);
    return;
  }
  const ki = ply * 2;
  if (killerFrom[ki] === mv._from && killerTo[ki] === mv._to) { mv.score = 500000; return; }
  if (killerFrom[ki + 1] === mv._from && killerTo[ki + 1] === mv._to) { mv.score = 490000; return; }
  mv.score = history[(side === RED ? 0 : 8100) + code];
}

/** Selection sort step: move the best remaining slot to `start` and return it. */
function pickBest(pool, start, n) {
  let bi = start;
  let bs = pool[start].score;
  for (let i = start + 1; i < n; i++) {
    if (pool[i].score > bs) { bs = pool[i].score; bi = i; }
  }
  if (bi !== start) {
    const tmp = pool[start];
    pool[start] = pool[bi];
    pool[bi] = tmp;
  }
  return pool[start];
}

// ---------------------------------------------------------------------------
// Quiescence: search captures (and forced check evasions) until the position is
// quiet, so the evaluation at a leaf is not skewed by an unfinished exchange.
// ---------------------------------------------------------------------------
function quiesce(board, side, alpha, beta, ply, qd) {
  nodes++;
  if ((nodes & 511) === 0 && Date.now() > deadline) throw TIMEOUT;
  if (ply >= MAX_PLY - 2) return evaluate(board, side);

  const kSq = kings[side];
  const inCheck = isKingAttackedAt(board, kSq % FILES, (kSq / FILES) | 0, side);

  let stand = 0;
  if (!inCheck) {
    stand = evaluate(board, side);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd <= 0) return alpha;
  } else if (qd <= 0) {
    // Out of budget while in check: fall back to the static score.
    return evaluate(board, side);
  }

  const n = genMoves(ply, board, side, kSq);
  if (n === 0) return -MATE + ply;

  const pool = movePool[ply];
  for (let i = 0; i < n; i++) {
    const mv = pool[i];
    mv.score = mv.capture
      ? 10000000 + (PIECE_VALUE[mv.captured] || 0) * 10 - (PIECE_VALUE[mv.piece] || 0)
      : 0;
  }

  let best = inCheck ? -INF : alpha;
  for (let i = 0; i < n; i++) {
    const mv = pickBest(pool, i, n);
    if (!inCheck) {
      if (!mv.capture) continue;
      // Delta pruning: even winning this piece leaves us far below alpha.
      if (stand + (PIECE_VALUE[mv.captured] || 0) + 200 < alpha) continue;
    }

    const undo = makeMove(board, mv.fromX, mv.fromY, mv.toX, mv.toY);
    const savedKing = kings[side];
    if (mv.piece === KING) kings[side] = mv._to;
    const savedHi = hashHi;
    const savedLo = hashLo;
    hashAfterMove(mv);

    const score = -quiesce(board, opposite(side), -beta, -alpha, ply + 1, qd - 1);

    hashHi = savedHi;
    hashLo = savedLo;
    kings[side] = savedKing;
    unmakeMove(board, undo);

    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Negamax with alpha-beta, TT cutoffs and killer/history updates
// ---------------------------------------------------------------------------
function negamax(board, side, depth, alpha, beta, ply) {
  nodes++;
  if ((nodes & 511) === 0 && Date.now() > deadline) throw TIMEOUT;
  if (ply >= MAX_PLY - 2) return evaluate(board, side);

  if (depth <= 0) return quiesce(board, side, alpha, beta, ply, qDepth);

  const alphaOrig = alpha;
  const hit = ttProbe(depth, alpha, beta, ply);
  if (hit === 2) return probeScore;
  const ttMoveCode = hit === 1 ? probeMove : -1;

  const n = genMoves(ply, board, side, kings[side]);
  if (n === 0) return -MATE + ply;

  const pool = movePool[ply];
  for (let i = 0; i < n; i++) scoreMove(pool[i], ttMoveCode, ply, side);

  let best = -INF;
  let bestCode = 0;

  for (let i = 0; i < n; i++) {
    const mv = pickBest(pool, i, n);

    const undo = makeMove(board, mv.fromX, mv.fromY, mv.toX, mv.toY);
    const savedKing = kings[side];
    if (mv.piece === KING) kings[side] = mv._to;
    const savedHi = hashHi;
    const savedLo = hashLo;
    hashAfterMove(mv);

    const score = -negamax(board, opposite(side), depth - 1, -beta, -alpha, ply + 1);

    hashHi = savedHi;
    hashLo = savedLo;
    kings[side] = savedKing;
    unmakeMove(board, undo);

    if (score > best) {
      best = score;
      bestCode = mv._from * 90 + mv._to;
    }
    if (score > alpha) alpha = score;

    if (alpha >= beta) {
      if (!mv.capture) {
        const ki = ply * 2;
        if (killerFrom[ki] !== mv._from || killerTo[ki] !== mv._to) {
          killerFrom[ki + 1] = killerFrom[ki];
          killerTo[ki + 1] = killerTo[ki];
          killerFrom[ki] = mv._from;
          killerTo[ki] = mv._to;
        }
        const hIdx = (side === RED ? 0 : 8100) + mv._from * 90 + mv._to;
        const bump = depth * depth;
        history[hIdx] = Math.min(history[hIdx] + bump, 800000);
      }
      break;
    }
  }

  const flag = best <= alphaOrig ? UPPER : (best >= beta ? LOWER : EXACT);
  ttStore(depth, best, bestCode, flag, ply);
  return best;
}

// ---------------------------------------------------------------------------
// Root search (one depth). Returns a cloned move plus the true score.
// ---------------------------------------------------------------------------
let rootTtMove = -1;

function rootSearch(board, side, depth, alpha, beta) {
  const n = genMoves(0, board, side, kings[side]);
  if (n === 0) return null;

  const pool = movePool[0];
  for (let i = 0; i < n; i++) scoreMove(pool[i], rootTtMove, 0, side);

  // Moves are searched with a window whose lower bound trails the running best by
  // `band`. Anything inside the band therefore gets an *exact* score, so the jitter
  // below can only ever choose between near-equal moves — never a fail-low move
  // whose score was merely clamped up to alpha.
  const band = jitterAmount;
  let bestTrue = -INF;
  let bestNoisy = -INF;
  let bestMove = null;

  for (let i = 0; i < n; i++) {
    const mv = pickBest(pool, i, n);
    const window = bestMove ? Math.max(alpha, bestTrue - band) : alpha;

    const undo = makeMove(board, mv.fromX, mv.fromY, mv.toX, mv.toY);
    const savedKing = kings[side];
    if (mv.piece === KING) kings[side] = mv._to;
    const savedHi = hashHi;
    const savedLo = hashLo;
    hashAfterMove(mv);

    const score = -negamax(board, opposite(side), depth - 1, -beta, -window, 1);

    hashHi = savedHi;
    hashLo = savedLo;
    kings[side] = savedKing;
    unmakeMove(board, undo);

    // `score > window` means the child did not fail low, so the score is exact.
    if (score > window) {
      if (score > bestTrue) bestTrue = score;
      const noisy = score + (Math.random() - 0.5) * band;
      if (noisy > bestNoisy) {
        bestNoisy = noisy;
        bestMove = {
          fromX: mv.fromX, fromY: mv.fromY, toX: mv.toX, toY: mv.toY,
          piece: mv.piece, capture: mv.capture, captured: mv.captured
        };
      }
    }
    if (score > alpha) alpha = score;
  }

  return { move: bestMove, score: bestTrue };
}

// ---------------------------------------------------------------------------
// Iterative deepening driver
// ---------------------------------------------------------------------------
function search(sourceBoard, side, cfg) {
  // Search on our own copy: the caller's board (which may be the live game board
  // on the main-thread fallback) is never mutated.
  const board = sourceBoard.slice();

  nodes = 0;
  deadline = Date.now() + cfg.timeMs;
  qDepth = cfg.qDepth;
  jitterAmount = cfg.jitter * 60;
  ttResize(cfg.ttBits);

  // New generation: old entries remain readable but lose replacement priority.
  ttAge = (ttAge + 1) & 0xff;
  if (ttAge === 0) ttAge = 1;
  killerFrom.fill(-1);
  killerTo.fill(-1);
  history.fill(0);

  kings[RED] = findKing(board, RED);
  kings[BLACK] = findKing(board, BLACK);
  const h = zobristHash(board);
  hashHi = (h.hi ^ SIDE_KEY[side].hi) | 0;
  hashLo = (h.lo ^ SIDE_KEY[side].lo) | 0;

  if (genMoves(0, board, side, kings[side]) === 0) return null;

  const started = Date.now();
  rootTtMove = -1;
  let best = null;
  let completedDepth = 0;
  let timedOut = false;

  for (let d = 1; d <= cfg.maxDepth; d++) {
    let alpha = -INF;
    let beta = INF;
    if (d > 1 && best) {
      // Aspiration window around the previous score.
      alpha = best.score - 60;
      beta = best.score + 60;
    }

    let res = null;
    let settled = false;
    for (let attempt = 0; attempt < 3 && !settled; attempt++) {
      try {
        res = rootSearch(board, side, d, alpha, beta);
      } catch (e) {
        if (e !== TIMEOUT) throw e;
        timedOut = true;
        break;
      }
      if (!res) { settled = true; break; }
      if (res.score <= alpha || res.score >= beta) {
        // Window failed — retry with a full window.
        alpha = -INF;
        beta = INF;
        continue;
      }
      settled = true;
    }
    if (timedOut) break;
    if (!res || !res.move) break;

    best = res;
    completedDepth = d;
    rootTtMove = (best.move.fromY * FILES + best.move.fromX) * 90
      + (best.move.toY * FILES + best.move.toX);

    if (Math.abs(best.score) > MATE_LIMIT) break;      // forced mate found
    if ((Date.now() - started) * 3 > cfg.timeMs) break; // next depth won't fit
  }

  if (timedOut) {
    // The aborted search left moves un-unmade: restore our working copy.
    for (let i = 0; i < 90; i++) board[i] = sourceBoard[i];
    kings[RED] = findKing(board, RED);
    kings[BLACK] = findKing(board, BLACK);
  }

  // Every depth timed out before finishing: play the first legal move.
  if (!best) {
    const n = genMoves(0, board, side, kings[side]);
    if (n === 0) return null;
    const mv = movePool[0][0];
    return {
      move: {
        fromX: mv.fromX, fromY: mv.fromY, toX: mv.toX, toY: mv.toY,
        piece: mv.piece, capture: mv.capture, captured: mv.captured
      },
      score: -INF, depth: 0, nodes, blunder: false
    };
  }

  // Deliberate mistakes at the low levels: ignore the search and pick at random.
  if (cfg.blunder > 0 && Math.random() < cfg.blunder) {
    const n = genMoves(0, board, side, kings[side]);
    if (n > 0) {
      const mv = movePool[0][(Math.random() * n) | 0];
      return {
        move: {
          fromX: mv.fromX, fromY: mv.fromY, toX: mv.toX, toY: mv.toY,
          piece: mv.piece, capture: mv.capture, captured: mv.captured
        },
        score: best.score, depth: completedDepth, nodes, blunder: true
      };
    }
  }

  return { move: best.move, score: best.score, depth: completedDepth, nodes, blunder: false };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/** Full search result: { move, score, depth, nodes, blunder }. */
export function searchPosition(board, side, level) {
  return search(board, side, levelConfig(level));
}

/** Choose a move for `side` at difficulty `level` (1-10). */
export function chooseMove(board, side, level) {
  const res = search(board, side, levelConfig(level));
  return res ? res.move : null;
}

/** Hint: run a low-blunder search regardless of level to suggest a strong move. */
export function suggestHint(board, side) {
  const res = search(board, side, {
    maxDepth: 4, qDepth: 4, blunder: 0, jitter: 0.005, timeMs: 2500, ttBits: 16
  });
  return res ? res.move : null;
}

/** Wipe TT / killer / history state (used by tests to get deterministic searches). */
export function resetSearchState() {
  ttClear();
  killerFrom.fill(-1);
  killerTo.fill(-1);
  history.fill(0);
}

// ---------------------------------------------------------------------------
// Test helper: replays a random walk using the *same* incremental hash the search
// uses and compares it against a full recompute after every ply.
// Returns the number of mismatches (0 means the Zobrist path is sound).
// ---------------------------------------------------------------------------
export function debugVerifyZobrist(board, side, plies = 60) {
  const work = board.slice();
  const base = zobristHash(work);
  hashHi = (base.hi ^ SIDE_KEY[side].hi) | 0;
  hashLo = (base.lo ^ SIDE_KEY[side].lo) | 0;

  let mover = side;
  let mismatches = 0;

  // Walk forward without unmaking: the point is to prove the *incremental* hash
  // stays in sync with a full recompute, ply after ply, for both sides.
  for (let step = 0; step < plies; step++) {
    const n = genMoves(0, work, mover, findKing(work, mover));
    if (n === 0) break;
    const mv = movePool[0][(Math.random() * n) | 0];

    makeMove(work, mv.fromX, mv.fromY, mv.toX, mv.toY);
    hashAfterMove(mv);

    const full = zobristHash(work);
    const nextSide = opposite(mover);
    const expectHi = (full.hi ^ SIDE_KEY[nextSide].hi) | 0;
    const expectLo = (full.lo ^ SIDE_KEY[nextSide].lo) | 0;
    if (hashHi !== expectHi || hashLo !== expectLo) mismatches++;

    mover = nextSide;
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// Web Worker message interface
// ---------------------------------------------------------------------------
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
  self.onmessage = (ev) => {
    const msg = ev.data || {};
    try {
      if (msg.type === 'move') {
        const board = msg.boardEnc ? decodeBoard(msg.boardEnc) : initialBoard();
        const side = msg.side === BLACK ? BLACK : RED;
        const t0 = Date.now();
        const res = searchPosition(board, side, msg.level || 3);
        self.postMessage({
          type: 'move',
          reqId: msg.reqId,
          move: res ? res.move : null,
          elapsed: Date.now() - t0,
          depth: res ? res.depth : 0,
          nodes: res ? res.nodes : 0,
          score: res ? res.score : 0
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
