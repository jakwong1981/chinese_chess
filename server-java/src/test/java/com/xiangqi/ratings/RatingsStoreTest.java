package com.xiangqi.ratings;

import com.xiangqi.persistence.PlayerRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Port of the ratings cases from scripts/test.mjs, now backed by the real
 * persistence layer (H2 in PostgreSQL mode). Each test runs in its own
 * transaction, rolled back afterwards, so tests stay isolated.
 */
@DataJpaTest
class RatingsStoreTest {

    @Autowired
    PlayerRepository repo;

    private RatingsStore fresh() {
        return new RatingsStore(repo);
    }

    @Test
    void newPlayersStartAt1200AndRegisterIsIdempotent() {
        RatingsStore r = fresh();
        PlayerRecord a = r.register("alice", "Alice");
        assertEquals(1200, a.rating);
        assertEquals(0, a.games);
        PlayerRecord again = r.register("alice", "Alice Renamed");
        assertEquals(1200, again.rating);
        assertEquals(1, r.size());
    }

    @Test
    void rankedWinRaisesWinnerAndLowersLoser() {
        RatingsStore r = fresh();
        r.register("alice", null);
        r.register("bob", null);
        RatingUpdate res = r.recordResult("alice", "bob", 'r');
        assertTrue(res.r().rating() > 1200, "winner gains");
        assertTrue(res.b().rating() < 1200, "loser drops");
        assertTrue(res.r().delta() > 0 && res.b().delta() < 0);
        // Deltas should be ~zero-sum (rounding may differ by 1).
        assertTrue(Math.abs(res.r().delta() + res.b().delta()) <= 1);
        assertEquals(1, r.get("alice").wins);
        assertEquals(1, r.get("bob").losses);
    }

    @Test
    void beatingAStrongerPlayerIsWorthMore() {
        RatingsStore r = fresh();
        r.register("strong", null).rating = 1600;
        r.register("weak", null).rating = 1200;
        int gainVsStrong = r.recordResult("weak", "strong", 'r').r().delta(); // weak beats strong
        RatingsStore r2 = fresh();
        r2.register("strong2", null).rating = 1600;
        r2.register("weak2", null).rating = 1200;
        int lossVsStrong = r2.recordResult("strong2", "weak2", 'r').r().delta(); // strong beats weak
        assertTrue(gainVsStrong > lossVsStrong, "upset win is worth more");
    }

    @Test
    void leaderboardSortsByRatingAndOnlyListsPlayersWithGames() {
        RatingsStore r = fresh();
        r.register("alice", null);
        r.register("bob", null);
        r.register("carol", null);
        // carol has never played -> excluded from the ladder.
        r.recordResult("alice", "bob", 'r');
        r.recordResult("alice", "bob", 'r');
        List<Map<String, Object>> board = r.leaderboard(10);
        assertEquals(2, board.size());
        assertEquals("alice", board.get(0).get("id"));
        assertEquals(1, board.get(0).get("rank"));
        assertTrue((Integer) board.get(0).get("rating") > (Integer) board.get(1).get("rating"));
    }

    @Test
    void bestMatchPrefersTheClosestRating() {
        RatingsStore r = fresh();
        r.register("self", null).rating = 1300;
        r.register("far", null).rating = 2000;
        r.register("near", null).rating = 1350;
        assertEquals("near", r.bestMatch(List.of("far", "near"), "self"));
    }

    @Test
    void ratingsPersistAcrossStoreInstances() {
        RatingsStore r1 = fresh();
        r1.register("alice", null);
        r1.register("bob", null);
        r1.recordResult("alice", "bob", 'r');
        // A new store instance (i.e. after an app restart) sees the same ladder.
        RatingsStore r2 = new RatingsStore(repo);
        PlayerRecord a = r2.get("alice");
        assertNotNull(a);
        assertEquals(1, a.games);
        assertTrue(a.rating > 1200);
    }

    @Test
    void recordResultRejectsBlankIds() {
        RatingsStore r = fresh();
        assertNull(r.recordResult("", "bob", 'r'));
        assertNull(r.recordResult("alice", null, 'r'));
    }
}
