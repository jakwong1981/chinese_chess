package com.xiangqi.ratings;

/**
 * Persistent player rating record. Field names match the JSON shape used by
 * the Node mock (data/ratings.json) so both backends share the same file.
 */
public class PlayerRecord {
    public String id;
    public String name;
    public int rating;
    public int wins;
    public int losses;
    public int draws;
    public int games;
    public String lastSeen;
    public String updatedAt;

    public PlayerRecord() {}

    public PlayerRecord(String id, String name, int rating, String nowIso) {
        this.id = id;
        this.name = name;
        this.rating = rating;
        this.wins = 0;
        this.losses = 0;
        this.draws = 0;
        this.games = 0;
        this.lastSeen = nowIso;
        this.updatedAt = nowIso;
    }
}
