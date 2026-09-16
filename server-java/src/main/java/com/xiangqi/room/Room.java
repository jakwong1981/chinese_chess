package com.xiangqi.room;

import com.xiangqi.rules.Piece;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Room state — mirrors the room object in server/rooms.js.
 * A plain JSON-serializable POJO: in cluster mode every field round-trips
 * through Redis, so timers live in the RoomManager scheduler/sweeper instead
 * (undo expiry is driven by undoRequest.expiresAt, deletion by cleanupAt).
 */
public class Room {

    public static final String STATUS_WAITING = "waiting";
    public static final String STATUS_PLAYING = "playing";
    public static final String STATUS_OVER = "over";

    /** One seated player. ms is the remaining Fischer clock time. */
    public static class Player {
        public String sessionId;
        public String playerId;
        public String name;
        public char side; // 'r' | 'b'
        public long ms;
    }

    /** Pending consensual undo request (casual rooms only, 15 s window). */
    public static class UndoRequest {
        public char side;
        public long expiresAt;
    }

    public String code;
    public boolean casual = true;
    public boolean ranked = false;
    public long baseMs = 10 * 60 * 1000;
    public long incMs = 5 * 1000;
    public Player r;
    public Player b;
    public Piece[] board;
    public char turn = 'r';
    public List<Map<String, Object>> history = new ArrayList<>();
    public String status = STATUS_WAITING;
    public Character winner;
    public String reason;
    public UndoRequest undoRequest;
    /** When a finished room may be deleted (epoch ms; 0 = keep). Swept by RoomManager. */
    public long cleanupAt;
    public long lastTickAt;
    public long createdAt = System.currentTimeMillis();

    public Player player(char side) {
        return side == 'r' ? r : b;
    }

    public void setPlayer(char side, Player p) {
        if (side == 'r') r = p; else b = p;
    }

    /** First seated player that is not the given session (null when alone). */
    public Player otherPlayer(String sessionId) {
        if (r != null && !r.sessionId.equals(sessionId)) return r;
        if (b != null && !b.sessionId.equals(sessionId)) return b;
        return null;
    }

    public Player findBySession(String sessionId) {
        if (r != null && r.sessionId.equals(sessionId)) return r;
        if (b != null && b.sessionId.equals(sessionId)) return b;
        return null;
    }

    public Map<String, Object> clockSnapshot() {
        Map<String, Object> clocks = new LinkedHashMap<>();
        clocks.put("r", Math.max(0, r != null ? r.ms : 0));
        clocks.put("b", Math.max(0, b != null ? b.ms : 0));
        return clocks;
    }
}
