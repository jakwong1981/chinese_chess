package com.xiangqi.rules;

/** A board move: source and destination coordinates (0-based, x = file, y = rank). */
public record Move(int fromX, int fromY, int toX, int toY) {}
