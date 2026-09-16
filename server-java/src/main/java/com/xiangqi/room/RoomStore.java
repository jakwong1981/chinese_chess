package com.xiangqi.room;

import java.util.List;
import java.util.function.Supplier;

/**
 * Room state storage seam. The in-memory implementation backs tests and the
 * optional single-process "memory" cluster mode; the Redis implementation
 * (com.xiangqi.cluster.RedisRoomStore) shares this state across replicas.
 *
 * All mutating RoomManager operations run inside withLock(code, ...) so a room
 * is only ever mutated by one instance at a time.
 */
public interface RoomStore {

    Room find(String code);

    void save(Room room);

    void delete(String code);

    /** All rooms currently in 'playing' status (ticked by every replica; the lock arbitrates). */
    List<Room> findPlaying();

    List<Room> findAll();

    /** Next room code ("XQ" + base36 sequence starting at 1000 — same format as the Node mock). */
    String nextRoomCode();

    // ------------------------------------------------------- matchmaking queue

    void enqueue(QueueEntry entry);

    void removeFromQueue(String sessionId);

    /** Queue entries in arrival order (oldest first). */
    List<QueueEntry> queue();

    // ------------------------------------------------------- session -> room links

    void linkSession(String sessionId, String roomCode);

    String roomOf(String sessionId);

    void unlinkSession(String sessionId);

    // ------------------------------------------------------- mutual exclusion

    /**
     * Runs the action while holding the given key's exclusive lock. In-memory:
     * a monitor. Redis: a short-lived SET NX PX lock with bounded retries.
     * Used for room codes and for the shared "queue" critical section.
     */
    <T> T withLock(String key, Supplier<T> action);
}
