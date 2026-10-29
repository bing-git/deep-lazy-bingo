package com.deeplazy.bingo;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import javax.sql.DataSource;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = "logging.level.org.springframework.boot.security.autoconfigure=ERROR")
@ActiveProfiles("test")
class BingoBackendApplicationTests {

	@Autowired
	DataSource dataSource;

	@Autowired
	Environment environment;

	@Autowired
	org.springframework.context.ConfigurableApplicationContext context;

	@Test
	void rootPackagePathsAndInfrastructureScanningAreConsistent() throws Exception {
		String root = "com.deeplazy.bingo";
		assertThat(BingoBackendApplication.class.getPackageName()).isEqualTo(root);
		assertThat(org.springframework.boot.autoconfigure.AutoConfigurationPackages.get(context.getBeanFactory()))
			.containsExactly(root);
		for (String bean : new String[]{"securityConfiguration", "persistenceConfiguration",
				"redisInfrastructureConfiguration", "requestIdFilter", "restExceptionHandler"}) {
			assertThat(context.getBean(bean).getClass().getName()).startsWith(root + ".");
		}
		for (String sourceSet : new String[]{"main", "test"}) {
			try (var sources = java.nio.file.Files.walk(java.nio.file.Path.of("src", sourceSet, "java"))) {
				for (var source : sources.filter(path -> path.toString().endsWith(".java")).toList()) {
					String declaration = java.nio.file.Files.readString(source).lines()
						.filter(line -> line.startsWith("package ")).findFirst().orElseThrow();
					String packageName = declaration.substring(8, declaration.indexOf(';'));
					assertThat(packageName).startsWith(root);
					assertThat(source.getParent()).isEqualTo(java.nio.file.Path.of("src", sourceSet, "java")
						.resolve(packageName.replace('.', '/')));
				}
			}
		}
		for (String layer : new String[]{"controller", "service", "entity", "mapper"}) {
			var declaration = java.nio.file.Path.of("src/main/java/com/deeplazy/bingo", layer, "package-info.java");
			assertThat(declaration).isRegularFile();
			assertThat(java.nio.file.Files.readString(declaration).strip())
				.isEqualTo("package " + root + "." + layer + ";");
		}
	}

	@Test
	void contextLoads() throws Exception {
		try (var connection = dataSource.getConnection()) {
			assertThat(connection.getMetaData().getURL()).startsWith("jdbc:h2:mem:");
		}
		assertThat(environment.getProperty("spring.flyway.enabled", Boolean.class)).isFalse();
		assertThat(environment.getProperty("spring.data.redis.database", Integer.class)).isEqualTo(3);
	}

}
