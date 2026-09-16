package com.xiangqi.ws;

import com.xiangqi.room.RoomManager;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * Routes STOMP disconnects to the room manager (forfeit on disconnect)
 * and drops the session from the registry.
 */
@Component
public class SessionEventsListener {

    private final RoomManager rooms;
    private final SessionRegistry sessions;

    public SessionEventsListener(RoomManager rooms, SessionRegistry sessions) {
        this.rooms = rooms;
        this.sessions = sessions;
    }

    @EventListener
    public void onDisconnect(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        if (sessionId == null) return;
        rooms.handleDisconnect(sessionId);
        sessions.remove(sessionId);
    }
}
