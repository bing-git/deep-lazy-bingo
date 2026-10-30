package com.deeplazy.bingo.config.redis;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipFile;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.boot.autoconfigure.AutoConfigurationPackages;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCache;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.ReactiveRedisTemplate;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class RedisNamespaceTest {

    private static final String PACKAGE = "com.deeplazy.bingo.config.redis.";

    @Test
    void normalizesExactlyOnceWithFixedPrefix() throws Exception {
        assertThat(key("entry")).isEqualTo("bingo_entry");
        assertThat(key("bingo_entry")).isEqualTo("bingo_entry");
        assertThat(key(key("entry"))).isEqualTo("bingo_entry");
        assertThat(Class.forName(PACKAGE + "RedisKeyNames").getField("PREFIX").get(null))
                .isEqualTo("bingo_");
    }

    @Test
    void serializesUtf8AndPreservesUnicodeRoundTrip() throws Exception {
        RedisSerializer<String> serializer = serializer();
        String logical = "\u5bb6\u5ead:\ud83c\udf31";
        assertThat(serializer.serialize(logical)).isEqualTo(bytes("bingo_" + logical));
        assertThat(serializer.deserialize(serializer.serialize(logical))).isEqualTo(logical);
        assertThat(serializer.serialize("bingo_entry")).isEqualTo(bytes("bingo_entry"));
    }

    @Test
    void nullSerializerValuesRemainNull() throws Exception {
        assertThat(serializer().serialize(null)).isNull();
        assertThat(serializer().deserialize(null)).isNull();
    }

    @Test
    void rejectsEmptyBlankControlAndOversizedKeysWithoutReflectingInput() throws Exception {
        RedisSerializer<String> serializer = serializer();
        for (String invalid : List.of("", " ", "bingo_", "private\nmarker", "private\u007fmarker",
                "private\u0085marker", "x".repeat(1025), "\u754c".repeat(342))) {
            assertThatThrownBy(() -> serializer.serialize(invalid))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("Invalid Redis key");
        }
        assertThatThrownBy(() -> key(null)).hasRootCauseInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsForeignMalformedAndInvalidPhysicalKeys() throws Exception {
        RedisSerializer<String> serializer = serializer();
        for (byte[] invalid : List.of(bytes("other_private"), bytes("bingo_"), bytes("bingo_a\n"),
                bytes("bingo_" + "x".repeat(1025)), new byte[] {(byte) 0xc3, (byte) 0x28})) {
            assertThatThrownBy(() -> serializer.deserialize(invalid))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessage("Invalid Redis key");
        }
    }

    @Test
    void acceptsBoundedLogicalUtf8Keys() throws Exception {
        RedisSerializer<String> serializer = serializer();
        String maximum = "x".repeat(1024);
        assertThat(serializer.deserialize(serializer.serialize(maximum))).isEqualTo(maximum);
        assertThat(serializer.serialize("\u754c".repeat(341))).hasSize(1029);
    }

    @Test
    void buildsDeterministicCachePrefixes() throws Exception {
        for (String name : List.of("alpha", "beta", "bingo_gamma", "\u7f13\u5b58")) {
            assertThat(cachePrefix(name)).isEqualTo("bingo_" + name + "::");
        }
        assertThatThrownBy(() -> cachePrefix("private\nmarker"))
                .hasRootCauseInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void synchronousAliasesShareSafeKeyHashAndValueSerializers() throws Exception {
        runner().run(context -> {
            assertThat(context).hasNotFailed();
            StringRedisTemplate template = context.getBean("stringRedisTemplate", StringRedisTemplate.class);
            assertThat(context.getBean("redisTemplate")).isSameAs(template);
            assertThat(context.getBeansOfType(RedisTemplate.class)).hasSize(1);
            assertSafeSerializer(template.getKeySerializer());
            assertSafeSerializer(template.getHashKeySerializer());
            assertThat(template.getValueSerializer()).isInstanceOf(StringRedisSerializer.class);
            assertThat(template.getHashValueSerializer()).isInstanceOf(StringRedisSerializer.class);
            assertThat(template.getDefaultSerializer()).isInstanceOf(StringRedisSerializer.class);
        });
    }

    @Test
    void reactiveAliasesPreventUnsafeBootDefaults() throws Exception {
        runner().run(context -> {
            assertThat(context).hasNotFailed();
            ReactiveStringRedisTemplate template = context.getBean("reactiveRedisTemplate", ReactiveStringRedisTemplate.class);
            assertThat(context.getBean("reactiveStringRedisTemplate")).isSameAs(template);
            assertThat(context.getBeansOfType(ReactiveRedisTemplate.class)).hasSize(1);
            var serialization = template.getSerializationContext();
            assertThat(serialization.getKeySerializationPair().write("entry"))
                    .isEqualTo(ByteBuffer.wrap(bytes("bingo_entry")));
            assertThat(serialization.getHashKeySerializationPair().write("field"))
                    .isEqualTo(ByteBuffer.wrap(bytes("bingo_field")));
            assertThat(serialization.getValueSerializationPair().write("value"))
                    .isEqualTo(ByteBuffer.wrap(bytes("value")));
            assertThat(serialization.getHashValueSerializationPair().write("value"))
                    .isEqualTo(ByteBuffer.wrap(bytes("value")));
        });
    }

    @Test
    void cacheManagerUsesBoundedStringOnlyNamespacedConfiguration() throws Exception {
        runner().run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(CacheManager.class)).isInstanceOf(RedisCacheManager.class);
            RedisCacheConfiguration configuration = context.getBean(RedisCacheConfiguration.class);
                assertThat(configuration.getTtlFunction().getTimeToLive("entry", "value"))
                    .isEqualTo(Duration.ofMinutes(30));
            assertThat(configuration.getAllowCacheNullValues()).isFalse();
            for (String name : List.of("alpha", "beta", "bingo_gamma")) {
                assertThat(configuration.getKeyPrefixFor(name)).isEqualTo("bingo_" + name + "::");
                assertThat(((RedisCache) context.getBean(RedisCacheManager.class).getCache(name))
                        .getCacheConfiguration().getKeyPrefixFor(name)).isEqualTo("bingo_" + name + "::");
            }
            assertThat(configuration.getValueSerializationPair().write("value"))
                    .isEqualTo(ByteBuffer.wrap(bytes("value")));
            assertThatThrownBy(() -> configuration.getValueSerializationPair().write(new Object()))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("Cannot serialize value");
        });
    }

    @Test
    void namespaceCannotBeOverriddenAndContextDoesNotConnect() throws Exception {
        runner().withPropertyValues("bingo.redis.prefix=foreign_", "spring.cache.redis.key-prefix=foreign_")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertSafeSerializer(context.getBean(StringRedisTemplate.class).getKeySerializer());
                    LettuceConnectionFactory factory = context.getBean(LettuceConnectionFactory.class);
                    verify(factory, never()).getConnection();
                    verify(factory, never()).getReactiveConnection();
                });
    }

    @Test
    void isolatedProfilesOmitInfrastructureWithoutConnectionFactory() throws Exception {
        for (String profile : List.of("smoke", "desktop")) {
            new ApplicationContextRunner().withUserConfiguration(configurationClass())
                .withPropertyValues("spring.profiles.active=" + profile)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(RedisTemplate.class)
                            .doesNotHaveBean(ReactiveRedisTemplate.class).doesNotHaveBean(CacheManager.class);
                    assertThat(context.getBeansWithAnnotation(Configuration.class)).doesNotContainKey("redisInfrastructureConfiguration");
                });
        }
    }

    private ApplicationContextRunner runner() throws Exception {
        return new ApplicationContextRunner().withConfiguration(redisAutoConfigurations())
                .withInitializer(context -> AutoConfigurationPackages.register(
                    (BeanDefinitionRegistry) context.getBeanFactory(), "com.deeplazy.bingo"))
                .withUserConfiguration(configurationClass())
                .withBean(LettuceConnectionFactory.class, () -> mock(LettuceConnectionFactory.class));
    }

    private AutoConfigurations redisAutoConfigurations() throws Exception {
        List<Class<?>> configurations = new ArrayList<>();
        var location = DataRedisAutoConfiguration.class.getProtectionDomain().getCodeSource().getLocation();
        try (ZipFile archive = new ZipFile(java.nio.file.Path.of(location.toURI()).toFile())) {
            for (var entry : archive.stream().filter(entry -> entry.getName().startsWith(
                    "org/springframework/boot/data/redis/autoconfigure/")
                    && entry.getName().endsWith("AutoConfiguration.class")).toList()) {
                configurations.add(Class.forName(entry.getName().replace('/', '.')
                        .replace(".class", "")));
            }
        }
        assertThat(configurations).contains(DataRedisAutoConfiguration.class);
        assertThat(configurations).anyMatch(type -> type.getSimpleName().contains("Reactive"));
        return AutoConfigurations.of(configurations.toArray(Class<?>[]::new));
    }

    private Class<?> configurationClass() throws Exception {
        return Class.forName(PACKAGE + "RedisInfrastructureConfiguration");
    }

    @SuppressWarnings("unchecked")
    private RedisSerializer<String> serializer() throws Exception {
        return (RedisSerializer<String>) Class.forName(PACKAGE + "BingoRedisKeySerializer")
                .getConstructor().newInstance();
    }

    private String key(String logical) throws Exception {
        return (String) Class.forName(PACKAGE + "RedisKeyNames").getMethod("key", String.class)
                .invoke(null, logical);
    }

    private String cachePrefix(String name) throws Exception {
        return (String) Class.forName(PACKAGE + "RedisKeyNames").getMethod("cachePrefix", String.class)
                .invoke(null, name);
    }

    @SuppressWarnings("unchecked")
    private void assertSafeSerializer(RedisSerializer<?> candidate) {
        assertThat(candidate).hasSameClassAs(uncheckedSerializer());
        assertThat(((RedisSerializer<String>) candidate).serialize("entry"))
                .isEqualTo(bytes("bingo_entry"));
    }

    private RedisSerializer<String> uncheckedSerializer() {
        try {
            return serializer();
        } catch (Exception exception) {
            throw new AssertionError("Missing namespace serializer", exception);
        }
    }

    private byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }
}