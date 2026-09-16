package com.xiangqi.room;

import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Map;

/**
 * Direct in-process delivery — the pre-Redis behavior. Personal queues go
 * straight to the per-session destination: subscriptions to /user/queue/* are
 * translated to "/queue/x-user<sessionId>" at subscribe time (no Principal
 * needed), and UserDestinationRewriteInterceptor restores the literal
 * "/user/queue/x" destination header on the wire for the client.
 */
public class InProcessEventBus implements RoomEventBus {

    private final SimpMessagingTemplate broker;

    public InProcessEventBus(SimpMessagingTemplate broker) {
        this.broker = broker;
    }

    @Override
    public void publishToRoom(String roomCode, Map<String, Object> payload) {
        broker.convertAndSend("/topic/room/" + roomCode, payload);
    }

    @Override
    public void publishToSession(String sessionId, String destination, Map<String, Object> payload) {
        broker.convertAndSend(destination + "-user" + sessionId, payload);
    }
}
