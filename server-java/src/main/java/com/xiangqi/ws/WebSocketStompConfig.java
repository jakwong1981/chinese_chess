package com.xiangqi.ws;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP-over-WebSocket wiring that mirrors the Node mock broker:
 * - raw WebSocket endpoint at /ws (and /stomp) — no SockJS, the client uses new WebSocket()
 * - simple in-memory broker on /topic and /queue
 * - application destinations under /app
 * - user destinations under /user (for /user/queue/matchmaking, /user/queue/joined)
 * - slash-separated destination matching so /app/room/{code}/join works
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketStompConfig implements WebSocketMessageBrokerConfigurer {

    private final SessionChannelInterceptor sessionChannelInterceptor;
    private final UserDestinationRewriteInterceptor userDestinationRewriteInterceptor;

    public WebSocketStompConfig(SessionChannelInterceptor sessionChannelInterceptor,
                                UserDestinationRewriteInterceptor userDestinationRewriteInterceptor) {
        this.sessionChannelInterceptor = sessionChannelInterceptor;
        this.userDestinationRewriteInterceptor = userDestinationRewriteInterceptor;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws", "/stomp").setAllowedOriginPatterns("*");
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // The Node mock uses slash-separated destinations ("/app/game/XQ1234/move");
        // switch off Spring's default "." separator so those patterns keep working.
        config.setPathMatcher(new AntPathMatcher("/"));
        config.setApplicationDestinationPrefixes("/app");
        config.enableSimpleBroker("/topic", "/queue");
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(sessionChannelInterceptor);
    }

    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.interceptors(userDestinationRewriteInterceptor);
    }
}
