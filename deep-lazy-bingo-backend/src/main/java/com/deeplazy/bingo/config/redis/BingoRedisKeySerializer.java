package com.deeplazy.bingo.config.redis;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;

import org.springframework.data.redis.serializer.RedisSerializer;

/** Serializes only validated keys inside the application namespace. */
public final class BingoRedisKeySerializer implements RedisSerializer<String> {

    /** Encodes a logical key as a namespaced UTF-8 key, preserving null. */
    @Override
    public byte[] serialize(String value) {
        return value == null ? null : RedisKeyNames.key(value).getBytes(StandardCharsets.UTF_8);
    }

    /** Decodes a valid physical key and removes its namespace, preserving null. */
    @Override
    public String deserialize(byte[] bytes) {
        if (bytes == null) {
            return null;
        }
        String physical;
        try {
            physical = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException exception) {
            throw new IllegalArgumentException("Invalid Redis key");
        }
        if (!physical.startsWith(RedisKeyNames.PREFIX)) {
            throw new IllegalArgumentException("Invalid Redis key");
        }
        String logical = physical.substring(RedisKeyNames.PREFIX.length());
        RedisKeyNames.validate(logical);
        return logical;
    }
}