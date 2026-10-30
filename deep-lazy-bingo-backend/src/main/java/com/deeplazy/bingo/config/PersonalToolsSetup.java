package com.deeplazy.bingo.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.*;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.EnumSet;
import java.util.List;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** 仅创建本机私有配置，不使用默认口令，也不将口令输出到日志。 */
public final class PersonalToolsSetup {
    private PersonalToolsSetup() { }

    public static void initialize(Path directory) throws IOException {
        Path config = directory.resolve("application-local-secrets.yml");
        Path login = directory.resolve("login.txt");
        if (Files.exists(config) && Files.exists(login)) {
            return;
        }
        if (Files.exists(config) || Files.exists(login)) {
            throw new IOException("Incomplete local setup. Preserve existing files before repairing setup.");
        }
        Files.createDirectories(directory);
        AclFileAttributeView acl = Files.getFileAttributeView(directory, AclFileAttributeView.class);
        if (acl != null) {
            acl.setAcl(List.of(AclEntry.newBuilder().setType(AclEntryType.ALLOW)
                    .setPrincipal(Files.getOwner(directory))
                    .setPermissions(EnumSet.allOf(AclEntryPermission.class))
                    .setFlags(AclEntryFlag.DIRECTORY_INHERIT, AclEntryFlag.FILE_INHERIT).build()));
        } else {
            Files.setPosixFilePermissions(directory, PosixFilePermissions.fromString("rwx------"));
        }
        SecureRandom random = new SecureRandom();
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        String password = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        random.nextBytes(bytes);
        String databasePassword = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        String hash = new BCryptPasswordEncoder(12).encode(password);
        Files.writeString(config, """
                spring:
                  datasource:
                    password: '%s'
                bingo:
                  personal-tools:
                    username: owner
                    password-hash: '{bcrypt}%s'
                """.formatted(databasePassword, hash), StandardOpenOption.CREATE_NEW);
        Files.writeString(login, "Username: owner\nPassword: " + password + "\n", StandardOpenOption.CREATE_NEW);
    }
}
