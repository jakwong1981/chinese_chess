package com.xiangqi;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xiangqi.persistence.PlayerRepository;
import com.xiangqi.ratings.RatingsStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Full-stack contract test: boots the Spring Boot backend on a random port and
 * drives it with two raw STOMP-over-WebSocket clients — exactly like the browser
 * (raw WebSocket, STOMP 1.2 frames, literal destination matching). Verifies:
 * - CONNECT/CONNECTED handshake with login header
 * - /user/queue/matchmaking + /user/queue/joined personal queues
 * - quick match pairs two players into a ranked room
 * - resign produces GAME_OVER with Elo rating deltas
 * - the leaderboard REST endpoint reflects the result
 * - ratings are truly database-backed (a fresh store instance sees them)
 * - static index page + shared rules module are served
 *
 * Runs on embedded H2 (see src/test/resources/application.yml) — no Docker needed.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class BackendIntegrationTest {

    @LocalServerPort
    int port;

    @Autowired
    PlayerRepository playerRepository;

    private static final ObjectMapper OM = new ObjectMapper();

    /** STOMP frame terminator (NUL). Written as an escape so the source stays clean ASCII. */
    private static final String STOMP_NUL = "\u0000";

    // ------------------------------------------------------- STOMP test client

    /** Minimal raw STOMP 1.2 client over java.net.http.WebSocket (mirrors net.js). */
    static final class StompTestClient implements WebSocket.Listener {
        private final BlockingQueue<Map<String, Object>> frames = new LinkedBlockingQueue<>();
        private final java.util.List<Map<String, Object>> allFrames =
                java.util.Collections.synchronizedList(new java.util.ArrayList<>());
        private final StringBuilder buffer = new StringBuilder();
        private WebSocket ws;

        void open(int port) {
            ws = HttpClient.newHttpClient()
                    .newWebSocketBuilder()
                    .buildAsync(URI.create("ws://localhost:" + port + "/ws"), this)
                    .join();
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            synchronized (buffer) {
                buffer.append(data);
                int nul;
                while ((nul = buffer.indexOf(STOMP_NUL)) >= 0) {
                    String raw = buffer.substring(0, nul);
                    buffer.delete(0, nul + 1);
                    if (!raw.isBlank()) {
                        Map<String, Object> f = parseFrame(raw);
                        frames.offer(f);
                        allFrames.add(f);
                    }
                }
            }
            webSocket.request(1);
            return null;
        }

        private static Map<String, Object> parseFrame(String raw) {
            int sep = raw.indexOf("\n\n");
            String head = sep >= 0 ? raw.substring(0, sep) : raw;
            String body = sep >= 0 ? raw.substring(sep + 2) : "";
            String[] lines = head.split("\n");
            Map<String, String> headers = new LinkedHashMap<>();
            for (int i = 1; i < lines.length; i++) {
                int c = lines[i].indexOf(':');
                if (c > 0) headers.put(lines[i].substring(0, c), lines[i].substring(c + 1));
            }
            Map<String, Object> frame = new LinkedHashMap<>();
            frame.put("command", lines[0]);
            frame.put("headers", headers);
            frame.put("body", body);
            return frame;
        }

        void sendFrame(String command, Map<String, String> headers, String body) {
            StringBuilder sb = new StringBuilder(command).append('\n');
            headers.forEach((k, v) -> sb.append(k).append(':').append(v).append('\n'));
            sb.append('\n');
            if (body != null) sb.append(body);
            sb.append(STOMP_NUL);
            ws.sendText(sb.toString(), true).join();
        }

        void connect(String login) {
            sendFrame("CONNECT", Map.of(
                    "accept-version", "1.2",
                    "host", "localhost",
                    "login", login,
                    "heart-beat", "0,0"), "");
        }

        void subscribe(String id, String destination) {
            sendFrame("SUBSCRIBE", Map.of("id", id, "destination", destination, "ack", "auto"), "");
        }

        void send(String destination, String json) {
            sendFrame("SEND", Map.of(
                    "destination", destination,
                    "content-type", "application/json",
                    "content-length", String.valueOf(json.getBytes(StandardCharsets.UTF_8).length)), json);
        }

        Map<String, Object> awaitCommand(String command) throws InterruptedException {
            long deadline = System.currentTimeMillis() + 10_000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> f = frames.poll(500, TimeUnit.MILLISECONDS);
                if (f != null && command.equals(f.get("command"))) return f;
            }
            throw new AssertionError("Timed out waiting for " + command + "; received frames: " + allFrames);
        }

        @SuppressWarnings("unchecked")
        JsonNode awaitMessage(String destination, String type) throws Exception {
            long deadline = System.currentTimeMillis() + 10_000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> f = frames.poll(500, TimeUnit.MILLISECONDS);
                if (f == null || !"MESSAGE".equals(f.get("command"))) continue;
                Map<String, String> headers = (Map<String, String>) f.get("headers");
                if (!destination.equals(headers.get("destination"))) continue;
                JsonNode body = OM.readTree((String) f.get("body"));
                if (type == null || type.equals(body.path("type").asText())) return withDestination(body, destination);
            }
            throw new AssertionError("Timed out waiting for " + destination + " type=" + type
                    + "; received frames: " + allFrames);
        }

        private static JsonNode withDestination(JsonNode body, String destination) {
            ((com.fasterxml.jackson.databind.node.ObjectNode) body).put("__destination", destination);
            return body;
        }

        void close() {
            if (ws != null) ws.sendClose(WebSocket.NORMAL_CLOSURE, "bye").join();
        }
    }

    // --------------------------------------------------------------- the test

    @Test
    void rankedQuickMatchEndToEnd() throws Exception {
        // --- alice connects and queues
        StompTestClient alice = new StompTestClient();
        alice.open(port);
        alice.connect("alice");
        alice.awaitCommand("CONNECTED");
        alice.subscribe("sub-0", "/user/queue/matchmaking");
        alice.subscribe("sub-1", "/user/queue/joined");
        alice.send("/app/match/quick", "{\"name\":\"alice\",\"playerId\":\"itest-alice\"}");
        JsonNode queued = alice.awaitMessage("/user/queue/matchmaking", null);
        assertEquals("queued", queued.get("status").asText());
        // The destination header must be the literal user queue (client matches on it).
        assertEquals("/user/queue/matchmaking", queued.get("__destination").asText());

        // --- bob connects and queues -> both get seated into a ranked room
        StompTestClient bob = new StompTestClient();
        bob.open(port);
        bob.connect("bob");
        bob.awaitCommand("CONNECTED");
        bob.subscribe("sub-0", "/user/queue/matchmaking");
        bob.subscribe("sub-1", "/user/queue/joined");
        bob.send("/app/match/quick", "{\"name\":\"bob\",\"playerId\":\"itest-bob\"}");

        JsonNode joinedA = alice.awaitMessage("/user/queue/joined", null);
        JsonNode joinedB = bob.awaitMessage("/user/queue/joined", null);
        assertEquals("/user/queue/joined", joinedA.get("__destination").asText());
        assertEquals(joinedA.get("roomCode").asText(), joinedB.get("roomCode").asText());
        assertNotEquals(joinedA.get("side").asText(), joinedB.get("side").asText());
        assertTrue(joinedA.get("ranked").asBoolean(), "quick match must be ranked");
        assertEquals(1200, joinedA.get("rating").get("rating").asInt());
        String room = joinedA.get("roomCode").asText();
        String redPlayer = "r".equals(joinedA.get("side").asText()) ? "alice" : "bob";

        // --- both subscribe to the room topic, then red resigns
        alice.subscribe("sub-2", "/topic/room/" + room);
        bob.subscribe("sub-2", "/topic/room/" + room);
        Thread.sleep(400); // let subscriptions land before the forfeit
        if ("alice".equals(redPlayer)) alice.send("/app/game/" + room + "/resign", "{}");
        else bob.send("/app/game/" + room + "/resign", "{}");

        JsonNode over = alice.awaitMessage("/topic/room/" + room, "GAME_OVER");
        assertEquals("resign", over.get("reason").asText());
        assertTrue(over.get("ranked").asBoolean());
        String winner = over.get("winner").asText();
        assertNotNull(winner);
        JsonNode deltas = over.get("ratings");
        assertNotNull(deltas, "ranked GAME_OVER must carry rating deltas");
        assertTrue(deltas.get(winner).get("delta").asInt() > 0, "winner gains rating");
        String loser = "r".equals(winner) ? "b" : "r";
        assertTrue(deltas.get(loser).get("delta").asInt() < 0, "loser drops rating");

        alice.close();
        bob.close();

        // --- the ladder reflects the result
        HttpClient http = HttpClient.newHttpClient();
        HttpResponse<String> lb = http.send(HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:" + port + "/api/v1/leaderboard")).build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(200, lb.statusCode());
        JsonNode players = OM.readTree(lb.body()).get("players");
        assertTrue(players.isArray());
        boolean foundAlice = false, foundBob = false;
        for (JsonNode p : players) {
            if ("itest-alice".equals(p.get("id").asText())) { foundAlice = true; assertEquals(1, p.get("games").asInt()); }
            if ("itest-bob".equals(p.get("id").asText())) { foundBob = true; assertEquals(1, p.get("games").asInt()); }
        }
        assertTrue(foundAlice && foundBob, "both players should be on the ladder");

        // --- the ladder is truly database-backed: a fresh store instance
        // (i.e. what a restart would construct) sees the same ratings.
        RatingsStore reloaded = new RatingsStore(playerRepository);
        assertEquals(1, reloaded.get("itest-alice").games);
        assertEquals(1, reloaded.get("itest-bob").games);
    }

    @Test
    void restEndpointsMatchTheNodeContract() throws Exception {
        HttpClient http = HttpClient.newHttpClient();
        String base = "http://localhost:" + port;

        // health
        HttpResponse<String> health = http.send(HttpRequest.newBuilder()
                .uri(URI.create(base + "/api/v1/health")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, health.statusCode());
        assertTrue(OM.readTree(health.body()).get("ok").asBoolean());

        // save a match
        HttpResponse<String> saved = http.send(HttpRequest.newBuilder()
                        .uri(URI.create(base + "/api/v1/matches/save"))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString("{\"mode\":\"offline\",\"history\":[1,2,3]}")).build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(200, saved.statusCode());
        String matchId = OM.readTree(saved.body()).get("matchId").asText();
        assertNotNull(matchId);

        // list contains the match with plies count
        HttpResponse<String> list = http.send(HttpRequest.newBuilder()
                .uri(URI.create(base + "/api/v1/matches")).build(), HttpResponse.BodyHandlers.ofString());
        JsonNode matches = OM.readTree(list.body()).get("matches");
        boolean found = false;
        for (JsonNode m : matches) {
            if (matchId.equals(m.get("matchId").asText())) { found = true; assertEquals(3, m.get("plies").asInt()); }
        }
        assertTrue(found, "saved match should be listed");

        // fetch by id
        HttpResponse<String> one = http.send(HttpRequest.newBuilder()
                .uri(URI.create(base + "/api/v1/matches/" + matchId)).build(), HttpResponse.BodyHandlers.ofString());
        assertTrue(OM.readTree(one.body()).get("ok").asBoolean());

        // unknown id -> 404 {ok:false,error:'not-found'}
        HttpResponse<String> missing = http.send(HttpRequest.newBuilder()
                .uri(URI.create(base + "/api/v1/matches/nope")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(404, missing.statusCode());
        assertEquals("not-found", OM.readTree(missing.body()).get("error").asText());

        // CORS preflight
        HttpResponse<String> preflight = http.send(HttpRequest.newBuilder()
                        .uri(URI.create(base + "/api/v1/health"))
                        .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                        .header("Origin", "http://example.com")
                        .header("Access-Control-Request-Method", "GET").build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals("*", preflight.headers().firstValue("Access-Control-Allow-Origin").orElse(null));
    }

    @Test
    void staticFilesAreServed() throws Exception {
        HttpClient http = HttpClient.newHttpClient();
        String base = "http://localhost:" + port;

        HttpResponse<String> index = http.send(HttpRequest.newBuilder()
                .uri(URI.create(base + "/")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, index.statusCode());
        assertTrue(index.body().contains("<"));

        HttpResponse<String> rules = http.send(HttpRequest.newBuilder()
                .uri(URI.create(base + "/shared/rules.js")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, rules.statusCode());
        assertTrue(rules.body().contains("initialBoard"));

        HttpResponse<String> missing = http.send(HttpRequest.newBuilder()
                .uri(URI.create(base + "/no-such-file.js")).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(404, missing.statusCode());
    }
}
