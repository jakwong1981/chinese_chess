package com.xiangqi.room;

import com.xiangqi.ratings.PlayerRecord;
import com.xiangqi.ratings.RatingUpdate;
import com.xiangqi.ratings.RatingsStore;
import com.xiangqi.rules.GameStatus;
import com.xiangqi.rules.Move;
import com.xiangqi.rules.Piece;
import com.xiangqi.ws.SessionRegistry;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

import static com.xiangqi.rules.XiangqiRules.BLACK;
import static com.xiangqi.rules.XiangqiRules.RED;
import static com.xiangqi.rules.XiangqiRules.applyMove;
import static com.xiangqi.rules.XiangqiRules.encodeBoard;
import static com.xiangqi.rules.XiangqiRules.gameStatus;
import static com.xiangqi.rules.XiangqiRules.idx;
import static com.xiangqi.rules.XiangqiRules.initialBoard;
import static com.xiangqi.rules.XiangqiRules.isLegalMove;
import static com.xiangqi.rules.XiangqiRules.moveToNotation;
import static com.xiangqi.rules.XiangqiRules.opposite;

/**
 * Room + matchmaking manager — port of server/rooms.js.
 * Handles: quick-match queue, private rooms, server-authoritative move validation,
 * Fischer increment clocks, 15s consensual undo (casual rooms), and game-over broadcast.
 *
 * All state lives in a RoomStore (in-memory or Redis) and every mutation runs inside
 * store.withLock(...), so replicas serialize room mutations cluster-wide. All outbound
 * traffic goes through the RoomEventBus, which delivers to sessions on ANY replica.
 * Public methods stay synchronized for local atomicity, mirroring the Node mock's
 * single-threaded semantics.
 *
 * Timers are state, not scheduled tasks: undo expiry is driven by undoRequest.expiresAt
 * (checked by the clock tick) and finished rooms carry cleanupAt (reaped by the sweeper),
 * so any replica can take over when another one dies.
 */
@Service
public class RoomManager {

    private static final Logger log = LoggerFactory.getLogger(RoomManager.class);

    private static final long ROOM_TTL_MS = 60L * 60 * 1000; // 1 hour
    private static final long CLOCK_TICK_MS = 250;
    /** Ticks closer than this are skipped — another replica just serviced the room. */
    private static final long CLOCK_APPLY_MIN_DT_MS = 200;
    private static final long UNDO_WINDOW_MS = 15_000;
    private static final long SWEEP_MS = 60_000;
    /** Queue entries older than this are dropped (their owner disconnected or died). */
    private static final long QUEUE_STALE_MS = 5 * 60 * 1000;

    private final RoomStore store;
    private final RoomEventBus bus;
    private final RatingsStore ratings;
    private final SessionRegistry sessions;
    private final ScheduledExecutorService scheduler;

    public RoomManager(RoomStore store, RoomEventBus bus, RatingsStore ratings, SessionRegistry sessions) {
        this.store = store;
        this.bus = bus;
        this.ratings = ratings;
        this.sessions = sessions;
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "room-clock");
            t.setDaemon(true); // never block JVM shutdown (tests or server)
            return t;
        });
    }

    @PostConstruct
    void startClock() {
        scheduler.scheduleWithFixedDelay(this::tickSafely, CLOCK_TICK_MS, CLOCK_TICK_MS, TimeUnit.MILLISECONDS);
        scheduler.scheduleWithFixedDelay(this::sweepSafely, SWEEP_MS, SWEEP_MS, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    void shutdown() {
        scheduler.shutdownNow();
    }

    private void tickSafely() {
        try {
            tickAll();
        } catch (Throwable t) {
            log.warn("[rooms] clock tick failed: {}", t.getMessage());
        }
    }

    private void sweepSafely() {
        try {
            sweepAll();
        } catch (Throwable t) {
            log.warn("[rooms] sweep failed: {}", t.getMessage());
        }
    }

    // ---------------------------------------------------------------- rooms

    public Room createRoom(String code, boolean casual, boolean ranked) {
        String roomCode = code != null ? code : store.nextRoomCode();
        return store.withLock(roomCode, () -> {
            Room room = newRoom(roomCode, casual, ranked);
            store.save(room);
            return room;
        });
    }

    /** Caller must hold the room's lock. */
    private Room newRoom(String code, boolean casual, boolean ranked) {
        Room room = new Room();
        room.code = code;
        room.casual = casual;
        room.ranked = ranked;
        room.board = initialBoard();
        return room;
    }

    public Room getRoom(String code) {
        return store.find(code);
    }

    public synchronized Room joinByCode(String sessionId, String code, String name) {
        return store.withLock(code, () -> {
            Room room = store.find(code);
            if (room == null) {
                // Private rooms are casual by default (undo allowed, no rating impact).
                room = newRoom(code, true, false);
            }
            boolean seated = seat(sessionId, room, name, null, sessions.playerIdOr(sessionId));
            store.save(room);
            return seated ? room : null;
        });
    }

    public synchronized Room quickMatch(String sessionId, String name) {
        String selfId = sessions.playerIdOr(sessionId);
        // Choose (or enqueue) atomically across replicas under the shared queue lock.
        QueueEntry waiting = store.withLock("queue", () -> {
            // Find a waiting opponent, preferring the closest rating (ladder matchmaking).
            List<QueueEntry> candidates = new ArrayList<>();
            for (QueueEntry q : store.queue()) {
                if (!q.sessionId().equals(sessionId)) candidates.add(q);
            }
            QueueEntry chosen = null;
            if (!candidates.isEmpty()) {
                if (ratings != null) {
                    List<String> ids = new ArrayList<>();
                    for (QueueEntry c : candidates) ids.add(c.playerId());
                    String chosenId = ratings.bestMatch(ids, selfId);
                    for (QueueEntry c : candidates) {
                        if (c.playerId().equals(chosenId)) { chosen = c; break; }
                    }
                }
                if (chosen == null) chosen = candidates.get(0);
            }
            if (chosen != null) {
                store.removeFromQueue(chosen.sessionId());
            } else {
                store.enqueue(new QueueEntry(sessionId, name, selfId, System.currentTimeMillis()));
            }
            return chosen;
        });

        if (waiting == null) {
            sendToUser(sessionId, "/queue/matchmaking", Map.of("status", "queued"));
            return null;
        }

        String roomCode = store.nextRoomCode();
        return store.withLock(roomCode, () -> {
            Room room = newRoom(roomCode, false, true); // quick match is ranked
            boolean a = seat(waiting.sessionId(), room, waiting.name(), RED, waiting.playerId());
            boolean b = seat(sessionId, room, name, BLACK, selfId);
            if (a && b) startGame(room);
            store.save(room);
            return room;
        });
    }

    public synchronized void leaveQueue(String sessionId) {
        store.removeFromQueue(sessionId);
    }

    /** Mirrors the /app/match/cancel route: leave the queue and notify the user queue. */
    public synchronized void cancelMatchmaking(String sessionId) {
        leaveQueue(sessionId);
        sendToUser(sessionId, "/queue/matchmaking", Map.of("status", "cancelled"));
    }

    // ---------------------------------------------------------------- seating

    /** Caller must hold the room's lock. */
    private boolean seat(String sessionId, Room room, String name, Character preferredSide, String playerId) {
        Room.Player other = room.otherPlayer(sessionId);
        char side;
        if (preferredSide != null) {
            side = preferredSide;
        } else {
            side = other != null ? opposite(other.side) : (ThreadLocalRandom.current().nextBoolean() ? RED : BLACK);
        }
        Room.Player occupant = room.player(side);
        if (occupant != null && !occupant.sessionId.equals(sessionId)) {
            // Slot full — try opposite.
            char alt = opposite(side);
            if (room.player(alt) != null) return false;
            side = alt;
        }
        Room.Player p = new Room.Player();
        p.sessionId = sessionId;
        p.playerId = playerId;
        p.name = name != null ? name : "player";
        p.side = side;
        p.ms = room.baseMs;
        room.setPlayer(side, p);
        PlayerRecord myRec = ratings != null ? ratings.register(playerId, p.name) : null;
        store.linkSession(sessionId, room.code);

        Map<String, Object> joined = new LinkedHashMap<>();
        joined.put("roomCode", room.code);
        joined.put("side", String.valueOf(side));
        joined.put("casual", room.casual);
        joined.put("ranked", room.ranked);
        joined.put("baseMs", room.baseMs);
        joined.put("incMs", room.incMs);
        joined.put("opponent", other != null ? other.name : null);
        joined.put("status", room.status);
        if (myRec != null) {
            Map<String, Object> rating = new LinkedHashMap<>();
            rating.put("rating", myRec.rating);
            rating.put("wins", myRec.wins);
            rating.put("losses", myRec.losses);
            rating.put("draws", myRec.draws);
            joined.put("rating", rating);
        } else {
            joined.put("rating", null);
        }
        sendToUser(sessionId, "/queue/joined", joined);

        Map<String, Object> evt = new LinkedHashMap<>();
        evt.put("type", "PLAYER_JOINED");
        evt.put("side", String.valueOf(side));
        evt.put("name", p.name);
        evt.put("status", room.status);
        broadcastRoom(room, evt);

        // Once both seats are filled, begin play (covers private-room joins, not just quick match).
        if (room.r != null && room.b != null && Room.STATUS_WAITING.equals(room.status)) {
            startGame(room);
        }
        return true;
    }

    /** Caller must hold the room's lock. */
    private void startGame(Room room) {
        room.status = Room.STATUS_PLAYING;
        room.board = initialBoard();
        room.turn = RED;
        room.history.clear();
        room.lastTickAt = System.currentTimeMillis();

        Map<String, Object> players = new LinkedHashMap<>();
        players.put("r", playerInfo(room.r));
        players.put("b", playerInfo(room.b));

        Map<String, Object> evt = new LinkedHashMap<>();
        evt.put("type", "GAME_START");
        evt.put("board", encodeBoard(room.board));
        evt.put("turn", String.valueOf(room.turn));
        evt.put("ranked", room.ranked);
        evt.put("players", players);
        evt.put("clocks", room.clockSnapshot());
        broadcastRoom(room, evt);
    }

    private Map<String, Object> playerInfo(Room.Player p) {
        if (p == null) return null;
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("name", p.name);
        info.put("rating", ratings != null ? ratings.ratingOf(p.playerId) : null);
        return info;
    }

    // ---------------------------------------------------------------- clock

    /**
     * Every replica runs this tick over all playing rooms; the per-room lock makes
     * sure only one replica applies a given tick, and lastTickAt is shared state,
     * so cadence and flag-fall behavior match the single-process version.
     */
    private void tickAll() {
        long now = System.currentTimeMillis();
        for (Room meta : store.findPlaying()) {
            store.withLock(meta.code, () -> {
                Room room = store.find(meta.code);
                if (room == null || !Room.STATUS_PLAYING.equals(room.status)) return null;

                // Pending undo window expiry (a scheduled timer in the pre-cluster version).
                boolean dirty = false;
                if (room.undoRequest != null && room.undoRequest.expiresAt <= now) {
                    room.undoRequest = null;
                    broadcastRoom(room, Map.of("type", "UNDO_EXPIRED"));
                    dirty = true;
                }

                long dt = now - room.lastTickAt;
                if (dt < CLOCK_APPLY_MIN_DT_MS) { // another replica ticked just now
                    if (dirty) store.save(room);
                    return null;
                }
                room.lastTickAt = now;
                Room.Player cur = room.player(room.turn);
                if (cur != null) {
                    cur.ms -= dt;
                    if (cur.ms <= 0) {
                        cur.ms = 0;
                        finishGame(room, opposite(room.turn), "timeout");
                    } else {
                        Map<String, Object> evt = new LinkedHashMap<>();
                        evt.put("type", "CLOCK");
                        evt.put("clocks", room.clockSnapshot());
                        broadcastRoom(room, evt);
                    }
                }
                store.save(room);
                return null;
            });
        }
    }

    /** Reaps finished rooms past their TTL and drops stale queue entries. */
    private void sweepAll() {
        long now = System.currentTimeMillis();
        for (Room meta : store.findAll()) {
            if (meta.cleanupAt <= 0 || meta.cleanupAt > now) continue;
            store.withLock(meta.code, () -> {
                Room room = store.find(meta.code);
                if (room == null || room.cleanupAt <= 0 || room.cleanupAt > now) return null;
                if (room.r != null) store.unlinkSession(room.r.sessionId);
                if (room.b != null) store.unlinkSession(room.b.sessionId);
                store.delete(room.code);
                log.info("[rooms] reaped finished room {}", meta.code);
                return null;
            });
        }
        store.withLock("queue", () -> {
            for (QueueEntry q : store.queue()) {
                if (now - q.enqueuedAt() > QUEUE_STALE_MS) store.removeFromQueue(q.sessionId());
            }
            return null;
        });
    }

    // ---------------------------------------------------------------- gameplay

    public synchronized void handleMove(String sessionId, String roomCode, Map<String, Object> mv) {
        store.withLock(roomCode, () -> {
            Room room = store.find(roomCode);
            if (room == null) { reject(sessionId, roomCode, "no-room", "Room not found"); return null; }
            if (!Room.STATUS_PLAYING.equals(room.status)) { reject(sessionId, roomCode, "not-playing", "Game is not in progress"); return null; }
            Room.Player player = room.findBySession(sessionId);
            if (player == null) { reject(sessionId, roomCode, "not-in-room", "You are not in this room"); return null; }
            if (player.side != room.turn) { reject(sessionId, roomCode, "not-your-turn", "Not your turn"); return null; }
            Move move = new Move(asInt(mv.get("fromX")), asInt(mv.get("fromY")), asInt(mv.get("toX")), asInt(mv.get("toY")));
            if (!isLegalMove(room.board, room.turn, move)) {
                reject(sessionId, roomCode, "illegal", "Illegal move");
                return null;
            }
            // Notation must be computed on the pre-move board (the Node mock computed it
            // after applying the move, which always yielded "??").
            String notation = moveToNotation(room.board, move);
            Piece captured = room.board[idx(move.toX(), move.toY())];
            room.board = applyMove(room.board, move);
            // Apply Fischer increment to mover.
            player.ms += room.incMs;
            Map<String, Object> h = new LinkedHashMap<>();
            h.put("fromX", move.fromX());
            h.put("fromY", move.fromY());
            h.put("toX", move.toX());
            h.put("toY", move.toY());
            h.put("side", String.valueOf(room.turn));
            h.put("captured", captured != null ? String.valueOf(captured.type()) : null);
            h.put("at", System.currentTimeMillis());
            room.history.add(h);
            char next = opposite(room.turn);
            room.turn = next;
            GameStatus status = gameStatus(room.board, next);

            Map<String, Object> mvOut = new LinkedHashMap<>();
            mvOut.put("fromX", move.fromX());
            mvOut.put("fromY", move.fromY());
            mvOut.put("toX", move.toX());
            mvOut.put("toY", move.toY());
            mvOut.put("side", String.valueOf(player.side));
            mvOut.put("captured", captured != null ? String.valueOf(captured.type()) : null);

            Map<String, Object> evt = new LinkedHashMap<>();
            evt.put("type", "MOVE_CONFIRMED");
            evt.put("move", mvOut);
            evt.put("notation", notation);
            evt.put("board", encodeBoard(room.board));
            evt.put("turn", String.valueOf(next));
            evt.put("clocks", room.clockSnapshot());
            evt.put("inCheck", status.inCheck());
            broadcastRoom(room, evt);
            if (status.over()) {
                finishGame(room, status.winner(), status.reason());
            } else {
                // Any pending undo is invalidated once a new move lands.
                clearUndo(room);
            }
            store.save(room);
            return null;
        });
    }

    public synchronized void handleResign(String sessionId, String roomCode) {
        store.withLock(roomCode, () -> {
            Room room = store.find(roomCode);
            if (room == null || !Room.STATUS_PLAYING.equals(room.status)) return null;
            Room.Player player = room.findBySession(sessionId);
            if (player == null) return null;
            finishGame(room, opposite(player.side), "resign");
            store.save(room);
            return null;
        });
    }

    public synchronized void handleUndoRequest(String sessionId, String roomCode) {
        store.withLock(roomCode, () -> {
            Room room = store.find(roomCode);
            if (room == null || !Room.STATUS_PLAYING.equals(room.status)) { reject(sessionId, roomCode, "not-playing", "Game is not in progress"); return null; }
            if (!room.casual) { reject(sessionId, roomCode, "not-casual", "Undo is only allowed in casual rooms"); return null; }
            Room.Player player = room.findBySession(sessionId);
            if (player == null) return null;
            if (room.history.isEmpty()) { reject(sessionId, roomCode, "no-history", "No moves to undo"); return null; }
            if (room.undoRequest != null) return null;
            Room.UndoRequest req = new Room.UndoRequest();
            req.side = player.side;
            req.expiresAt = System.currentTimeMillis() + UNDO_WINDOW_MS;
            room.undoRequest = req;
            Map<String, Object> evt = new LinkedHashMap<>();
            evt.put("type", "UNDO_REQUESTED");
            evt.put("by", String.valueOf(player.side));
            evt.put("expiresAt", req.expiresAt);
            broadcastRoom(room, evt);
            store.save(room);
            return null;
        });
    }

    public synchronized void handleUndoResponse(String sessionId, String roomCode, boolean accept) {
        store.withLock(roomCode, () -> {
            Room room = store.find(roomCode);
            if (room == null || room.undoRequest == null) return null;
            Room.Player player = room.findBySession(sessionId);
            if (player == null || player.side == room.undoRequest.side) return null;
            if (!accept) {
                clearUndo(room);
                Map<String, Object> evt = new LinkedHashMap<>();
                evt.put("type", "UNDO_DECLINED");
                evt.put("by", String.valueOf(player.side));
                broadcastRoom(room, evt);
                store.save(room);
                return null;
            }
            // Pop the last move (the requester's own move).
            Map<String, Object> last = room.history.isEmpty() ? null : room.history.remove(room.history.size() - 1);
            if (last != null) {
                // Rebuild board from history to stay honest.
                Piece[] b = initialBoard();
                for (Map<String, Object> hist : room.history) {
                    b = applyMove(b, new Move(asInt(hist.get("fromX")), asInt(hist.get("fromY")),
                            asInt(hist.get("toX")), asInt(hist.get("toY"))));
                }
                room.board = b;
                room.turn = String.valueOf(last.get("side")).charAt(0);
            }
            clearUndo(room);
            Map<String, Object> evt = new LinkedHashMap<>();
            evt.put("type", "UNDO_APPLIED");
            evt.put("board", encodeBoard(room.board));
            evt.put("turn", String.valueOf(room.turn));
            evt.put("history", room.history.size());
            broadcastRoom(room, evt);
            store.save(room);
            return null;
        });
    }

    // ---------------------------------------------------------------- lifecycle

    public synchronized void handleDisconnect(String sessionId) {
        leaveQueue(sessionId);
        String code = store.roomOf(sessionId);
        if (code == null) return;
        store.withLock(code, () -> {
            Room room = store.find(code);
            if (room == null) {
                store.unlinkSession(sessionId);
                return null;
            }
            Room.Player player = room.findBySession(sessionId);
            if (player != null && Room.STATUS_PLAYING.equals(room.status)) {
                finishGame(room, opposite(player.side), "disconnect");
            }
            if (player != null) room.setPlayer(player.side, null);
            store.save(room);
            store.unlinkSession(sessionId);
            return null;
        });
    }

    /** Caller must hold the room's lock; the caller saves the room afterwards. */
    private void finishGame(Room room, Character winner, String reason) {
        room.status = Room.STATUS_OVER;
        room.winner = winner;
        room.reason = reason;
        clearUndo(room);
        // Ranked games update the ladder; casual games never touch it.
        RatingUpdate ratingUpdate = null;
        if (room.ranked && ratings != null && room.r != null && room.b != null) {
            ratingUpdate = ratings.recordResult(room.r.playerId, room.b.playerId, winner);
        }
        Map<String, Object> evt = new LinkedHashMap<>();
        evt.put("type", "GAME_OVER");
        evt.put("winner", winner != null ? String.valueOf(winner) : null);
        evt.put("reason", reason);
        evt.put("board", encodeBoard(room.board));
        evt.put("history", room.history);
        evt.put("clocks", room.clockSnapshot());
        evt.put("ranked", room.ranked);
        evt.put("ratings", ratingUpdate);
        broadcastRoom(room, evt);
        room.cleanupAt = System.currentTimeMillis() + ROOM_TTL_MS;
    }

    private void clearUndo(Room room) {
        room.undoRequest = null;
    }

    // ---------------------------------------------------------------- plumbing

    private void reject(String sessionId, String roomCode, String code, String message) {
        Map<String, Object> evt = new LinkedHashMap<>();
        evt.put("type", "MOVE_REJECTED");
        evt.put("code", code);
        evt.put("message", message);
        evt.put("to", sessionId);
        bus.publishToRoom(roomCode, evt);
    }

    private void broadcastRoom(Room room, Map<String, Object> payload) {
        bus.publishToRoom(room.code, payload);
    }

    /** Personal queue: delivered to the replica that owns the session (see RoomEventBus). */
    private void sendToUser(String sessionId, String destination, Map<String, Object> payload) {
        bus.publishToSession(sessionId, destination, payload);
    }

    private static int asInt(Object v) {
        if (v instanceof Number n) return n.intValue();
        if (v instanceof String s) return Integer.parseInt(s.trim());
        return 0;
    }
}
