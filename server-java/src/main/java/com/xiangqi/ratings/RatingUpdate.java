package com.xiangqi.ratings;

/**
 * Result of a completed ranked game: new ratings and deltas for both sides.
 * Serialized into the GAME_OVER payload exactly like the Node mock does.
 */
public record RatingUpdate(RatingSide r, RatingSide b) {

    public record RatingSide(String id, String name, int rating, int delta) {}
}
