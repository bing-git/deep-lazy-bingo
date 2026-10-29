package com.deeplazy.bingo;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;
import org.springframework.data.redis.connection.ReactiveRedisConnectionFactory;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.address=127.0.0.1",
        "logging.level.org.springframework.boot.security.autoconfigure=ERROR"
})
@ActiveProfiles("smoke")
class SmokeProfileTests {

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private ObjectMapper objectMapper;

    @LocalServerPort
    private int port;

    @Test
    void startsWithoutDatabaseOrRedisInfrastructure() {
        assertThat(applicationContext.getBeansOfType(DataSource.class)).isEmpty();
        assertThat(applicationContext.getBeansOfType(RedisConnectionFactory.class)).isEmpty();
        assertThat(applicationContext.getBeansOfType(ReactiveRedisConnectionFactory.class)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"/actuator/health", "/actuator/health/liveness", "/actuator/health/readiness"})
    void healthProbesAreUpWithoutExposingComponents(String path) throws Exception {
        var response = request("GET", path, null);
        assertThat(response.statusCode()).isEqualTo(200);
        var body = objectMapper.readTree(response.body());
        assertThat(body.has("components")).isFalse();
        assertThat(body.has("details")).isFalse();
        assertThat(body.path("status").asString()).isEqualTo("UP");
        assertThat(response.headers().firstValue("X-Request-Id")).isPresent();
    }

    @Test
    void protectedEndpointRejectsRequestsWithSafeProblemAndRequestId() throws Exception {
        var response = request("GET", "/api/v1/system/capabilities", "smoke-contract-1");
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).contains("application/problem+json");
        assertThat(response.headers().firstValue("X-Request-Id")).contains("smoke-contract-1");
        var body = objectMapper.readTree(response.body());
        assertThat(body.path("status").asInt()).isEqualTo(401);
        assertThat(body.path("detail").asString()).isEqualTo("Authentication required.");
        assertThat(body.path("requestId").asString()).isEqualTo("smoke-contract-1");
    }

    @Test
    void oversizedRequestIdIsReplacedOverHttp() throws Exception {
        var response = request("GET", "/actuator/health/liveness", "x".repeat(65));
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("X-Request-Id").orElseThrow())
                .matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    }

    @Test
    void headProbeIsPublicAndHasNoBody() throws Exception {
        var response = request("HEAD", "/actuator/health/liveness", null);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEmpty();
    }

    private HttpResponse<String> request(String method, String path, String requestId) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10))
                .method(method, HttpRequest.BodyPublishers.noBody());
        if (requestId != null) {
            builder.header("X-Request-Id", requestId);
        }
        try (var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()) {
            return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        }
    }
}