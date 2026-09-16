package com.xiangqi.rules;

/**
 * Result of evaluating the game state for the side to move
 * (mirrors gameStatus() in shared/rules.js).
 */
public record GameStatus(boolean over, String reason, Character winner, boolean inCheck, int moves) {}
