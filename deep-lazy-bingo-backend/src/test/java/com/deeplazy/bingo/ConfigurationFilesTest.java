package com.deeplazy.bingo;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ConfigurationFilesTest {
    @Test
    void runtimeClasspathDoesNotRetainOldPropertiesResources() {
        ClassLoader loader = getClass().getClassLoader();
        assertThat(loader.getResource("application.properties")).isNull();
        assertThat(loader.getResource("application-smoke.properties")).isNull();
        assertThat(loader.getResource("application-test.properties")).isNull();
    }

    @Test
    void applicationConfigurationUsesYamlWithDirectValues() throws Exception {
        for (String root : new String[] {"src/main/resources", "src/test/resources"}) {
            try (var files = Files.walk(Path.of(root))) {
                for (Path file : files.filter(Files::isRegularFile).toList()) {
                    if (file.getFileName().toString().startsWith("application")) {
                        assertThat(file.toString()).endsWith(".yml");
                        assertThat(Files.readString(file)).doesNotContain("${");
                    }
                }
            }
        }
        assertThat(Path.of("src/main/resources/application.yml")).isRegularFile();
        assertThat(Path.of("src/main/resources/application-smoke.yml")).isRegularFile();
        assertThat(Path.of("src/test/resources/application-test.yml")).isRegularFile();
    }
}
