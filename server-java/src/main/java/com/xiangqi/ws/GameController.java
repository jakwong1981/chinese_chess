package com.xiangqi.ws;

import com.xiangqi.room.RoomManager;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.util.Locale;
import java.util.Map;

/**
 * STOMP application destinations — mirror of routeSend() in server/index.js.
 * Client sends JSON bodies with content-type application/json (see public/js/net.js).
 */
@Controller
public class GameController {

    private final RoomManager rooms;

    public GameController(RoomManager rooms) {
        this.rooms = rooms;
    }

    @MessageMapping("/match/quick")
    public void quickMatch(SimpMessageHeaderAccessor accessor,
                           @Payload(required = false) Map<String, Object> payload) {
        rooms.quickMatch(accessor.getSessionId(), nameOf(payload));
    }

    @MessageMapping("/match/cancel")
    public void cancelMatch(SimpMessageHeaderAccessor accessor) {
        rooms.cancelMatchmaking(accessor.getSessionId());
    }

    @MessageMapping("/room/{code}/join")
    public void joinRoom(@DestinationVariable("code") String code,
                         SimpMessageHeaderAccessor accessor,
                         @Payload(required = false) Map<String, Object> payload) {
        rooms.joinByCode(accessor.getSessionId(), code.toUpperCase(Locale.ROOT), nameOf(payload));
    }

    @MessageMapping("/game/{code}/move")
    public void move(@DestinationVariable("code") String code,
                     SimpMessageHeaderAccessor accessor,
                     @Payload(required = false) Map<String, Object> payload) {
        rooms.handleMove(accessor.getSessionId(), code.toUpperCase(Locale.ROOT),
                payload != null ? payload : Map.of());
    }

    @MessageMapping("/game/{code}/resign")
    public void resign(@DestinationVariable("code") String code,
                       SimpMessageHeaderAccessor accessor) {
        rooms.handleResign(accessor.getSessionId(), code.toUpperCase(Locale.ROOT));
    }

    @MessageMapping("/game/{code}/undo/request")
    public void undoRequest(@DestinationVariable("code") String code,
                            SimpMessageHeaderAccessor accessor) {
        rooms.handleUndoRequest(accessor.getSessionId(), code.toUpperCase(Locale.ROOT));
    }

    @MessageMapping("/game/{code}/undo/respond")
    public void undoRespond(@DestinationVariable("code") String code,
                            SimpMessageHeaderAccessor accessor,
                            @Payload(required = false) Map<String, Object> payload) {
        boolean accept = payload != null && Boolean.TRUE.equals(asBoolean(payload.get("accept")));
        rooms.handleUndoResponse(accessor.getSessionId(), code.toUpperCase(Locale.ROOT), accept);
    }

    private static String nameOf(Map<String, Object> payload) {
        if (payload == null) return "player";
        Object name = payload.get("name");
        return name instanceof String s && !s.isBlank() ? s : "player";
    }

    private static Boolean asBoolean(Object v) {
        if (v instanceof Boolean b) return b;
        if (v instanceof String s) return Boolean.valueOf(s);
        if (v instanceof Number n) return n.intValue() != 0;
        return null;
    }
}
