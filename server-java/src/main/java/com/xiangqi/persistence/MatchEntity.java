package com.xiangqi.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * JPA row for a saved match (table "matches"). The flexible payload fields
 * (players/result/history/board) are stored as JSON text so the REST contract
 * stays identical to the Node mock; NULL columns serialize back as explicit
 * JSON nulls, exactly like the mock's map-backed records.
 */
@Entity
@Table(name = "matches")
public class MatchEntity {

    @Id
    @Column(name = "match_id", length = 64)
    public String matchId;

    @Column(name = "saved_at", nullable = false)
    public Instant savedAt;

    @Column(nullable = false)
    public String mode;

    @Column(columnDefinition = "TEXT")
    public String players;

    @Column(columnDefinition = "TEXT")
    public String result;

    @Column(columnDefinition = "TEXT")
    public String history;

    @Column(columnDefinition = "TEXT")
    public String board;

    /** Cached ply count so list queries don't need to parse the history JSON. */
    public int plies;
}
