package com.xiangqi.ws;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

/**
 * Inbound channel interceptor:
 * - CONNECT: registers the session (login name) in the SessionRegistry.
 * - SEND: captures the client-supplied playerId from the JSON payload
 *   (mirrors the onSend hook in server/index.js).
 */
@Component
public class SessionChannelInterceptor implements ChannelInterceptor {

    private static final int MAX_PLAYER_ID = 64;

    private final SessionRegistry sessions;
    private final ObjectMapper om = new ObjectMapper();

    public SessionChannelInterceptor(SessionRegistry sessions) {
        this.sessions = sessions;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        String sessionId = accessor.getSessionId();
        if (sessionId == null) return message;
        StompCommand command = accessor.getCommand();
        if (StompCommand.CONNECT.equals(command)) {
            String login = accessor.getFirstNativeHeader("login");
            sessions.connect(sessionId, login);
            // Note: we deliberately do NOT try to install a Principal here. The accessor
            // visible to inbound interceptors is a detached copy (StompHeaderAccessor.wrap),
            // so setUser would be lost; personal queues are addressed directly instead
            // (see RoomManager.sendToUser).
        } else if (StompCommand.SEND.equals(command)) {
            capturePlayerId(sessionId, message.getPayload());
        }
        return message;
    }

    private void capturePlayerId(String sessionId, Object payload) {
        byte[] bytes = null;
        if (payload instanceof byte[] b) bytes = b;
        else if (payload instanceof String s) bytes = s.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        if (bytes == null || bytes.length == 0 || bytes.length > 8192) return;
        try {
            JsonNode node = om.readTree(bytes);
            JsonNode pid = node.get("playerId");
            if (pid != null && pid.isTextual() && !pid.asText().isBlank()) {
                String id = pid.asText();
                sessions.setPlayerId(sessionId, id.length() > MAX_PLAYER_ID ? id.substring(0, MAX_PLAYER_ID) : id);
            }
        } catch (Exception ignored) {
            // Non-JSON or malformed payload — nothing to capture.
        }
    }
}
