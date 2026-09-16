package com.xiangqi.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * JPA row backing the Elo ladder (table "players"). The id is the client's
 * stable localStorage player_id, so no account table is needed.
 */
@Entity
@Table(name = "players")
public class PlayerEntity {

    @Id
    @Column(length = 64)
    public String id;

    @Column(nullable = false)
    public String name;

    public int rating;
    public int wins;
    public int losses;
    public int draws;
    public int games;

    @Column(name = "last_seen", nullable = false)
    public Instant lastSeen;

    @Column(name = "updated_at", nullable = false)
    public Instant updatedAt;

    /** Public no-arg constructor: required by JPA and used by the store's mapper. */
    public PlayerEntity() {}

    public PlayerEntity(String id, String name, int rating, Instant now) {
        this.id = id;
        this.name = name;
        this.rating = rating;
        this.wins = 0;
        this.losses = 0;
        this.draws = 0;
        this.games = 0;
        this.lastSeen = now;
        this.updatedAt = now;
    }
}
