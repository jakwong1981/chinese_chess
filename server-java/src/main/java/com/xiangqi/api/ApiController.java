package com.xiangqi.api;

import com.xiangqi.ratings.PlayerRecord;
import com.xiangqi.ratings.RatingsStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * REST endpoints — same paths and JSON shapes as server/index.js:
 *   POST /api/v1/matches/save
 *   GET  /api/v1/matches
 *   GET  /api/v1/matches/{id}
 *   GET  /api/v1/leaderboard?limit=
 *   GET  /api/v1/ratings/{id}
 *   GET  /api/v1/health
 */
@RestController
@RequestMapping("/api/v1")
public class ApiController {

    private final MatchStore matches;
    private final RatingsStore ratings;

    public ApiController(MatchStore matches, RatingsStore ratings) {
        this.matches = matches;
        this.ratings = ratings;
    }

    @PostMapping("/matches/save")
    public Map<String, Object> saveMatch(@RequestBody(required = false) Map<String, Object> payload) {
        String id = matches.save(payload != null ? payload : Map.of());
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("matchId", id);
        return res;
    }

    @GetMapping("/matches")
    public Map<String, Object> listMatches() {
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("matches", matches.list());
        return res;
    }

    @GetMapping("/matches/{id}")
    public ResponseEntity<Map<String, Object>> getMatch(@PathVariable("id") String id) {
        Map<String, Object> match = matches.get(id);
        if (match == null) return notFound();
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("match", match);
        return ResponseEntity.ok(res);
    }

    @GetMapping("/leaderboard")
    public Map<String, Object> leaderboard(@RequestParam(name = "limit", required = false) Integer limit) {
        int n = limit == null ? 50 : Math.min(200, Math.max(1, limit));
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("players", ratings.leaderboard(n));
        return res;
    }

    @GetMapping("/ratings/{id}")
    public ResponseEntity<Map<String, Object>> getRating(@PathVariable("id") String id) {
        PlayerRecord rec = ratings.get(id);
        if (rec == null) return notFound();
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("player", rec);
        return ResponseEntity.ok(res);
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", true);
        res.put("ts", System.currentTimeMillis());
        return res;
    }

    private static ResponseEntity<Map<String, Object>> notFound() {
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("ok", false);
        res.put("error", "not-found");
        return ResponseEntity.status(404).body(res);
    }
}
