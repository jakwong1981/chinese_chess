package com.xiangqi.room;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Semantics of the single-process store — the same contract the Redis
 * implementation must honor (arrival-ordered queue, session links, the
 * base36 room-code sequence, and a mutually exclusive withLock).
 */
class InMemoryRoomStoreTest {

    @Test
    void queueKeepsArrivalOrderAndRemovesBySession() {
        InMemoryRoomStore store = new InMemoryRoomStore();
        store.enqueue(new QueueEntry("s1", "alice", "p1", 1));
        store.enqueue(new QueueEntry("s2", "bob", "p2", 2));
        store.enqueue(new QueueEntry("s3", "carol", "p3", 3));

        List<String> order = store.queue().stream().map(QueueEntry::sessionId).toList();
        assertEquals(List.of("s1", "s2", "s3"), order);

        store.removeFromQueue("s2");
        assertEquals(List.of("s1", "s3"), store.queue().stream().map(QueueEntry::sessionId).toList());

        store.removeFromQueue("no-such-session"); // no-op, no error
        assertEquals(2, store.queue().size());
    }

    @Test
    void sessionLinksTrackRoomMembership() {
        InMemoryRoomStore store = new InMemoryRoomStore();
        assertNull(store.roomOf("s1"));

        store.linkSession("s1", "XQAAA");
        assertEquals("XQAAA", store.roomOf("s1"));

        store.linkSession("s1", "XQBBB"); // re-link overwrites
        assertEquals("XQBBB", store.roomOf("s1"));

        store.unlinkSession("s1");
        assertNull(store.roomOf("s1"));
        store.unlinkSession("s1"); // idempotent
    }

    @Test
    void roomCodesFollowTheNodeFormatAndIncrease() {
        InMemoryRoomStore store = new InMemoryRoomStore();
        String first = store.nextRoomCode();
        String second = store.nextRoomCode();
        // Same base36 format as the Node mock; the sequence starts at 1000.
        assertEquals("XQ" + Integer.toString(1000, 36).toUpperCase(), first);
        assertNotEquals(first, second);
        assertTrue(second.startsWith("XQ"));
    }

    @Test
    void roomsSaveFindListAndDelete() {
        InMemoryRoomStore store = new InMemoryRoomStore();
        Room room = new Room();
        room.code = "XQT";
        store.save(room);

        assertSame(room, store.find("XQT"));
        assertEquals(1, store.findAll().size());
        assertTrue(store.findPlaying().isEmpty());

        room.status = Room.STATUS_PLAYING;
        store.save(room);
        assertEquals(1, store.findPlaying().size());

        store.delete("XQT");
        assertNull(store.find("XQT"));
        assertTrue(store.findAll().isEmpty());
    }

    @Test
    void withLockReturnsTheActionResult() {
        InMemoryRoomStore store = new InMemoryRoomStore();
        assertEquals("ok", store.withLock("some-key", () -> "ok"));
    }

    @Test
    void withLockSerializesConcurrentActions() throws Exception {
        InMemoryRoomStore store = new InMemoryRoomStore();
        int[] counter = {0}; // deliberately not atomic — the lock must protect it
        int threads = 4, increments = 1_000;
        Thread[] pool = new Thread[threads];
        for (int t = 0; t < threads; t++) {
            pool[t] = new Thread(() -> {
                for (int i = 0; i < increments; i++) {
                    store.withLock("counter", () -> {
                        counter[0]++;
                        return null;
                    });
                }
            });
        }
        for (Thread th : pool) th.start();
        for (Thread th : pool) th.join();
        assertEquals(threads * increments, counter[0]);
    }
}
