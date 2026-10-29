package com.deeplazy.bingo.config.redis;

import java.time.Duration;

import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.ReactiveRedisConnectionFactory;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

/** Supplies string-only Redis infrastructure outside the isolated smoke profile. */
@Configuration(proxyBeanMethods = false)
@EnableCaching
@Profile("!smoke")
public class RedisInfrastructureConfiguration {

    /** Shares one namespaced synchronous template under both standard names. */
    @Bean(name = {"redisTemplate", "stringRedisTemplate"})
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory connectionFactory) {
        StringRedisTemplate template = new StringRedisTemplate();
        template.setConnectionFactory(connectionFactory);
        template.setDefaultSerializer(StringRedisSerializer.UTF_8);
        template.setKeySerializer(new BingoRedisKeySerializer());
        template.setHashKeySerializer(new BingoRedisKeySerializer());
        template.setValueSerializer(StringRedisSerializer.UTF_8);
        template.setHashValueSerializer(StringRedisSerializer.UTF_8);
        return template;
    }

    /** Shares one namespaced reactive template under both standard names. */
    @Bean(name = {"reactiveRedisTemplate", "reactiveStringRedisTemplate"})
    public ReactiveStringRedisTemplate reactiveStringRedisTemplate(ReactiveRedisConnectionFactory connectionFactory) {
        var serialization = RedisSerializationContext.<String, String>newSerializationContext(StringRedisSerializer.UTF_8)
                .key(new BingoRedisKeySerializer())
                .hashKey(new BingoRedisKeySerializer())
                .build();
        return new ReactiveStringRedisTemplate(connectionFactory, serialization);
    }

    /** Bounds cache lifetime and prohibits null or object-serialized values. */
    @Bean
    public RedisCacheConfiguration redisCacheConfiguration() {
        return RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(30))
                .disableCachingNullValues()
                .computePrefixWith(RedisKeyNames::cachePrefix)
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(StringRedisSerializer.UTF_8))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(StringRedisSerializer.UTF_8));
    }

    /** Uses the fixed namespace and bounded defaults for every cache. */
    @Bean
    public RedisCacheManager redisCacheManager(RedisConnectionFactory connectionFactory,
            RedisCacheConfiguration configuration) {
        return RedisCacheManager.builder(connectionFactory).cacheDefaults(configuration).build();
    }
}