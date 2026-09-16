package com.xiangqi.room;

/**
 * One player waiting in the quick-match queue. The playerId is captured at
 * enqueue time because the session may live on a different replica when the
 * match is made — the matching instance cannot look it up locally.
 */
public record QueueEntry(String sessionId, String name, String playerId, long enqueuedAt) {
}
