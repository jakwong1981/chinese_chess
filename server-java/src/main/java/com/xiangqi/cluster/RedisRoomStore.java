package com.xiangqi.cluster;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xiangqi.room.QueueEntry;
import com.xiangqi.room.Room;
import com.xiangqi.room.RoomStore;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Redis-backed RoomStore — shares rooms, the matchmaking queue, session links,
 * the room-code sequence and per-key locks across replicas:
 *
 *   xq:room:{code}        room state as a JSON blob (load -> mutate -> save)
 *   xq:rooms              set of live room codes (drives findAll/findPlaying)
 *   xq:queue              list of QueueEntry JSON in arrival order
 *   xq:session:{id}:room  session -> room link
 *   xq:roomseq            INCR counter (first code = base36(1000), like the in-memory store)
 *   xq:lock:{key}         short-lived SET NX PX lock with a random token
 *
 * Locks are best-effort: a holder paused longer than the TTL can lose mutual
 * exclusion, and release is token-checked so a re-acquired lock is never freed
 * by its previous owner. Room mutations are short (serialize + SET), so the
 * 2 s TTL and ~500 ms retry budget are generous.
 */
public class RedisRoomStore implements RoomStore {

    private static final String ROOM_PREFIX = "xq:room:";
    private static final String ROOMS_SET = "xq:rooms";
    private static final String QUEUE_LIST = "xq:queue";
    private static final String SESSION_PREFIX = "xq:session:";
    private static final String SEQ_KEY = "xq:roomseq";
    private static final String LOCK_PREFIX = "xq:lock:";

    private static final long LOCK_TTL_MS = 2000;
    private static final int LOCK_RETRIES = 20;
    private static final long LOCK_RETRY_MS = 25;

    private final StringRedisTemplate redis;
    private final ObjectMapper om;

    public RedisRoomStore(StringRedisTemplate redis, ObjectMapper om) {
        this.redis = redis;
        this.om = om;
    }

    // ---------------------------------------------------------------- rooms

    @Override
    public Room find(String code) {
        String json = redis.opsForValue().get(ROOM_PREFIX + code);
        if (json == null) return null;
        try {
            return om.readValue(json, Room.class);
        } catch (Exception e) {
            throw new IllegalStateException("undecodable room blob at " + ROOM_PREFIX + code, e);
        }
    }

    @Override
    public void save(Room room) {
        try {
            redis.opsForValue().set(ROOM_PREFIX + room.code, om.writeValueAsString(room));
        } catch (Exception e) {
            throw new IllegalStateException("failed to serialize room " + room.code, e);
        }
        redis.opsForSet().add(ROOMS_SET, room.code);
    }

    @Override
    public void delete(String code) {
        redis.delete(ROOM_PREFIX + code);
        redis.opsForSet().remove(ROOMS_SET, code);
    }

    @Override
    public List<Room> findPlaying() {
        List<Room> out = new ArrayList<>();
        for (Room room : findAll()) {
            if (Room.STATUS_PLAYING.equals(room.status)) out.add(room);
        }
        return out;
    }

    @Override
    public List<Room> findAll() {
        Set<String> codes = redis.opsForSet().members(ROOMS_SET);
        List<Room> out = new ArrayList<>();
        if (codes == null) return out;
        for (String code : codes) {
            Room room = find(code);
            if (room != null) out.add(room); // skip set members whose blob is already gone
        }
        return out;
    }

    @Override
    public String nextRoomCode() {
        // First INCR must yield 1000 (matching the in-memory counter's start).
        redis.opsForValue().setIfAbsent(SEQ_KEY, "999");
        Long n = redis.opsForValue().increment(SEQ_KEY);
        return "XQ" + Long.toString(n != null ? n : 1000, 36).toUpperCase();
    }

    // ------------------------------------------------------- matchmaking queue

    @Override
    public void enqueue(QueueEntry entry) {
        redis.opsForList().rightPush(QUEUE_LIST, writeEntry(entry));
    }

    @Override
    public void removeFromQueue(String sessionId) {
        List<String> all = redis.opsForList().range(QUEUE_LIST, 0, -1);
        if (all == null) return;
        for (String json : all) {
            QueueEntry entry = readEntry(json);
            if (entry != null && entry.sessionId().equals(sessionId)) {
                redis.opsForList().remove(QUEUE_LIST, 1, json);
            }
        }
    }

    @Override
    public List<QueueEntry> queue() {
        List<String> all = redis.opsForList().range(QUEUE_LIST, 0, -1);
        List<QueueEntry> out = new ArrayList<>();
        if (all == null) return out;
        for (String json : all) {
            QueueEntry entry = readEntry(json);
            if (entry != null) out.add(entry);
        }
        return out;
    }

    // ------------------------------------------------------- session -> room links

    @Override
    public void linkSession(String sessionId, String roomCode) {
        redis.opsForValue().set(SESSION_PREFIX + sessionId + ":room", roomCode);
    }

    @Override
    public String roomOf(String sessionId) {
        return redis.opsForValue().get(SESSION_PREFIX + sessionId + ":room");
    }

    @Override
    public void unlinkSession(String sessionId) {
        redis.delete(SESSION_PREFIX + sessionId + ":room");
    }

    // ------------------------------------------------------- mutual exclusion

    @Override
    public <T> T withLock(String key, Supplier<T> action) {
        String lockKey = LOCK_PREFIX + key;
        String token = UUID.randomUUID().toString();
        boolean acquired = false;
        for (int i = 0; i < LOCK_RETRIES && !acquired; i++) {
            acquired = Boolean.TRUE.equals(redis.opsForValue()
                    .setIfAbsent(lockKey, token, Duration.ofMillis(LOCK_TTL_MS)));
            if (!acquired) {
                try {
                    Thread.sleep(LOCK_RETRY_MS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        if (!acquired) {
            throw new IllegalStateException("timed out acquiring " + lockKey);
        }
        try {
            return action.get();
        } finally {
            // Token-checked release: only delete the lock if it is still ours.
            if (token.equals(redis.opsForValue().get(lockKey))) {
                redis.delete(lockKey);
            }
        }
    }

    // ---------------------------------------------------------------- serde

    private String writeEntry(QueueEntry entry) {
        try {
            return om.writeValueAsString(entry);
        } catch (Exception e) {
            throw new IllegalStateException("failed to serialize queue entry", e);
        }
    }

    private QueueEntry readEntry(String json) {
        try {
            return om.readValue(json, QueueEntry.class);
        } catch (Exception e) {
            return null; // skip undecodable entries rather than wedging the queue
        }
    }
}
