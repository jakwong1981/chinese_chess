package com.xiangqi.ratings;

import com.xiangqi.persistence.PlayerEntity;
import com.xiangqi.persistence.PlayerRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * PostgreSQL-backed Elo ladder for online (ranked) matches — port of server/ratings.js.
 * The database is the source of truth; an in-memory cache keeps the hot reads
 * (leaderboard, matchmaking window) cheap, and all writes go straight through.
 * Every ranked game updates both players' ratings; casual games never touch the ladder.
 */
@Service
public class RatingsStore {

    private static final Logger log = LoggerFactory.getLogger(RatingsStore.class);

    public static final int START_RATING = 1200;
    public static final int K_FACTOR = 32;
    public static final int MATCH_WINDOW = 300; // default rating band for matchmaking

    private final PlayerRepository repo;
    private final Map<String, PlayerRecord> players = new ConcurrentHashMap<>();

    public RatingsStore(PlayerRepository repo) {
        this.repo = repo;
        reload();
    }

    /** (Re)load the cache from the database — the DB is the source of truth. */
    public final void reload() {
        players.clear();
        for (PlayerEntity e : repo.findAll()) players.put(e.id, toRecord(e));
        log.info("[ratings] loaded {} player(s) from the database", players.size());
    }

    private static String nowIso() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();
    }

    private static Instant parseIso(String iso) {
        return iso != null ? Instant.parse(iso) : Instant.now();
    }

    private static PlayerRecord toRecord(PlayerEntity e) {
        PlayerRecord r = new PlayerRecord();
        r.id = e.id;
        r.name = e.name;
        r.rating = e.rating;
        r.wins = e.wins;
        r.losses = e.losses;
        r.draws = e.draws;
        r.games = e.games;
        r.lastSeen = e.lastSeen.truncatedTo(ChronoUnit.MILLIS).toString();
        r.updatedAt = e.updatedAt.truncatedTo(ChronoUnit.MILLIS).toString();
        return r;
    }

    private static PlayerEntity toEntity(PlayerRecord r) {
        PlayerEntity e = new PlayerEntity();
        e.id = r.id;
        e.name = r.name;
        e.rating = r.rating;
        e.wins = r.wins;
        e.losses = r.losses;
        e.draws = r.draws;
        e.games = r.games;
        e.lastSeen = parseIso(r.lastSeen);
        e.updatedAt = parseIso(r.updatedAt);
        return e;
    }

    private PlayerRecord ensure(String id, String name) {
        if (id == null || id.isBlank()) return null;
        PlayerRecord rec = players.computeIfAbsent(id, k -> new PlayerRecord(k, name != null ? name : k, START_RATING, nowIso()));
        if (name != null && !name.isBlank()) rec.name = name;
        rec.lastSeen = nowIso();
        return rec;
    }

    /** Called when a player connects / joins so their record exists. */
    public PlayerRecord register(String id, String name) {
        PlayerRecord rec = ensure(id, name);
        if (rec != null) repo.save(toEntity(rec));
        return rec;
    }

    public PlayerRecord get(String id) {
        return players.get(id);
    }

    public int ratingOf(String id) {
        PlayerRecord rec = players.get(id);
        return rec != null ? rec.rating : START_RATING;
    }

    /** Visible for tests. */
    public int size() {
        return players.size();
    }

    /**
     * Record a completed ranked game.
     * winner is 'r', 'b', or null (draw).
     * Returns new ratings and deltas for both sides, or null on bad input.
     */
    @Transactional
    public synchronized RatingUpdate recordResult(String redId, String blackId, Character winner) {
        PlayerRecord red = ensure(redId, null);
        PlayerRecord black = ensure(blackId, null);
        if (red == null || black == null) return null;

        double scoreR = winner == null ? 0.5 : (winner == 'r' ? 1.0 : 0.0);
        double scoreB = 1.0 - scoreR;
        double expR = 1.0 / (1.0 + Math.pow(10.0, (black.rating - red.rating) / 400.0));
        double expB = 1.0 - expR;
        int deltaR = (int) Math.round(K_FACTOR * (scoreR - expR));
        int deltaB = (int) Math.round(K_FACTOR * (scoreB - expB));

        red.rating += deltaR;
        black.rating += deltaB;
        red.games++;
        black.games++;
        if (winner != null && winner == 'r') { red.wins++; black.losses++; }
        else if (winner != null && winner == 'b') { black.wins++; red.losses++; }
        else { red.draws++; black.draws++; }
        red.updatedAt = nowIso();
        black.updatedAt = nowIso();

        repo.save(toEntity(red));
        repo.save(toEntity(black));
        return new RatingUpdate(
                new RatingUpdate.RatingSide(red.id, red.name, red.rating, deltaR),
                new RatingUpdate.RatingSide(black.id, black.name, black.rating, deltaB));
    }

    /** Bulk-import legacy records (one-time migration from the Node mock's JSON file). */
    @Transactional
    public void importLegacy(List<PlayerRecord> records) {
        for (PlayerRecord r : records) {
            repo.save(toEntity(r));
            players.put(r.id, r);
        }
    }

    /** Top N players by rating, most games first on ties. Only players with games are listed. */
    public List<Map<String, Object>> leaderboard(int limit) {
        List<PlayerRecord> list = new ArrayList<>(players.values());
        list.removeIf(p -> p.games <= 0);
        list.sort((a, b) -> b.rating != a.rating ? Integer.compare(b.rating, a.rating)
                                                 : Integer.compare(b.games, a.games));
        List<Map<String, Object>> out = new ArrayList<>();
        int rank = 1;
        for (PlayerRecord p : list) {
            if (out.size() >= limit) break;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("rank", rank++);
            row.put("id", p.id);
            row.put("name", p.name);
            row.put("rating", p.rating);
            row.put("wins", p.wins);
            row.put("losses", p.losses);
            row.put("draws", p.draws);
            row.put("games", p.games);
            out.add(row);
        }
        return out;
    }

    /** Pick the best match for selfId from queued player ids (simple rating window). */
    public String bestMatch(List<String> candidateIds, String selfId) {
        int selfRating = ratingOf(selfId);
        String best = null;
        int bestGap = Integer.MAX_VALUE;
        for (String cid : candidateIds) {
            if (cid == null || cid.equals(selfId)) continue;
            int gap = Math.abs(ratingOf(cid) - selfRating);
            if (gap < bestGap) { bestGap = gap; best = cid; }
        }
        // Accept the closest opponent; a soft window keeps queue times short in MVP.
        if (bestGap <= MATCH_WINDOW) return best;
        return candidateIds.isEmpty() ? null : candidateIds.get(0);
    }
}
