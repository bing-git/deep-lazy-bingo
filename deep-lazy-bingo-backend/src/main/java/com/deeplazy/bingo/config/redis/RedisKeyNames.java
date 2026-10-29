package com.deeplazy.bingo.config.redis;

import java.nio.charset.StandardCharsets;

/** Enforces the fixed application Redis namespace. */
public final class RedisKeyNames {

    public static final String PREFIX = "bingo_";
    private static final int MAX_LOGICAL_BYTES = 1024;

    private RedisKeyNames() {
    }

    /** Returns a validated physical key with exactly one added namespace. */
    public static String key(String logical) {
        if (logical == null) {
            throw new IllegalArgumentException("Invalid Redis key");
        }
        String suffix = logical.startsWith(PREFIX) ? logical.substring(PREFIX.length()) : logical;
        validate(suffix);
        return PREFIX + suffix;
    }

    /** Returns the namespace for a validated cache name. */
    public static String cachePrefix(String cacheName) {
        validate(cacheName);
        return PREFIX + cacheName + "::";
    }

    static void validate(String logical) {
        if (logical == null || logical.isBlank()
                || logical.getBytes(StandardCharsets.UTF_8).length > MAX_LOGICAL_BYTES
                || logical.codePoints().anyMatch(codePoint -> Character.isISOControl(codePoint)
                        || codePoint >= Character.MIN_SURROGATE && codePoint <= Character.MAX_SURROGATE)) {
            throw new IllegalArgumentException("Invalid Redis key");
        }
    }
}