package com.xiangqi.ratings;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * One-time migration helper: if the ladder is empty and the legacy Node-mock
 * ratings file exists, import its records into PostgreSQL so the existing
 * ladder carries over. Runs once after the application context is ready.
 */
@Component
public class LegacyRatingsImporter implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LegacyRatingsImporter.class);

    private final RatingsStore ratings;
    private final Path legacyFile;
    private final ObjectMapper om = new ObjectMapper();

    public LegacyRatingsImporter(RatingsStore ratings,
                                 @Value("${xiangqi.ratings-file:../data/ratings.json}") String legacyFile) {
        this.ratings = ratings;
        this.legacyFile = Path.of(legacyFile);
    }

    @Override
    public void run(ApplicationArguments args) {
        if (ratings.size() > 0) return; // ladder already populated — nothing to do
        if (!Files.isRegularFile(legacyFile)) return;
        try {
            Map<String, Object> root = om.readValue(legacyFile.toFile(), new TypeReference<>() {});
            Object ps = root.get("players");
            if (!(ps instanceof Map<?, ?> map) || map.isEmpty()) return;
            List<PlayerRecord> records = new ArrayList<>();
            for (Map.Entry<?, ?> e : map.entrySet()) {
                PlayerRecord rec = om.convertValue(e.getValue(), PlayerRecord.class);
                if (rec != null && rec.id != null) records.add(rec);
            }
            if (records.isEmpty()) return;
            ratings.importLegacy(records);
            log.info("[ratings] imported {} legacy player(s) from {}", records.size(), legacyFile);
        } catch (Exception e) {
            log.warn("[ratings] legacy import skipped ({}); starting empty", e.getMessage());
        }
    }
}
