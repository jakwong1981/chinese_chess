package com.xiangqi.rules;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Xiangqi (Chinese Chess) rules engine.
 * 1:1 port of shared/rules.js so the Java backend validates against semantics
 * identical to the browser client and the Node mock backend.
 *
 * Board is a flat array of 90 cells (index = y * 9 + x).
 * Red occupies y=0..4 at start, Black y=5..9.
 */
public final class XiangqiRules {

    public static final char RED = 'r';
    public static final char BLACK = 'b';
    public static final int FILES = 9;
    public static final int RANKS = 10;
    public static final int CELLS = FILES * RANKS;

    public static final char KING = 'K';
    public static final char ADVISOR = 'A';
    public static final char ELEPHANT = 'E';
    public static final char HORSE = 'H';
    public static final char ROOK = 'R';
    public static final char CANNON = 'C';
    public static final char PAWN = 'P';

    private static final Map<Character, String> GLYPHS_R = Map.of(
            'K', "帥", 'A', "仕", 'E', "相", 'H', "傌", 'R', "俥", 'C', "炮", 'P', "兵");
    private static final Map<Character, String> GLYPHS_B = Map.of(
            'K', "將", 'A', "士", 'E', "象", 'H', "馬", 'R', "車", 'C', "砲", 'P', "卒");

    private XiangqiRules() {}

    public static int idx(int x, int y) { return y * FILES + x; }

    public static int[] xy(int i) { return new int[] { i % FILES, i / FILES }; }

    public static boolean inBoard(int x, int y) {
        return x >= 0 && x < FILES && y >= 0 && y < RANKS;
    }

    public static char opposite(char s) { return s == RED ? BLACK : RED; }

    public static boolean inPalace(char side, int x, int y) {
        if (x < 3 || x > 5) return false;
        return side == RED ? (y >= 0 && y <= 2) : (y >= 7 && y <= 9);
    }

    public static boolean hasCrossedRiver(char side, int y) {
        return side == RED ? y >= 5 : y <= 4;
    }

    /** Standard opening position. */
    public static Piece[] initialBoard() {
        Piece[] b = new Piece[CELLS];
        int[] id = { 1 };
        // Red's back rank / cannons / pawns.
        b[idx(0, 0)] = new Piece(RED, ROOK, id[0]++);
        b[idx(1, 0)] = new Piece(RED, HORSE, id[0]++);
        b[idx(2, 0)] = new Piece(RED, ELEPHANT, id[0]++);
        b[idx(3, 0)] = new Piece(RED, ADVISOR, id[0]++);
        b[idx(4, 0)] = new Piece(RED, KING, id[0]++);
        b[idx(5, 0)] = new Piece(RED, ADVISOR, id[0]++);
        b[idx(6, 0)] = new Piece(RED, ELEPHANT, id[0]++);
        b[idx(7, 0)] = new Piece(RED, HORSE, id[0]++);
        b[idx(8, 0)] = new Piece(RED, ROOK, id[0]++);
        b[idx(1, 2)] = new Piece(RED, CANNON, id[0]++);
        b[idx(7, 2)] = new Piece(RED, CANNON, id[0]++);
        for (int x = 0; x <= 8; x += 2) b[idx(x, 3)] = new Piece(RED, PAWN, id[0]++);
        // Black's back rank / cannons / pawns.
        b[idx(0, 9)] = new Piece(BLACK, ROOK, id[0]++);
        b[idx(1, 9)] = new Piece(BLACK, HORSE, id[0]++);
        b[idx(2, 9)] = new Piece(BLACK, ELEPHANT, id[0]++);
        b[idx(3, 9)] = new Piece(BLACK, ADVISOR, id[0]++);
        b[idx(4, 9)] = new Piece(BLACK, KING, id[0]++);
        b[idx(5, 9)] = new Piece(BLACK, ADVISOR, id[0]++);
        b[idx(6, 9)] = new Piece(BLACK, ELEPHANT, id[0]++);
        b[idx(7, 9)] = new Piece(BLACK, HORSE, id[0]++);
        b[idx(8, 9)] = new Piece(BLACK, ROOK, id[0]++);
        b[idx(1, 7)] = new Piece(BLACK, CANNON, id[0]++);
        b[idx(7, 7)] = new Piece(BLACK, CANNON, id[0]++);
        for (int x = 0; x <= 8; x += 2) b[idx(x, 6)] = new Piece(BLACK, PAWN, id[0]++);
        return b;
    }

    public static Piece[] cloneBoard(Piece[] b) { return b.clone(); }

    /** Board serialisation for network transport (identical to encodeBoard in rules.js). */
    public static String encodeBoard(Piece[] b) {
        StringBuilder sb = new StringBuilder(CELLS * 2);
        for (Piece p : b) {
            if (p == null) sb.append("--");
            else sb.append(p.side()).append(p.type());
        }
        return sb.toString();
    }

    public static Piece[] decodeBoard(String s) {
        Piece[] out = new Piece[CELLS];
        int id = 1;
        for (int i = 0; i < out.length; i++) {
            String tok = s.substring(i * 2, i * 2 + 2);
            if ("--".equals(tok)) continue;
            out[i] = new Piece(tok.charAt(0), tok.charAt(1), id++);
        }
        return out;
    }

    /** Collects moves; push() returns true when a ray may continue past the square. */
    private static final class Collector {
        private final Piece[] board;
        private final Piece p;
        private final List<PieceMove> moves = new ArrayList<>();

        Collector(Piece[] board, Piece p) {
            this.board = board;
            this.p = p;
        }

        boolean push(int nx, int ny) {
            if (!inBoard(nx, ny)) return false;
            Piece t = board[idx(nx, ny)];
            if (t == null) {
                moves.add(new PieceMove(nx, ny, false));
                return true;
            }
            if (t.side() != p.side()) {
                moves.add(new PieceMove(nx, ny, true));
                return false;
            }
            return false;
        }

        void ray(int x, int y, int dx, int dy) {
            int nx = x + dx;
            int ny = y + dy;
            while (inBoard(nx, ny)) {
                if (!push(nx, ny)) break;
                Piece t = board[idx(nx, ny)];
                if (t != null) break;
                nx += dx;
                ny += dy;
            }
        }
    }

    /** Pseudo-legal moves from (x,y). Does not check for self-check or flying-general. */
    public static List<PieceMove> pieceMoves(Piece[] board, int x, int y) {
        Piece p = board[idx(x, y)];
        if (p == null) return List.of();
        Collector c = new Collector(board, p);
        switch (p.type()) {
            case KING -> {
                int[][] dirs = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } };
                for (int[] d : dirs) {
                    int nx = x + d[0], ny = y + d[1];
                    if (inPalace(p.side(), nx, ny)) c.push(nx, ny);
                }
            }
            case ADVISOR -> {
                int[][] dirs = { { 1, 1 }, { 1, -1 }, { -1, 1 }, { -1, -1 } };
                for (int[] d : dirs) {
                    int nx = x + d[0], ny = y + d[1];
                    if (inPalace(p.side(), nx, ny)) c.push(nx, ny);
                }
            }
            case ELEPHANT -> {
                int[][] dirs = { { 2, 2 }, { 2, -2 }, { -2, 2 }, { -2, -2 } };
                for (int[] d : dirs) {
                    int nx = x + d[0], ny = y + d[1];
                    if (!inBoard(nx, ny)) continue;
                    if (p.side() == RED && ny > 4) continue;
                    if (p.side() == BLACK && ny < 5) continue;
                    if (board[idx(x + d[0] / 2, y + d[1] / 2)] != null) continue; // blocked elephant eye
                    c.push(nx, ny);
                }
            }
            case HORSE -> {
                int[][] jumps = {
                    { 1, 2, 0, 1 }, { -1, 2, 0, 1 }, { 1, -2, 0, -1 }, { -1, -2, 0, -1 },
                    { 2, 1, 1, 0 }, { -2, 1, -1, 0 }, { 2, -1, 1, 0 }, { -2, -1, -1, 0 }
                };
                for (int[] j : jumps) {
                    int nx = x + j[0], ny = y + j[1];
                    if (!inBoard(nx, ny)) continue;
                    if (board[idx(x + j[2], y + j[3])] != null) continue; // blocked horse leg
                    c.push(nx, ny);
                }
            }
            case ROOK -> {
                c.ray(x, y, 1, 0);
                c.ray(x, y, -1, 0);
                c.ray(x, y, 0, 1);
                c.ray(x, y, 0, -1);
            }
            case CANNON -> {
                int[][] dirs = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } };
                for (int[] d : dirs) {
                    int nx = x + d[0], ny = y + d[1];
                    boolean jumped = false;
                    while (inBoard(nx, ny)) {
                        Piece t = board[idx(nx, ny)];
                        if (!jumped) {
                            if (t == null) c.moves.add(new PieceMove(nx, ny, false));
                            else jumped = true;
                        } else if (t != null) {
                            if (t.side() != p.side()) c.moves.add(new PieceMove(nx, ny, true));
                            break;
                        }
                        nx += d[0];
                        ny += d[1];
                    }
                }
            }
            case PAWN -> {
                int fwd = p.side() == RED ? 1 : -1;
                c.push(x, y + fwd);
                if (hasCrossedRiver(p.side(), y)) {
                    c.push(x + 1, y);
                    c.push(x - 1, y);
                }
            }
            default -> { /* unknown type: no moves */ }
        }
        return c.moves;
    }

    public static int findKing(Piece[] board, char side) {
        for (int i = 0; i < board.length; i++) {
            Piece p = board[i];
            if (p != null && p.side() == side && p.type() == KING) return i;
        }
        return -1;
    }

    public static boolean isSquareAttacked(Piece[] board, int x, int y, char bySide) {
        for (int i = 0; i < board.length; i++) {
            Piece p = board[i];
            if (p == null || p.side() != bySide) continue;
            int[] pos = xy(i);
            for (PieceMove m : pieceMoves(board, pos[0], pos[1])) {
                if (m.toX() == x && m.toY() == y) return true;
            }
        }
        return false;
    }

    /** Flying-general: kings on the same file with no piece between attack each other. */
    public static boolean kingsFacing(Piece[] board) {
        int rk = findKing(board, RED);
        int bk = findKing(board, BLACK);
        if (rk < 0 || bk < 0) return false;
        int[] rp = xy(rk);
        int[] bp = xy(bk);
        if (rp[0] != bp[0]) return false;
        int lo = Math.min(rp[1], bp[1]) + 1;
        int hi = Math.max(rp[1], bp[1]);
        for (int y = lo; y < hi; y++) {
            if (board[idx(rp[0], y)] != null) return false;
        }
        return true;
    }

    public static boolean isInCheck(Piece[] board, char side) {
        int k = findKing(board, side);
        if (k < 0) return true;
        int[] kp = xy(k);
        return isSquareAttacked(board, kp[0], kp[1], opposite(side));
    }

    public static Piece[] applyMove(Piece[] board, Move mv) {
        Piece[] nb = board.clone();
        int from = idx(mv.fromX(), mv.fromY());
        int to = idx(mv.toX(), mv.toY());
        nb[to] = nb[from];
        nb[from] = null;
        return nb;
    }

    public static List<LegalMove> legalMoves(Piece[] board, char side) {
        List<LegalMove> out = new ArrayList<>();
        for (int i = 0; i < board.length; i++) {
            Piece p = board[i];
            if (p == null || p.side() != side) continue;
            int[] pos = xy(i);
            for (PieceMove m : pieceMoves(board, pos[0], pos[1])) {
                Piece[] nb = applyMove(board, new Move(pos[0], pos[1], m.toX(), m.toY()));
                if (isInCheck(nb, side)) continue;
                if (kingsFacing(nb)) continue;
                Piece target = board[idx(m.toX(), m.toY())];
                out.add(new LegalMove(pos[0], pos[1], m.toX(), m.toY(),
                        p.type(), m.capture(), target != null ? target.type() : null));
            }
        }
        return out;
    }

    public static boolean isLegalMove(Piece[] board, char side, Move mv) {
        if (!inBoard(mv.fromX(), mv.fromY()) || !inBoard(mv.toX(), mv.toY())) return false;
        Piece p = board[idx(mv.fromX(), mv.fromY())];
        if (p == null || p.side() != side) return false;
        Piece t = board[idx(mv.toX(), mv.toY())];
        if (t != null && t.side() == side) return false;
        boolean inMoves = false;
        for (PieceMove m : pieceMoves(board, mv.fromX(), mv.fromY())) {
            if (m.toX() == mv.toX() && m.toY() == mv.toY()) { inMoves = true; break; }
        }
        if (!inMoves) return false;
        Piece[] nb = applyMove(board, mv);
        if (isInCheck(nb, side)) return false;
        if (kingsFacing(nb)) return false;
        return true;
    }

    public static GameStatus gameStatus(Piece[] board, char sideToMove) {
        List<LegalMove> moves = legalMoves(board, sideToMove);
        boolean inCheck = isInCheck(board, sideToMove);
        if (moves.isEmpty()) {
            return new GameStatus(true,
                    inCheck ? "checkmate" : "stalemate",
                    opposite(sideToMove),
                    inCheck,
                    0);
        }
        return new GameStatus(false, null, null, inCheck, moves.size());
    }

    /** Mirrors moveToNotation in rules.js: glyph + coordinates, e.g. "傌 10→22". */
    public static String moveToNotation(Piece[] board, Move mv) {
        Piece p = board[idx(mv.fromX(), mv.fromY())];
        if (p == null) return "??";
        String g = (p.side() == RED ? GLYPHS_R : GLYPHS_B).get(p.type());
        return g + " " + mv.fromX() + mv.fromY() + "→" + mv.toX() + mv.toY();
    }
}
