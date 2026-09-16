package com.xiangqi.ws;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks live STOMP sessions: the CONNECT login name and the stable
 * client-supplied playerId that arrives inside SEND payloads
 * (mirrors the onSend hook in server/index.js).
 */
@Service
public class SessionRegistry {

    public static final class Info {
        public final String sessionId;
        public final String name;
        public volatile String playerId;

        Info(String sessionId, String name) {
            this.sessionId = sessionId;
            this.name = name;
        }
    }

    private final Map<String, Info> byId = new ConcurrentHashMap<>();

    public void connect(String sessionId, String login) {
        byId.put(sessionId, new Info(sessionId, login));
    }

    public void setPlayerId(String sessionId, String playerId) {
        Info info = byId.get(sessionId);
        if (info != null) info.playerId = playerId;
    }

    /** The player's stable id, falling back to the session id (mirrors `session.playerId || session.id`). */
    public String playerIdOr(String sessionId) {
        Info info = byId.get(sessionId);
        if (info != null && info.playerId != null && !info.playerId.isBlank()) return info.playerId;
        return sessionId;
    }

    public boolean isConnected(String sessionId) {
        return byId.containsKey(sessionId);
    }

    public void remove(String sessionId) {
        byId.remove(sessionId);
    }
}
