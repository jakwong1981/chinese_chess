package com.xiangqi.room;

import com.xiangqi.persistence.PlayerEntity;
import com.xiangqi.persistence.PlayerRepository;
import com.xiangqi.ratings.RatingsStore;
import com.xiangqi.ws.SessionRegistry;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Port of the room / matchmaking / ranked-flow cases from scripts/test.mjs.
 * Runs against the in-memory store with a capturing event bus in place of
 * the real broker/Redis — proving the refactored RoomManager keeps the exact
 * pre-cluster behavior.
 */
class RoomManagerTest {

    record Published(String destination, Object payload) {}

    /** Records the same wire destinations the real buses deliver to. */
    static class CapturingEventBus implements RoomEventBus {
        final List<Published> published = new ArrayList<>();

        @Override
        public void publishToRoom(String roomCode, Map<String, Object> payload) {
            published.add(new Published("/topic/room/" + roomCode, payload));
        }

        @Override
        public void publishToSession(String sessionId, String destination, Map<String, Object> payload) {
            published.add(new Published(destination + "-user" + sessionId, payload));
        }
    }

    private CapturingEventBus bus;
    private RatingsStore ratings;
    private SessionRegistry sessions;
    private RoomManager rm;

    /** Ratings store backed by a stub repository — room logic never hits a real DB. */
    private static RatingsStore stubRatings() {
        PlayerRepository repo = mock(PlayerRepository.class);
        when(repo.findAll()).thenReturn(List.of());
        when(repo.save(any(PlayerEntity.class))).thenAnswer(inv -> inv.getArgument(0));
        return new RatingsStore(repo);
    }

    private RoomManager freshManager(boolean withRatings) {
        bus = new CapturingEventBus();
        ratings = withRatings ? stubRatings() : null;
        sessions = new SessionRegistry();
        rm = new RoomManager(new InMemoryRoomStore(), bus, ratings, sessions);
        return rm;
    }

    private void connect(String sessionId, String name, String playerId) {
        sessions.connect(sessionId, name);
        sessions.setPlayerId(sessionId, playerId);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> lastUserMessage(String sessionId, String dest) {
        // Personal queues are sent straight to the per-session destination
        // ("/queue/x-user<sessionId>"); the outbound interceptor rewrites the header.
        String target = dest + "-user" + sessionId;
        for (int i = bus.published.size() - 1; i >= 0; i--) {
            Published p = bus.published.get(i);
            if (p.destination().equals(target)) {
                return (Map<String, Object>) p.payload();
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> lastPublished(String type) {
        for (int i = bus.published.size() - 1; i >= 0; i--) {
            Map<String, Object> body = (Map<String, Object>) bus.published.get(i).payload();
            if (type.equals(body.get("type"))) return body;
        }
        return null;
    }

    // ---------------------------------------------------------------- rooms

    @Test
    void twoPlayersJoiningGetOppositeSidesAndGameStart() {
        freshManager(false);
        connect("a", "alice", "pa");
        connect("b", "bob", "pb");
        rm.joinByCode("a", "XQTEST", "alice");
        Map<String, Object> joinedA = lastUserMessage("a", "/queue/joined");
        rm.joinByCode("b", "XQTEST", "bob");
        Map<String, Object> joinedB = lastUserMessage("b", "/queue/joined");
        assertNotNull(joinedA);
        assertNotNull(joinedB);
        assertNotEquals(joinedA.get("side"), joinedB.get("side"));
        assertEquals(joinedA.get("roomCode"), joinedB.get("roomCode"));
        Map<String, Object> start = lastPublished("GAME_START");
        assertNotNull(start, "expected GAME_START broadcast");
        assertEquals("r", start.get("turn"));
    }

    @Test
    void serverRejectsMoveOutOfTurn() {
        freshManager(false);
        connect("a", "alice", "pa");
        connect("b", "bob", "pb");
        rm.joinByCode("a", "XQT2", "alice");
        rm.joinByCode("b", "XQT2", "bob");
        String sideA = (String) lastUserMessage("a", "/queue/joined").get("side");
        String waiter = "r".equals(sideA) ? "b" : "a";
        rm.handleMove(waiter, "XQT2", Map.of("fromX", 1, "fromY", 0, "toX", 2, "toY", 2));
        Map<String, Object> rej = lastPublished("MOVE_REJECTED");
        assertNotNull(rej, "expected MOVE_REJECTED");
        assertEquals("not-your-turn", rej.get("code"));
    }

    @Test
    void serverAcceptsLegalFirstMoveAndBroadcastsMoveConfirmed() {
        freshManager(false);
        connect("a", "alice", "pa");
        connect("b", "bob", "pb");
        rm.joinByCode("a", "XQT3", "alice");
        rm.joinByCode("b", "XQT3", "bob");
        String sideA = (String) lastUserMessage("a", "/queue/joined").get("side");
        String red = "r".equals(sideA) ? "a" : "b";
        rm.handleMove(red, "XQT3", Map.of("fromX", 1, "fromY", 0, "toX", 2, "toY", 2));
        Map<String, Object> conf = lastPublished("MOVE_CONFIRMED");
        assertNotNull(conf, "expected MOVE_CONFIRMED");
        assertEquals("b", conf.get("turn"));
        // Notation is computed from the pre-move board (fixes the Node mock's "??" bug).
        assertEquals("傌 10→22", conf.get("notation"));
    }

    @Test
    void serverRejectsIllegalMove() {
        freshManager(false);
        connect("a", "alice", "pa");
        connect("b", "bob", "pb");
        rm.joinByCode("a", "XQT4", "alice");
        rm.joinByCode("b", "XQT4", "bob");
        String sideA = (String) lastUserMessage("a", "/queue/joined").get("side");
        String red = "r".equals(sideA) ? "a" : "b";
        rm.handleMove(red, "XQT4", Map.of("fromX", 0, "fromY", 0, "toX", 1, "toY", 2));
        Map<String, Object> rej = lastPublished("MOVE_REJECTED");
        assertNotNull(rej);
        assertEquals("illegal", rej.get("code"));
    }

    @Test
    void resignEndsGameInFavourOfOpponent() {
        freshManager(false);
        connect("a", "alice", "pa");
        connect("b", "bob", "pb");
        rm.joinByCode("a", "XQT5", "alice");
        rm.joinByCode("b", "XQT5", "bob");
        String sideA = (String) lastUserMessage("a", "/queue/joined").get("side");
        rm.handleResign("a", "XQT5");
        Map<String, Object> over = lastPublished("GAME_OVER");
        assertNotNull(over);
        assertEquals("r".equals(sideA) ? "b" : "r", over.get("winner"));
        assertEquals("resign", over.get("reason"));
    }

    @Test
    void quickMatchPairsTwoQueuedPlayers() {
        freshManager(false);
        connect("a", "alice", "pa");
        connect("b", "bob", "pb");
        assertNull(rm.quickMatch("a", "alice"), "first player should be queued");
        assertNotNull(lastUserMessage("a", "/queue/matchmaking"));
        Room room = rm.quickMatch("b", "bob");
        assertNotNull(room, "second player should be matched");
        assertNotNull(lastPublished("GAME_START"));
    }

    @Test
    void undoIsAllowedInCasualRooms() {
        freshManager(false);
        connect("a", "alice", "pa");
        connect("b", "bob", "pb");
        rm.joinByCode("a", "XQT6", "alice");
        rm.joinByCode("b", "XQT6", "bob");
        Room room = rm.getRoom("XQT6");
        assertTrue(room.casual);
        String sideA = (String) lastUserMessage("a", "/queue/joined").get("side");
        String red = "r".equals(sideA) ? "a" : "b";
        rm.handleMove(red, "XQT6", Map.of("fromX", 1, "fromY", 0, "toX", 2, "toY", 2));
        rm.handleUndoRequest(red, "XQT6");
        assertNotNull(lastPublished("UNDO_REQUESTED"), "casual room should broadcast UNDO_REQUESTED");
    }

    @Test
    void undoIsRefusedInRankedRooms() {
        freshManager(true);
        connect("a", "alice", "pa");
        connect("b", "bob", "pb");
        rm.quickMatch("a", "alice");
        Room room = rm.quickMatch("b", "bob");
        assertNotNull(room);
        assertFalse(room.casual);
        String sideA = (String) lastUserMessage("a", "/queue/joined").get("side");
        String red = "r".equals(sideA) ? "a" : "b";
        rm.handleMove(red, room.code, Map.of("fromX", 1, "fromY", 0, "toX", 2, "toY", 2));
        rm.handleUndoRequest(red, room.code);
        Map<String, Object> rej = lastPublished("MOVE_REJECTED");
        assertNotNull(rej, "ranked room should reject undo");
        assertEquals("not-casual", rej.get("code"));
    }

    // ---------------------------------------------------- ranked room flow

    @Test
    void quickMatchCreatesRankedRoomAndRecordsResultOnLadder() {
        freshManager(true);
        connect("a", "alice", "pa");
        connect("b", "bob", "pb");
        rm.quickMatch("a", "alice");
        Room room = rm.quickMatch("b", "bob");
        assertNotNull(room, "second player should be matched");
        assertTrue(room.ranked, "quick match is ranked");
        assertEquals(1200, ratings.get("pa").rating);
        assertEquals(1200, ratings.get("pb").rating);
        rm.handleResign("a", room.code);
        Map<String, Object> over = lastPublished("GAME_OVER");
        assertNotNull(over);
        assertEquals(true, over.get("ranked"));
        // The payload carries the RatingUpdate record (JSON serialization happens at the messaging layer).
        com.xiangqi.ratings.RatingUpdate deltas = (com.xiangqi.ratings.RatingUpdate) over.get("ratings");
        assertNotNull(deltas, "GAME_OVER should include rating deltas");
        String winnerKey = (String) over.get("winner");
        var winnerDelta = "r".equals(winnerKey) ? deltas.r() : deltas.b();
        var loserDelta = "r".equals(winnerKey) ? deltas.b() : deltas.r();
        assertTrue(winnerDelta.delta() > 0);
        assertTrue(loserDelta.delta() < 0);
    }

    @Test
    void casualPrivateRoomsDoNotTouchTheLadder() {
        freshManager(true);
        connect("a", "alice", "pa");
        connect("b", "bob", "pb");
        rm.joinByCode("a", "XQCS", "alice");
        rm.joinByCode("b", "XQCS", "bob");
        Room room = rm.getRoom("XQCS");
        assertFalse(room.ranked, "private room is casual");
        rm.handleResign("a", "XQCS");
        Map<String, Object> over = lastPublished("GAME_OVER");
        assertNotNull(over);
        assertEquals(false, over.get("ranked"));
        assertNull(over.get("ratings"), "casual games carry no rating update");
        assertEquals(0, ratings.get("pa").games, "casual games are not counted");
    }
}
