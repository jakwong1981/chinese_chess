package com.xiangqi.rules;

/** Pseudo-legal destination of a piece (mirrors pieceMoves() in shared/rules.js). */
public record PieceMove(int toX, int toY, boolean capture) {}
