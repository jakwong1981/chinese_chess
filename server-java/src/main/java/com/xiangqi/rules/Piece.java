package com.xiangqi.rules;

/** A piece on the board. Immutable; boards copy the array but share piece instances. */
public record Piece(char side, char type, int id) {}
