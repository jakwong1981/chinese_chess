package com.xiangqi.room;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

/**
 * Single-process RoomStore — the pre-Redis behavior, extracted as-is.
 * Used by the test suite and the optional "memory" cluster mode.
 */
public class InMemoryRoomStore implements RoomStore {

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final List<QueueEntry> queue = new ArrayList<>();
    private final Map<String, String> playerRooms = new ConcurrentHashMap<>();
    private final AtomicInteger roomSeq = new AtomicInteger(1000);

    @Override
    public Room find(String code) {
        return rooms.get(code);
    }

    @Override
    public void save(Room room) {
        rooms.put(room.code, room);
    }

    @Override
    public void delete(String code) {
        rooms.remove(code);
    }

    @Override
    public synchronized List<Room> findPlaying() {
        List<Room> out = new ArrayList<>();
        for (Room r : rooms.values()) {
            if (Room.STATUS_PLAYING.equals(r.status)) out.add(r);
        }
        return out;
    }

    @Override
    public synchronized List<Room> findAll() {
        return new ArrayList<>(rooms.values());
    }

    @Override
    public String nextRoomCode() {
        return "XQ" + Integer.toString(roomSeq.getAndIncrement(), 36).toUpperCase();
    }

    @Override
    public synchronized void enqueue(QueueEntry entry) {
        queue.add(entry);
    }

    @Override
    public synchronized void removeFromQueue(String sessionId) {
        queue.removeIf(q -> q.sessionId().equals(sessionId));
    }

    @Override
    public synchronized List<QueueEntry> queue() {
        return new ArrayList<>(queue);
    }

    @Override
    public void linkSession(String sessionId, String roomCode) {
        playerRooms.put(sessionId, roomCode);
    }

    @Override
    public String roomOf(String sessionId) {
        return playerRooms.get(sessionId);
    }

    @Override
    public void unlinkSession(String sessionId) {
        playerRooms.remove(sessionId);
    }

    /** Global monitor — mirrors the RoomManager-wide synchronized of the pre-Redis code. */
    @Override
    public <T> T withLock(String key, Supplier<T> action) {
        synchronized (this) {
            return action.get();
        }
    }
}
