package com.xiangqi.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xiangqi.persistence.MatchEntity;
import com.xiangqi.persistence.MatchRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * PostgreSQL-backed match store, mirroring the matchStore in server/index.js.
 * Records are opaque JSON maps with a few well-known keys; the flexible fields
 * (players/result/history/board) are stored as JSON text columns so the REST
 * contract stays identical — including explicit nulls.
 */
@Service
public class MatchStore {

    private final MatchRepository repo;
    private final ObjectMapper om = new ObjectMapper();

    public MatchStore(MatchRepository repo) {
        this.repo = repo;
    }

    public String save(Map<String, Object> payload) {
        Object requested = payload.get("matchId");
        String id = requested instanceof String s && !s.isBlank() ? s : generateId();
        Object mode = payload.get("mode");
        Object history = payload.get("history");
        if (!(history instanceof List)) history = List.of();

        MatchEntity e = new MatchEntity();
        e.matchId = id;
        e.savedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        e.mode = mode instanceof String s && !s.isEmpty() ? s : "offline";
        e.players = json(payload.get("players"));
        e.result = json(payload.get("result"));
        e.history = json(history);
        e.board = json(payload.get("board"));
        e.plies = ((List<?>) history).size();
        repo.save(e);
        return id;
    }

    /** Match summaries, newest first (same ordering as the Node mock). */
    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (MatchEntity e : repo.findAllByOrderBySavedAtDesc()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("matchId", e.matchId);
            row.put("savedAt", iso(e.savedAt));
            row.put("mode", e.mode);
            row.put("result", parse(e.result));
            row.put("players", parse(e.players));
            row.put("plies", e.plies);
            out.add(row);
        }
        return out;
    }

    public Map<String, Object> get(String id) {
        return repo.findById(id).map(this::toMap).orElse(null);
    }

    private Map<String, Object> toMap(MatchEntity e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("matchId", e.matchId);
        m.put("savedAt", iso(e.savedAt));
        m.put("mode", e.mode);
        m.put("players", parse(e.players));
        m.put("result", parse(e.result));
        m.put("history", parse(e.history));
        m.put("board", parse(e.board));
        return m;
    }

    private String json(Object value) {
        if (value == null) return null;
        try {
            return om.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("match payload is not JSON-serializable", e);
        }
    }

    private Object parse(String json) {
        if (json == null) return null;
        try {
            return om.readValue(json, Object.class);
        } catch (JsonProcessingException e) {
            return null; // unreachable in practice — stored values come from json() above
        }
    }

    private static String iso(Instant t) {
        return t.truncatedTo(ChronoUnit.MILLIS).toString();
    }

    private static String generateId() {
        return "m_" + Long.toString(System.currentTimeMillis(), 36)
                + "_" + Long.toString((long) (Math.random() * 36L * 36 * 36 * 36 * 36 * 36), 36);
    }
}
