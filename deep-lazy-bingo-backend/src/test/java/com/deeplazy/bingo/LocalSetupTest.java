package com.deeplazy.bingo;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.yaml.snakeyaml.Yaml;

import static org.assertj.core.api.Assertions.*;

class LocalSetupTest {
    @TempDir Path directory;

    @Test
    void createsRealPrivateYamlAndLoginWithoutOverwritingExistingCredentials() throws Exception {
        assertThatCode(() -> Class.forName("com.deeplazy.bingo.config.PersonalToolsSetup"))
                .doesNotThrowAnyException();
        var initialize = Class.forName("com.deeplazy.bingo.config.PersonalToolsSetup")
                .getMethod("initialize", Path.class);
        Path secrets = directory.resolve("personal-tools");
        initialize.invoke(null, secrets);
        Path config = secrets.resolve("application-local-secrets.yml");
        Path login = secrets.resolve("login.txt");
        String yaml = Files.readString(config);
        String password = Files.readString(login).lines().filter(line -> line.startsWith("Password: "))
                .findFirst().orElseThrow().substring(10);
        assertThat(password).hasSizeGreaterThanOrEqualTo(32);
        assertThat(yaml).doesNotContain("${", password);
        java.util.Map<String, Object> values = new Yaml().load(yaml);
        var bingo = (java.util.Map<?, ?>) values.get("bingo");
        var tools = (java.util.Map<?, ?>) bingo.get("personal-tools");
        assertThat(PasswordEncoderFactories.createDelegatingPasswordEncoder()
                .matches(password, (String) tools.get("password-hash"))).isTrue();
        initialize.invoke(null, secrets);
        assertThat(Files.readString(config)).isEqualTo(yaml);
    }
}
