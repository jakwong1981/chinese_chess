package com.xiangqi.cluster;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xiangqi.room.InMemoryRoomStore;
import com.xiangqi.room.InProcessEventBus;
import com.xiangqi.room.RoomEventBus;
import com.xiangqi.room.RoomStore;
import com.xiangqi.ws.SessionRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.messaging.simp.SimpMessagingTemplate;

/**
 * Selects the room-state / pub-sub backbone via "xiangqi.cluster.mode":
 *
 *   redis (default) — RedisRoomStore + RedisEventBus: room state, the queue,
 *                     locks and all outbound events flow through one Redis
 *                     database, so replicas behind a proxy share every room.
 *   memory          — InMemoryRoomStore + InProcessEventBus: the single-process
 *                     pair used by the test suite and quick local runs without
 *                     Docker.
 */
@Configuration
public class ClusterConfig {

    @Configuration
    @ConditionalOnProperty(name = "xiangqi.cluster.mode", havingValue = "redis", matchIfMissing = true)
    static class RedisMode {

        @Bean
        RoomStore roomStore(StringRedisTemplate redis, ObjectMapper om) {
            return new RedisRoomStore(redis, om);
        }

        @Bean
        RedisEventBus roomEventBus(StringRedisTemplate redis, ObjectMapper om,
                                   SimpMessagingTemplate broker, SessionRegistry sessions) {
            return new RedisEventBus(redis, om, broker, sessions);
        }

        @Bean
        RedisMessageListenerContainer redisMessageListenerContainer(RedisConnectionFactory connectionFactory,
                                                                    RedisEventBus bus) {
            RedisMessageListenerContainer container = new RedisMessageListenerContainer();
            container.setConnectionFactory(connectionFactory);
            container.addMessageListener(bus, new ChannelTopic(RedisEventBus.CHANNEL));
            return container;
        }
    }

    @Configuration
    @ConditionalOnProperty(name = "xiangqi.cluster.mode", havingValue = "memory")
    static class MemoryMode {

        @Bean
        RoomStore roomStore() {
            return new InMemoryRoomStore();
        }

        @Bean
        RoomEventBus roomEventBus(SimpMessagingTemplate broker) {
            return new InProcessEventBus(broker);
        }
    }
}
