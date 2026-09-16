package com.xiangqi.room;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xiangqi.rules.Piece;
import com.xiangqi.rules.XiangqiRules;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Room state must survive a JSON round-trip unchanged: in "redis" cluster mode
 * every mutation is load -> mutate -> save against a JSON blob, so any field
 * that fails to round-trip would silently desync replicas. Numbers inside
 * history may widen (int -> long); that is invisible on the wire.
 */
class RoomSerdeTest {

    private final ObjectMapper om = new ObjectMapper();

    @Test
    void roomRoundTripsThroughJson() throws Exception {
        Room room = new Room();
        room.code = "XQTEST";
        room.casual = false;
        room.ranked = true;
        room.baseMs = 600_000;
        room.incMs = 5_000;
        room.board = XiangqiRules.initialBoard();
        room.board[0] = null; // exercise null squares inside the array
        room.turn = 'b';
        room.status = Room.STATUS_PLAYING;
        room.winner = 'r';
        room.reason = "timeout";
        room.cleanupAt = 1_700_000_000_000L;
        room.lastTickAt = 1_700_000_000_250L;
        room.createdAt = 1_699_999_000_000L;

        Room.Player red = new Room.Player();
        red.sessionId = "sess-a";
        red.playerId = "pa";
        red.name = "alice";
        red.side = 'r';
        red.ms = 123_456;
        room.r = red;

        Room.UndoRequest undo = new Room.UndoRequest();
        undo.side = 'r';
        undo.expiresAt = 1_700_000_015_000L;
        room.undoRequest = undo;

        Map<String, Object> ply = new LinkedHashMap<>();
        ply.put("fromX", 1);
        ply.put("fromY", 0);
        ply.put("toX", 2);
        ply.put("toY", 2);
        ply.put("side", "r");
        ply.put("captured", null); // explicit nulls must survive
        ply.put("at", 1_700_000_000_100L);
        room.history.add(ply);

        Room back = om.readValue(om.writeValueAsString(room), Room.class);

        assertEquals("XQTEST", back.code);
        assertFalse(back.casual);
        assertTrue(back.ranked);
        assertEquals(600_000, back.baseMs);
        assertEquals(5_000, back.incMs);
        assertEquals('b', back.turn);
        assertEquals(Room.STATUS_PLAYING, back.status);
        assertEquals(Character.valueOf('r'), back.winner);
        assertEquals("timeout", back.reason);
        assertEquals(1_700_000_000_000L, back.cleanupAt);
        assertEquals(1_700_000_000_250L, back.lastTickAt);
        assertEquals(1_699_999_000_000L, back.createdAt);

        // Board: null squares stay null, pieces round-trip field-for-field.
        assertEquals(room.board.length, back.board.length);
        assertNull(back.board[0]);
        assertEquals(XiangqiRules.initialBoard()[1], back.board[1]);
        Piece blackCorner = XiangqiRules.initialBoard()[XiangqiRules.idx(8, 9)];
        assertEquals(blackCorner, back.board[XiangqiRules.idx(8, 9)]);

        // Players / undo window.
        assertNull(back.b);
        assertEquals("sess-a", back.r.sessionId);
        assertEquals("pa", back.r.playerId);
        assertEquals("alice", back.r.name);
        assertEquals('r', back.r.side);
        assertEquals(123_456, back.r.ms);
        assertEquals('r', back.undoRequest.side);
        assertEquals(1_700_000_015_000L, back.undoRequest.expiresAt);

        // History: one ply, explicit null preserved, numbers readable as longs.
        assertEquals(1, back.history.size());
        Map<String, Object> h = back.history.get(0);
        assertEquals(1, ((Number) h.get("fromX")).intValue());
        assertEquals("r", h.get("side"));
        assertTrue(h.containsKey("captured"));
        assertNull(h.get("captured"));
        assertEquals(1_700_000_000_100L, ((Number) h.get("at")).longValue());

        // Derived helpers still work on the restored room.
        assertEquals(123_456L, ((Number) back.clockSnapshot().get("r")).longValue());
        assertEquals(0L, ((Number) back.clockSnapshot().get("b")).longValue());
        assertEquals("pa", back.findBySession("sess-a").playerId);
    }

    @Test
    void freshRoomDefaultsSurviveRoundTrip() throws Exception {
        Room back = om.readValue(om.writeValueAsString(new Room()), Room.class);
        assertTrue(back.casual);
        assertFalse(back.ranked);
        assertEquals('r', back.turn);
        assertEquals(Room.STATUS_WAITING, back.status);
        assertNull(back.winner);
        assertNull(back.undoRequest);
        assertEquals(0, back.cleanupAt);
        assertTrue(back.history.isEmpty());
        assertNull(back.board);
    }

    @Test
    void queueEntryRoundTripsThroughJson() throws Exception {
        QueueEntry entry = new QueueEntry("sess-a", "alice", "pa", 1_700_000_000_000L);
        QueueEntry back = om.readValue(om.writeValueAsString(entry), QueueEntry.class);
        assertEquals(entry, back);
    }
}
