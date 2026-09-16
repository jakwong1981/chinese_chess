package com.xiangqi.ws;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Rewrites Spring's internal user-destination form ("/queue/joined-user&lt;sessionId&gt;")
 * back to the literal destination the browser client subscribed to
 * ("/user/queue/joined"), so the client's destination-based dispatch keeps working.
 * Registered on the clientOutboundChannel.
 */
@Component
public class UserDestinationRewriteInterceptor implements ChannelInterceptor {

    private static final Pattern USER_DESTINATION = Pattern.compile("^/(queue|topic)/(.+)-user[^/]+$");

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        String dest = null;
        boolean mutable = accessor != null;
        if (mutable) {
            dest = accessor.getDestination();
        } else {
            Object header = message.getHeaders().get(SimpMessageHeaderAccessor.DESTINATION_HEADER);
            if (header instanceof String s) dest = s;
        }
        if (dest == null) return message;
        Matcher m = USER_DESTINATION.matcher(dest);
        if (!m.matches()) return message;
        String rewritten = "/user/" + m.group(1) + "/" + m.group(2);
        if (mutable) {
            accessor.setDestination(rewritten);
            return message;
        }
        return MessageBuilder.fromMessage(message)
                .setHeader(SimpMessageHeaderAccessor.DESTINATION_HEADER, rewritten)
                .build();
    }
}
