package com.xiangqi.room;

import java.util.Map;

/**
 * Outbound delivery seam for all STOMP traffic produced by room logic.
 * Every instance publishes through the bus; implementations guarantee delivery
 * to sessions connected to ANY replica (in-process for "memory" mode, Redis
 * pub/sub in "redis" mode). Destinations are the wire destinations the browser
 * client matches on ("/topic/room/{code}", "/user/queue/...").
 */
public interface RoomEventBus {

    /** Broadcast a payload to everyone subscribed to the room's topic. */
    void publishToRoom(String roomCode, Map<String, Object> payload);

    /** Deliver a payload to one session's personal queue ("/user/queue/..." destination). */
    void publishToSession(String sessionId, String destination, Map<String, Object> payload);
}
