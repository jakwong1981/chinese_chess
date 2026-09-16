package com.xiangqi.cluster;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xiangqi.room.RoomEventBus;
import com.xiangqi.ws.SessionRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Redis pub/sub event bus — every outbound STOMP message produced by room logic
 * is published as a JSON envelope on the single shared channel "xq:bus":
 *
 *   {kind: "room",    room, payload}
 *   {kind: "session", session, destination, payload}
 *
 * Every instance publishes through Redis — including for its own sessions — so
 * ordering semantics are identical no matter which replica produces the event.
 * Each instance's listener delivers locally: room envelopes go to the room
 * topic (the simple broker no-ops when nobody here is subscribed), session
 * envelopes go to the per-session destination only when this instance owns the
 * session, and the existing outbound interceptor rewrites the destination
 * header back to the literal "/user/queue/..." form the client matches on.
 */
public class RedisEventBus implements RoomEventBus, MessageListener {

    public static final String CHANNEL = "xq:bus";

    private static final Logger log = LoggerFactory.getLogger(RedisEventBus.class);

    private final StringRedisTemplate redis;
    private final ObjectMapper om;
    private final SimpMessagingTemplate broker;
    private final SessionRegistry sessions;

    public RedisEventBus(StringRedisTemplate redis, ObjectMapper om,
                         SimpMessagingTemplate broker, SessionRegistry sessions) {
        this.redis = redis;
        this.om = om;
        this.broker = broker;
        this.sessions = sessions;
    }

    // ------------------------------------------------------------- publish side

    @Override
    public void publishToRoom(String roomCode, Map<String, Object> payload) {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("kind", "room");
        envelope.put("room", roomCode);
        envelope.put("payload", payload);
        publish(envelope);
    }

    @Override
    public void publishToSession(String sessionId, String destination, Map<String, Object> payload) {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("kind", "session");
        envelope.put("session", sessionId);
        envelope.put("destination", destination);
        envelope.put("payload", payload);
        publish(envelope);
    }

    private void publish(Map<String, Object> envelope) {
        try {
            redis.convertAndSend(CHANNEL, om.writeValueAsString(envelope));
        } catch (Exception e) {
            // Dropping an outbound event would desync clients; log loudly.
            log.error("[bus] publish to {} failed: {}", CHANNEL, e.getMessage());
        }
    }

    // ------------------------------------------------------------ listener side

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String body = new String(message.getBody(), StandardCharsets.UTF_8);
            @SuppressWarnings("unchecked")
            Map<String, Object> envelope = om.readValue(body, Map.class);
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = (Map<String, Object>) envelope.get("payload");
            Object kind = envelope.get("kind");
            if ("room".equals(kind)) {
                broker.convertAndSend("/topic/room/" + envelope.get("room"), payload);
            } else if ("session".equals(kind)) {
                Object sessionId = envelope.get("session");
                Object destination = envelope.get("destination");
                if (sessionId instanceof String sid && destination instanceof String dest
                        && sessions.isConnected(sid)) {
                    broker.convertAndSend(dest + "-user" + sid, payload);
                }
            }
        } catch (Exception e) {
            log.warn("[bus] dropped undeliverable envelope: {}", e.getMessage());
        }
    }
}
