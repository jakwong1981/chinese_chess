package com.xiangqi;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spring Boot drop-in replacement for the Node mock backend.
 * Implements the identical wire contract (REST /api/v1/* + STOMP-over-WebSocket /ws)
 * so the browser frontend works against either backend unchanged.
 */
@SpringBootApplication
public class XiangqiApplication {

    public static void main(String[] args) {
        SpringApplication.run(XiangqiApplication.class, args);
    }
}
