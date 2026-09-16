package com.xiangqi.rules;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Random;

import static com.xiangqi.rules.XiangqiRules.BLACK;
import static com.xiangqi.rules.XiangqiRules.RED;
import static com.xiangqi.rules.XiangqiRules.applyMove;
import static com.xiangqi.rules.XiangqiRules.decodeBoard;
import static com.xiangqi.rules.XiangqiRules.encodeBoard;
import static com.xiangqi.rules.XiangqiRules.findKing;
import static com.xiangqi.rules.XiangqiRules.idx;
import static com.xiangqi.rules.XiangqiRules.initialBoard;
import static com.xiangqi.rules.XiangqiRules.isLegalMove;
import static com.xiangqi.rules.XiangqiRules.kingsFacing;
import static com.xiangqi.rules.XiangqiRules.legalMoves;
import static com.xiangqi.rules.XiangqiRules.opposite;
import static com.xiangqi.rules.XiangqiRules.pieceMoves;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Port of the rules-engine cases from scripts/test.mjs.
 * These must agree with shared/rules.js at all times.
 */
class XiangqiRulesTest {

    @Test
    void openingPositionYields44LegalMovesPerSide() {
        Piece[] b = initialBoard();
        assertEquals(44, legalMoves(b, RED).size());
        assertEquals(44, legalMoves(b, BLACK).size());
    }

    @Test
    void boardEncodeDecodeRoundTrips() {
        Piece[] b = initialBoard();
        String enc = encodeBoard(b);
        assertEquals(180, enc.length());
        Piece[] dec = decodeBoard(enc);
        for (int i = 0; i < b.length; i++) {
            Piece p1 = b[i], p2 = dec[i];
            if (p1 == null) assertNull(p2);
            else {
                assertNotNull(p2);
                assertEquals(p1.side(), p2.side());
                assertEquals(p1.type(), p2.type());
            }
        }
    }

    @Test
    void horseIsBlockedByAnOccupiedLeg() {
        Piece[] b = initialBoard();
        b[idx(1, 1)] = new Piece(RED, 'P', 900);
        List<PieceMove> moves = pieceMoves(b, 1, 0);
        assertTrue(moves.stream().noneMatch(m -> m.toX() == 2 && m.toY() == 2));
    }

    @Test
    void elephantIsBlockedByEyeAndCannotCrossRiver() {
        Piece[] b = initialBoard();
        b[idx(3, 1)] = new Piece(RED, 'P', 901);
        List<PieceMove> blocked = pieceMoves(b, 2, 0);
        assertTrue(blocked.stream().noneMatch(m -> m.toX() == 4 && m.toY() == 2));
        // Unblocked elephant still cannot cross the river.
        List<PieceMove> free = pieceMoves(initialBoard(), 2, 0);
        assertTrue(free.stream().allMatch(m -> m.toY() <= 4));
    }

    @Test
    void cannonNeedsAScreenToCapture() {
        Piece[] b = initialBoard();
        List<PieceMove> caps = pieceMoves(b, 1, 2).stream().filter(PieceMove::capture).toList();
        assertEquals(1, caps.size());
        assertEquals(1, caps.get(0).toX());
        assertEquals(9, caps.get(0).toY());
        Piece[] b2 = initialBoard();
        b2[idx(1, 7)] = null; // remove the screen
        assertEquals(0, pieceMoves(b2, 1, 2).stream().filter(PieceMove::capture).count());
    }

    @Test
    void pawnGainsSidewaysMovesOnlyAfterCrossingTheRiver() {
        assertEquals(1, pieceMoves(initialBoard(), 0, 3).size());
        Piece[] b = initialBoard();
        b[idx(0, 3)] = null;
        b[idx(0, 5)] = new Piece(RED, 'P', 902);
        List<PieceMove> after = pieceMoves(b, 0, 5);
        assertTrue(after.stream().anyMatch(m -> m.toX() == 0 && m.toY() == 6));
        assertTrue(after.stream().anyMatch(m -> m.toX() == 1 && m.toY() == 5));
        assertTrue(after.stream().noneMatch(m -> m.toY() == 4));
    }

    @Test
    void flyingGeneralMovesThatLeaveKingsFacingAreIllegal() {
        Piece[] b = initialBoard();
        for (int y = 1; y <= 8; y++) b[idx(4, y)] = null;
        assertTrue(kingsFacing(b));
        long keepFacing = legalMoves(b, RED).stream()
                .filter(m -> kingsFacing(applyMove(b, new Move(m.fromX(), m.fromY(), m.toX(), m.toY()))))
                .count();
        assertEquals(0, keepFacing);
    }

    @Test
    void applyMoveRelocatesThePieceAndClearsTheSource() {
        Piece[] b = initialBoard();
        Move mv = new Move(1, 0, 2, 2);
        assertTrue(isLegalMove(b, RED, mv));
        Piece[] nb = applyMove(b, mv);
        assertNull(nb[idx(1, 0)]);
        assertEquals('H', nb[idx(2, 2)].type());
    }

    @Test
    void randomSelfPlayNeverProducesAnIllegalState() {
        Piece[] b = initialBoard();
        char side = RED;
        Random rng = new Random(42); // fixed seed for determinism
        for (int i = 0; i < 60; i++) {
            List<LegalMove> ms = legalMoves(b, side);
            if (ms.isEmpty()) break;
            LegalMove pick = ms.get(rng.nextInt(ms.size()));
            b = applyMove(b, new Move(pick.fromX(), pick.fromY(), pick.toX(), pick.toY()));
            side = opposite(side);
            // Kings must always exist and never face each other after a legal move.
            assertTrue(findKing(b, RED) >= 0);
            assertTrue(findKing(b, BLACK) >= 0);
            assertFalse(kingsFacing(b));
        }
    }

    @Test
    void checkmateIsDetected() {
        // Fool's-mate style: bare red king boxed in by two black rooks.
        Piece[] b = new Piece[90];
        b[idx(4, 0)] = new Piece(RED, 'K', 1);
        b[idx(4, 9)] = new Piece(BLACK, 'K', 2);
        b[idx(3, 1)] = new Piece(BLACK, 'R', 3); // covers rank 1 and file 3
        b[idx(5, 1)] = new Piece(BLACK, 'R', 4); // covers file 5
        b[idx(4, 2)] = new Piece(BLACK, 'R', 5); // covers file 4 -> check
        GameStatus status = com.xiangqi.rules.XiangqiRules.gameStatus(b, RED);
        assertTrue(status.inCheck());
        assertTrue(status.over());
        assertEquals("checkmate", status.reason());
        assertEquals(Character.valueOf(BLACK), status.winner());
    }

    @Test
    void notationContainsGlyphAndCoordinates() {
        Piece[] b = initialBoard();
        String n = com.xiangqi.rules.XiangqiRules.moveToNotation(b, new Move(1, 0, 2, 2));
        assertEquals("傌 10→22", n);
    }
}
