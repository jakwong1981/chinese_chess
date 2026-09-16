package com.xiangqi.rules;

/** Fully legal move with metadata (mirrors legalMoves() entries in shared/rules.js). */
public record LegalMove(int fromX, int fromY, int toX, int toY,
                        char piece, boolean capture, Character captured) {}
