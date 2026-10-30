package com.deeplazy.bingo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BingoBackendApplication {

	public static void main(String[] args) throws java.io.IOException {
		if (args.length == 1 && "--init-local".equals(args[0])) {
			com.deeplazy.bingo.config.PersonalToolsSetup.initialize(
				java.nio.file.Path.of("secrets", "personal-tools"));
			return;
		}
		SpringApplication.run(BingoBackendApplication.class, args);
	}

}
