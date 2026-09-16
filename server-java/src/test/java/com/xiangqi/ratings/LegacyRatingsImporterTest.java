package com.xiangqi.ratings;

import com.xiangqi.persistence.PlayerRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Covers the one-time migration from the Node mock's data/ratings.json into
 * PostgreSQL: import happens only when the ladder is empty, and never twice.
 */
@DataJpaTest
class LegacyRatingsImporterTest {

    private static final String LEGACY_JSON = """
            {
              "players": {
                "p1": {"id":"p1","name":"Legacy One","rating":1500,"wins":2,"losses":0,"draws":1,
                       "games":3,"lastSeen":"2026-09-01T10:00:00.000Z","updatedAt":"2026-09-01T10:00:00.000Z"},
                "p2": {"id":"p2","name":"Legacy Two","rating":1100,"wins":0,"losses":2,"draws":1,
                       "games":3,"lastSeen":"2026-09-01T10:00:00.000Z","updatedAt":"2026-09-01T10:00:00.000Z"}
              }
            }
            """;

    @Autowired
    PlayerRepository repo;

    @TempDir
    Path tempDir;

    private Path writeLegacyFile() throws Exception {
        Path file = tempDir.resolve("ratings.json");
        Files.writeString(file, LEGACY_JSON);
        return file;
    }

    @Test
    void importsLegacyJsonWhenTheLadderIsEmpty() throws Exception {
        RatingsStore store = new RatingsStore(repo);
        new LegacyRatingsImporter(store, writeLegacyFile().toString()).run(null);

        assertEquals(2, repo.count(), "both legacy players land in the database");
        assertEquals(1500, store.get("p1").rating);
        assertEquals(3, store.get("p2").games);

        // A fresh store instance (i.e. after restart) sees the imported ladder...
        assertNotNull(new RatingsStore(repo).get("p1"));
        // ...and a second import run is a no-op.
        new LegacyRatingsImporter(store, writeLegacyFile().toString()).run(null);
        assertEquals(2, repo.count());
    }

    @Test
    void skipsImportWhenTheLadderAlreadyHasPlayers() throws Exception {
        RatingsStore store = new RatingsStore(repo);
        store.register("existing", "Existing");

        new LegacyRatingsImporter(store, writeLegacyFile().toString()).run(null);

        assertEquals(1, repo.count(), "non-empty ladder is never overwritten");
        assertEquals(1200, store.get("existing").rating);
    }

    @Test
    void missingFileIsAQuietNoOp() {
        RatingsStore store = new RatingsStore(repo);
        new LegacyRatingsImporter(store, tempDir.resolve("nope.json").toString()).run(null);
        assertEquals(0, repo.count());
    }
}
