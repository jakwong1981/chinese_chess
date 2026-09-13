// Xiangqi (Chinese Chess) rules engine.
// Shared by browser client and Node server so both sides validate against identical semantics.
// Board is a flat array of 90 cells (index = y * 9 + x). Red occupies y=0..4 at start, Black y=5..9.

export const RED = 'r';
export const BLACK = 'b';
export const FILES = 9;
export const RANKS = 10;

export const KING = 'K';
export const ADVISOR = 'A';
export const ELEPHANT = 'E';
export const HORSE = 'H';
export const ROOK = 'R';
export const CANNON = 'C';
export const PAWN = 'P';

export const GLYPHS = {
  r: { K: '帥', A: '仕', E: '相', H: '傌', R: '俥', C: '炮', P: '兵' },
  b: { K: '將', A: '士', E: '象', H: '馬', R: '車', C: '砲', P: '卒' }
};

export const PIECE_VALUE = { K: 10000, R: 900, H: 400, C: 450, A: 200, E: 200, P: 100 };

export const idx = (x, y) => y * FILES + x;
export const xy = (i) => [i % FILES, (i / FILES) | 0];
export const inBoard = (x, y) => x >= 0 && x < FILES && y >= 0 && y < RANKS;
export const opposite = (s) => (s === RED ? BLACK : RED);

export function inPalace(side, x, y) {
  if (x < 3 || x > 5) return false;
  return side === RED ? y >= 0 && y <= 2 : y >= 7 && y <= 9;
}

export function hasCrossedRiver(side, y) {
  return side === RED ? y >= 5 : y <= 4;
}

// Standard opening position.
export function initialBoard() {
  const b = new Array(FILES * RANKS).fill(null);
  let id = 1;
  const put = (x, y, side, type) => { b[idx(x, y)] = { side, type, id: id++ }; };
  put(0, 9, BLACK, ROOK); put(1, 9, BLACK, HORSE); put(2, 9, BLACK, ELEPHANT); put(3, 9, BLACK, ADVISOR);
  put(4, 9, BLACK, KING);   put(5, 9, BLACK, ADVISOR); put(6, 9, BLACK, ELEPHANT); put(7, 9, BLACK, HORSE); put(8, 9, BLACK, ROOK);
  put(1, 7, BLACK, CANNON); put(7, 7, BLACK, CANNON);
  for (let x = 0; x <= 8; x += 2) put(x, 6, BLACK, PAWN);
  put(0, 0, RED, ROOK); put(1, 0, RED, HORSE); put(2, 0, RED, ELEPHANT); put(3, 0, RED, ADVISOR);
  put(4, 0, RED, KING);   put(5, 0, RED, ADVISOR); put(6, 0, RED, ELEPHANT); put(7, 0, RED, HORSE); put(8, 0, RED, ROOK);
  put(1, 2, RED, CANNON); put(7, 2, RED, CANNON);
  for (let x = 0; x <= 8; x += 2) put(x, 3, RED, PAWN);
  return b;
}

export function cloneBoard(b) { return b.map(p => (p ? { ...p } : null)); }

// Board serialisation for network transport.
export function encodeBoard(b) {
  return b.map(p => (p ? `${p.side}${p.type}` : '--')).join('');
}
export function decodeBoard(s) {
  const out = new Array(FILES * RANKS).fill(null);
  let id = 1;
  for (let i = 0; i < out.length; i++) {
    const tok = s.substr(i * 2, 2);
    if (tok === '--') continue;
    out[i] = { side: tok[0], type: tok[1], id: id++ };
  }
  return out;
}

// Pseudo-legal moves from (x,y). Does not check for self-check or flying-general.
export function pieceMoves(board, x, y) {
  const p = board[idx(x, y)];
  if (!p) return [];
  const moves = [];
  const push = (nx, ny) => {
    if (!inBoard(nx, ny)) return false;
    const t = board[idx(nx, ny)];
    if (!t) { moves.push({ toX: nx, toY: ny, capture: false }); return true; }
    if (t.side !== p.side) { moves.push({ toX: nx, toY: ny, capture: true }); return false; }
    return false;
  };
  const ray = (dx, dy) => {
    let nx = x + dx, ny = y + dy;
    while (inBoard(nx, ny)) {
      if (!push(nx, ny)) break;
      const t = board[idx(nx, ny)];
      if (t) break;
      nx += dx; ny += dy;
    }
  };
  switch (p.type) {
    case KING: {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (inPalace(p.side, nx, ny)) push(nx, ny);
      }
      break;
    }
    case ADVISOR: {
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (inPalace(p.side, nx, ny)) push(nx, ny);
      }
      break;
    }
    case ELEPHANT: {
      for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
        const nx = x + dx, ny = y + dy;
        if (!inBoard(nx, ny)) continue;
        if (p.side === RED && ny > 4) continue;
        if (p.side === BLACK && ny < 5) continue;
        if (board[idx(x + dx / 2, y + dy / 2)]) continue; // blocked elephant eye
        push(nx, ny);
      }
      break;
    }
    case HORSE: {
      const jumps = [
        [1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1],
        [2, 1, 1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [-2, -1, -1, 0]
      ];
      for (const [dx, dy, lx, ly] of jumps) {
        const nx = x + dx, ny = y + dy;
        if (!inBoard(nx, ny)) continue;
        if (board[idx(x + lx, y + ly)]) continue; // blocked horse leg
        push(nx, ny);
      }
      break;
    }
    case ROOK:
      ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1);
      break;
    case CANNON: {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let nx = x + dx, ny = y + dy, jumped = false;
        while (inBoard(nx, ny)) {
          const t = board[idx(nx, ny)];
          if (!jumped) {
            if (!t) moves.push({ toX: nx, toY: ny, capture: false });
            else jumped = true;
          } else if (t) {
            if (t.side !== p.side) moves.push({ toX: nx, toY: ny, capture: true });
            break;
          }
          nx += dx; ny += dy;
        }
      }
      break;
    }
    case PAWN: {
      const fwd = p.side === RED ? 1 : -1;
      push(x, y + fwd);
      if (hasCrossedRiver(p.side, y)) { push(x + 1, y); push(x - 1, y); }
      break;
    }
  }
  return moves;
}

export function findKing(board, side) {
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p && p.side === side && p.type === KING) return i;
  }
  return -1;
}

export function isSquareAttacked(board, x, y, bySide) {
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (!p || p.side !== bySide) continue;
    const [px, py] = xy(i);
    const ms = pieceMoves(board, px, py);
    for (const m of ms) if (m.toX === x && m.toY === y) return true;
  }
  return false;
}

// Flying-general: kings on same file with no piece between are considered attacking each other.
export function kingsFacing(board) {
  const rk = findKing(board, RED);
  const bk = findKing(board, BLACK);
  if (rk < 0 || bk < 0) return false;
  const [rx, ry] = xy(rk);
  const [bx, by] = xy(bk);
  if (rx !== bx) return false;
  const lo = Math.min(ry, by) + 1, hi = Math.max(ry, by);
  for (let y = lo; y < hi; y++) if (board[idx(rx, y)]) return false;
  return true;
}

export function isInCheck(board, side) {
  const k = findKing(board, side);
  if (k < 0) return true;
  const [kx, ky] = xy(k);
  return isSquareAttacked(board, kx, ky, opposite(side));
}

export function applyMove(board, mv) {
  const nb = board.slice();
  const from = idx(mv.fromX, mv.fromY);
  const to = idx(mv.toX, mv.toY);
  nb[to] = nb[from];
  nb[from] = null;
  return nb;
}

export function legalMoves(board, side) {
  const out = [];
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (!p || p.side !== side) continue;
    const [x, y] = xy(i);
    for (const m of pieceMoves(board, x, y)) {
      const nb = applyMove(board, { fromX: x, fromY: y, toX: m.toX, toY: m.toY });
      if (isInCheck(nb, side)) continue;
      if (kingsFacing(nb)) continue;
      out.push({
        fromX: x, fromY: y, toX: m.toX, toY: m.toY,
        piece: p.type, capture: m.capture,
        captured: board[idx(m.toX, m.toY)] ? board[idx(m.toX, m.toY)].type : null
      });
    }
  }
  return out;
}

export function isLegalMove(board, side, mv) {
  if (!inBoard(mv.fromX, mv.fromY) || !inBoard(mv.toX, mv.toY)) return false;
  const p = board[idx(mv.fromX, mv.fromY)];
  if (!p || p.side !== side) return false;
  const t = board[idx(mv.toX, mv.toY)];
  if (t && t.side === side) return false;
  const ms = pieceMoves(board, mv.fromX, mv.fromY);
  if (!ms.some(m => m.toX === mv.toX && m.toY === mv.toY)) return false;
  const nb = applyMove(board, mv);
  if (isInCheck(nb, side)) return false;
  if (kingsFacing(nb)) return false;
  return true;
}

export function gameStatus(board, sideToMove) {
  const moves = legalMoves(board, sideToMove);
  const inCheck = isInCheck(board, sideToMove);
  if (moves.length === 0) {
    return {
      over: true,
      reason: inCheck ? 'checkmate' : 'stalemate',
      winner: opposite(sideToMove),
      inCheck
    };
  }
  return { over: false, inCheck, moves: moves.length };
}

// Piece-square tables (from Red's perspective; flipped for Black).
// Values are heuristic bonuses added on top of material.
const PST = {
  P: [
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0,
    10, 10, 12, 14, 14, 14, 12, 10, 10,
    18, 20, 24, 28, 30, 28, 24, 20, 18,
    22, 26, 30, 36, 40, 36, 30, 26, 22,
    20, 24, 28, 32, 34, 32, 28, 24, 20,
    0, 0, 0, 0, 0, 0, 0, 0, 0
  ],
  H: [
    -20, -10, 0, 0, 0, 0, 0, -10, -20,
    -10, 4, 8, 10, 12, 10, 8, 4, -10,
    0, 8, 14, 16, 16, 16, 14, 8, 0,
    0, 10, 16, 20, 22, 20, 16, 10, 0,
    0, 12, 18, 22, 24, 22, 18, 12, 0,
    0, 12, 18, 22, 24, 22, 18, 12, 0,
    0, 10, 16, 20, 22, 20, 16, 10, 0,
    0, 8, 14, 16, 16, 16, 14, 8, 0,
    -10, 4, 8, 10, 12, 10, 8, 4, -10,
    -20, -10, 0, 0, 0, 0, 0, -10, -20
  ],
  R: [
    12, 14, 12, 18, 18, 18, 12, 14, 12,
    12, 16, 14, 20, 20, 20, 14, 16, 12,
    10, 14, 12, 18, 18, 18, 12, 14, 10,
    8, 12, 10, 16, 16, 16, 10, 12, 8,
    6, 10, 8, 14, 14, 14, 8, 10, 6,
    6, 10, 8, 14, 14, 14, 8, 10, 6,
    8, 12, 10, 16, 16, 16, 10, 12, 8,
    10, 14, 12, 18, 18, 18, 12, 14, 10,
    12, 16, 14, 20, 20, 20, 14, 16, 12,
    12, 14, 12, 18, 18, 18, 12, 14, 12
  ],
  C: [
    0, 0, 2, 0, 4, 0, 2, 0, 0,
    0, 2, 0, 4, 6, 4, 0, 2, 0,
    2, 2, 4, 6, 8, 6, 4, 2, 2,
    0, 2, 4, 6, 8, 6, 4, 2, 0,
    0, 0, 2, 4, 6, 4, 2, 0, 0,
    0, 0, 2, 4, 6, 4, 2, 0, 0,
    0, 2, 4, 6, 8, 6, 4, 2, 0,
    2, 2, 4, 6, 8, 6, 4, 2, 2,
    0, 2, 0, 4, 6, 4, 0, 2, 0,
    0, 0, 2, 0, 4, 0, 2, 0, 0
  ]
};

function pstValue(type, side, x, y) {
  const table = PST[type];
  if (!table) return 0;
  const yy = side === RED ? y : 9 - y;
  return table[yy * FILES + x] || 0;
}

export function evaluate(board, sideToMove) {
  let score = 0;
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (!p) continue;
    const [x, y] = xy(i);
    const v = (PIECE_VALUE[p.type] || 0) + pstValue(p.type, p.side, x, y);
    score += p.side === RED ? v : -v;
  }
  return sideToMove === RED ? score : -score;
}

export function moveToNotation(board, mv) {
  const p = board[idx(mv.fromX, mv.fromY)];
  if (!p) return '??';
  const g = GLYPHS[p.side][p.type];
  return `${g} ${mv.fromX}${mv.fromY}→${mv.toX}${mv.toY}`;
}
