package com.deeplazy.bingo.service;

import java.sql.Connection;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.net.InetAddress;
import java.net.SocketException;
import java.security.KeyStore;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLException;
import javax.net.ssl.SSLServerSocket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManagerFactory;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import com.deeplazy.bingo.config.MembershipNotificationConfiguration;
import com.deeplazy.bingo.entity.MembershipRecord;
import com.deeplazy.bingo.entity.MembershipReminderRecord;
import com.deeplazy.bingo.entity.ReminderStatus;
import com.deeplazy.bingo.mapper.MembershipRecordMapper;
import com.deeplazy.bingo.mapper.MembershipReminderMapper;
import org.apache.ibatis.exceptions.PersistenceException;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.scheduling.config.ScheduledTaskHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class MembershipNotificationSqlIntegrationTest {
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 30);
    private JdbcDataSource dataSource;
    private Connection schemaConnection;
    private SqlSessionFactory factory;
    private SqlSession session;
    private MembershipReminderMapper mapper;
    private Long membershipId;
    @TempDir Path tlsDirectory;

    @BeforeEach
    void createIsolatedSchema() throws Exception {
        dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:notification_" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        schemaConnection = dataSource.getConnection();
        new ResourceDatabasePopulator(new ClassPathResource(
            "db/migration/V2026103001__membership_reminders.sql"), new ClassPathResource(
            "db/migration/V2026103002__membership_sync.sql")).populate(schemaConnection);
        reopenSession();
        MembershipRecord membership = new MembershipRecord();
        membership.setOwnerId(41L);
        session.getMapper(MembershipRecordMapper.class).insert(membership);
        membershipId = membership.getId();
    }

    @AfterEach
    void closeIsolatedSchema() throws Exception {
        if (session != null) {
            session.close();
        }
        if (schemaConnection != null) {
            schemaConnection.close();
        }
        if (dataSource != null) {
            try (var connection = dataSource.getConnection(); var statement = connection.createStatement()) {
                statement.execute("SHUTDOWN");
            }
        }
    }

    @Test
    void enforcesCycleUniquenessAndMembershipOwnershipWithoutReplacingHistory() {
        var oldCycle = insert(LocalDate.of(2025, 11, 30));
        assertThatThrownBy(() -> insert(oldCycle.getExpiresOn())).isInstanceOf(PersistenceException.class);
        var nextCycle = insert(LocalDate.of(2026, 11, 30));
        assertThat(mapper.selectById(oldCycle.getId()).getExpiresOn()).isEqualTo(oldCycle.getExpiresOn());
        assertThat(nextCycle.getId()).isNotEqualTo(oldCycle.getId());
        var foreign = row(LocalDate.of(2027, 11, 30));
        foreign.setOwnerId(99L);
        assertThatThrownBy(() -> mapper.insert(foreign)).isInstanceOf(PersistenceException.class);
    }

    @Test
    void claimsAndFinalizesOnlyOwnedEligiblePendingRows() {
        var due = insert(LocalDate.of(2026, 11, 30));
        var future = insert(LocalDate.of(2026, 12, 1));
        var expired = insert(TODAY.minusDays(1));
        assertThat(mapper.tryClaim(due.getId(), 99L, TODAY)).isZero();
        assertThat(mapper.tryClaim(future.getId(), 41L, TODAY)).isZero();
        assertThat(mapper.tryClaim(expired.getId(), 41L, TODAY)).isZero();
        assertThat(mapper.updateStatus(due.getId(), 41L, ReminderStatus.SMTP_ACCEPTED)).isZero();
        assertThat(mapper.tryClaim(due.getId(), 41L, TODAY)).isEqualTo(1);
        assertThat(mapper.tryClaim(due.getId(), 41L, TODAY)).isZero();
        assertThat(mapper.updateStatus(due.getId(), 99L, ReminderStatus.SMTP_ACCEPTED)).isZero();
        assertThat(mapper.updateStatus(due.getId(), 41L, ReminderStatus.PENDING)).isZero();
        assertThat(mapper.updateStatus(due.getId(), 41L, ReminderStatus.SMTP_ACCEPTED)).isEqualTo(1);
        assertThat(mapper.updateStatus(due.getId(), 41L, ReminderStatus.FAILED)).isZero();
    }

    @Test
    void committedClaimSurvivesAllSessionsClosingAndFactoryRecreation() {
        var due = insert(LocalDate.of(2026, 11, 30));
        assertThat(mapper.tryClaim(due.getId(), 41L, TODAY)).isEqualTo(1);
        session.close();
        reopenSession();
        assertThat(mapper.selectById(due.getId()).getStatus()).isEqualTo(ReminderStatus.CLAIMED);
        assertThat(mapper.selectDue(TODAY, 100)).isEmpty();
        assertThat(mapper.tryClaim(due.getId(), 41L, TODAY)).isZero();
        assertThat(mapper.updateStatus(due.getId(), 41L, ReminderStatus.FAILED)).isEqualTo(1);
        session.close();
        reopenSession();
        assertThat(mapper.selectById(due.getId()).getStatus()).isEqualTo(ReminderStatus.FAILED);
        assertThat(mapper.selectDue(TODAY, 100)).isEmpty();
    }

    @Test
    void uncertainAcceptedStatusWriteDoesNotAutomaticallyResendAfterRestart() throws Exception {
        var due = insert(LocalDate.of(2026, 11, 30));
        var failingMapper = spy(mapper);
        var transport = mock(SmtpTransport.class);
        doThrow(new PersistenceException("synthetic status write failure")).when(failingMapper)
                .updateStatus(due.getId(), 41L, ReminderStatus.SMTP_ACCEPTED);
        Clock clock = Clock.fixed(Instant.parse("2026-10-29T16:30:00Z"), ZoneId.of("Asia/Shanghai"));
        assertThatThrownBy(() -> new MembershipNotificationService(failingMapper, transport, clock, true)
                .dispatchDueReminders()).isInstanceOf(PersistenceException.class);
        session.close();
        reopenSession();
        new MembershipNotificationService(mapper, transport, clock, true).dispatchDueReminders();
        verify(transport, times(1)).send("member@example.invalid", "synthetic bounded body");
        assertThat(mapper.selectById(due.getId()).getStatus()).isEqualTo(ReminderStatus.CLAIMED);
    }

    @Test
    void sqlMatchesCalendarMonthClampingAndInclusiveExpiry() {
        var march = insert(LocalDate.of(2027, 3, 31));
        var leapMarch = insert(LocalDate.of(2028, 3, 31));
        assertThat(mapper.selectDue(LocalDate.of(2027, 2, 27), 100)).isEmpty();
        assertThat(mapper.selectDue(LocalDate.of(2027, 2, 28), 100))
                .extracting(reminder -> reminder.id()).containsExactly(march.getId());
        assertThat(mapper.selectDue(LocalDate.of(2028, 2, 28), 100)).isEmpty();
        assertThat(mapper.selectDue(LocalDate.of(2028, 2, 29), 100))
                .extracting(reminder -> reminder.id()).containsExactly(leapMarch.getId());
        assertThat(mapper.tryClaim(march.getId(), 41L, LocalDate.of(2027, 3, 31))).isEqualTo(1);
        assertThat(mapper.tryClaim(leapMarch.getId(), 41L, LocalDate.of(2028, 4, 1))).isZero();
    }

    @Test
    void queueIsDeterministicAndBoundedEvenWhenCallerRequestsTooMany() {
        for (int index = 0; index < 105; index++) {
            MembershipRecord membership = new MembershipRecord();
            membership.setOwnerId(41L);
            session.getMapper(MembershipRecordMapper.class).insert(membership);
            var reminder = row(LocalDate.of(2026, 11, 30));
            reminder.setMembershipId(membership.getId());
            mapper.insert(reminder);
        }
        assertThat(mapper.selectDue(TODAY, 1000)).hasSize(100);
        assertThat(mapper.selectDue(TODAY, 2)).hasSize(2);
        assertThat(mapper.selectDue(TODAY, 2)).isEqualTo(mapper.selectDue(TODAY, 2));
    }

    @Test
    void disabledConfigurationRequiresNoInfrastructureOrSchedulingBeans() {
        new ApplicationContextRunner().withUserConfiguration(MembershipNotificationConfiguration.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(MembershipNotificationService.class);
                    assertThat(context).doesNotHaveBean(MembershipNotificationScheduler.class);
                    assertThat(context).doesNotHaveBean(MembershipReminderMapper.class);
                    assertThat(context).doesNotHaveBean(SmtpTransport.class);
                    assertThat(context).doesNotHaveBean(Clock.class);
                    assertThat(context).doesNotHaveBean(ScheduledTaskHolder.class);
                });
    }

    @Test
    void explicitEnablementWiresMailerAndSchedulerWithoutConnecting() {
        new ApplicationContextRunner().withUserConfiguration(MembershipNotificationConfiguration.class)
                .withBean(MembershipReminderMapper.class, () -> mapper)
                .withPropertyValues("bingo.membership.notifications.enabled=true",
                        "bingo.membership.notifications.from=fixed@example.invalid",
                        "spring.mail.host=smtp.example.invalid",
                        "spring.mail.properties.mail.smtp.starttls.enable=true",
                        "spring.mail.properties.mail.smtp.starttls.required=true")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(SmtpTransport.class);
                    assertThat(context).hasSingleBean(MembershipNotificationService.class);
                    assertThat(context).hasSingleBean(MembershipNotificationScheduler.class);
                    assertThat(context).hasSingleBean(ScheduledTaskHolder.class);
                });
    }

    @Test
    void plaintextAndUnsafeSenderAreRejectedWithoutConnecting() {
        var sender = new JavaMailSenderImpl();
        assertThatThrownBy(() -> new JavaMailSmtpTransport(sender, "fixed@example.invalid"))
                .isInstanceOf(IllegalArgumentException.class).hasMessage("TLS SMTP configuration required");
        sender.getJavaMailProperties().setProperty("mail.smtp.starttls.enable", "true");
        assertThatThrownBy(() -> new JavaMailSmtpTransport(sender, "fixed@example.invalid"))
                .isInstanceOf(IllegalArgumentException.class);
        sender.getJavaMailProperties().setProperty("mail.smtp.starttls.required", "true");
        assertThatThrownBy(() -> new JavaMailSmtpTransport(sender, "fixed@example.invalid\r\nBcc: other@example.invalid"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void safeMailerUsesFixedPlainTextAndErasesProviderCause() throws Exception {
        var sender = spy(new JavaMailSenderImpl());
        sender.getJavaMailProperties().setProperty("mail.smtp.ssl.enable", "true");
        sender.getJavaMailProperties().setProperty("mail.debug", "true");
        var transport = new JavaMailSmtpTransport(sender, "fixed@example.invalid");
        doThrow(new MailSendException("synthetic-provider-private-marker"))
                .when(sender).send(any(SimpleMailMessage.class));
        assertThatThrownBy(() -> transport.send("member@example.invalid", "bounded plain body"))
                .isInstanceOf(SmtpTransport.SmtpTransportException.class)
                .hasMessage("SMTP submission failed").hasNoCause();
        var message = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(message.capture());
        assertThat(message.getValue().getFrom()).isEqualTo("fixed@example.invalid");
        assertThat(message.getValue().getTo()).containsExactly("member@example.invalid");
        assertThat(message.getValue().getSubject()).isEqualTo("Membership expiry reminder");
        assertThat(message.getValue().getText()).isEqualTo("bounded plain body");
        assertThat(sender.getSession().getDebug()).isFalse();
        assertThat(sender.getJavaMailProperties().getProperty("mail.smtp.ssl.checkserveridentity"))
                .isEqualTo("true");
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void realTlsSmtpRequiresTrustedCertificateAndPersistsActualSubmissionOnlyOnce(boolean trusted)
            throws Exception {
        SSLContext serverContext = createSyntheticTlsContext();
        SSLContext previousDefault = SSLContext.getDefault();
        try (var listener = (SSLServerSocket) serverContext.getServerSocketFactory()
                .createServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
                var executor = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
                        new ArrayBlockingQueue<>(1))) {
            listener.setSoTimeout(15000);
            var received = executor.submit(() -> receiveSyntheticSmtp(listener, trusted));
            if (trusted) {
                SSLContext.setDefault(serverContext);
            }
            var sender = new JavaMailSenderImpl();
            sender.setHost("127.0.0.1");
            sender.setPort(listener.getLocalPort());
            sender.getJavaMailProperties().setProperty("mail.smtp.ssl.enable", "true");
            var transport = new JavaMailSmtpTransport(sender, "fixed@example.invalid");
            var reminder = insert(LocalDate.of(2026, 11, 30));
            Clock clock = Clock.fixed(Instant.parse("2026-10-29T16:30:00Z"), ZoneId.of("Asia/Shanghai"));
            var service = new MembershipNotificationService(mapper, transport, clock, true);

            service.dispatchDueReminders();
            service.dispatchDueReminders();

            assertThat(mapper.selectById(reminder.getId()).getStatus())
                    .isEqualTo(trusted ? ReminderStatus.SMTP_ACCEPTED : ReminderStatus.FAILED);
            String message = received.get(20, TimeUnit.SECONDS);
            if (trusted) {
                assertThat(message).contains("From: fixed@example.invalid", "To: member@example.invalid",
                        "Subject: Membership expiry reminder", "synthetic bounded body");
            } else {
                assertThat(message).isNull();
            }
            assertThat(mapper.selectDue(TODAY, 100)).isEmpty();
        } finally {
            SSLContext.setDefault(previousDefault);
        }
    }

    private SSLContext createSyntheticTlsContext() throws Exception {
        Path store = tlsDirectory.resolve("synthetic-smtp.p12");
        String password = "public-test-only-keystore-password";
        String executable = System.getProperty("os.name").startsWith("Windows") ? "keytool.exe" : "keytool";
        var process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", executable).toString(),
                "-genkeypair", "-alias", "synthetic-smtp", "-keyalg", "RSA", "-keysize", "2048",
                "-storetype", "PKCS12", "-keystore", store.toString(), "-storepass", password,
                "-keypass", password, "-dname", "CN=localhost", "-ext", "SAN=DNS:localhost,IP:127.0.0.1",
                "-validity", "1", "-noprompt")
                .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .redirectError(ProcessBuilder.Redirect.DISCARD).start();
        if (!process.waitFor(30, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new java.io.IOException("Synthetic certificate generation timed out");
        }
        assertThat(process.exitValue()).isZero();
        KeyStore keys = KeyStore.getInstance("PKCS12");
        try (var input = Files.newInputStream(store)) {
            keys.load(input, password.toCharArray());
        }
        var keyManagers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keyManagers.init(keys, password.toCharArray());
        var trustManagers = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        trustManagers.init(keys);
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(keyManagers.getKeyManagers(), trustManagers.getTrustManagers(), null);
        return context;
    }

    private String receiveSyntheticSmtp(SSLServerSocket listener, boolean trusted) throws Exception {
        try (var socket = (SSLSocket) listener.accept()) {
            socket.setSoTimeout(10000);
            var reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
            var writer = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8));
            String message = null;
            writer.write("220 localhost synthetic test receiver\r\n");
            writer.flush();
            String command;
            while ((command = reader.readLine()) != null) {
                if (command.startsWith("EHLO") || command.startsWith("HELO")) {
                    writer.write("250 localhost\r\n");
                } else if (command.startsWith("MAIL FROM:") || command.startsWith("RCPT TO:")) {
                    writer.write("250 OK\r\n");
                } else if (command.equals("DATA")) {
                    writer.write("354 End with dot\r\n");
                    writer.flush();
                    var body = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null && !line.equals(".")) {
                        if (body.length() + line.length() > 65536) {
                            throw new java.io.IOException("Synthetic SMTP message limit exceeded");
                        }
                        body.append(line).append('\n');
                    }
                    if (line == null) {
                        throw new java.io.IOException("Synthetic SMTP message interrupted");
                    }
                    message = body.toString();
                    writer.write("250 Accepted by synthetic receiver\r\n");
                } else if (command.equals("QUIT")) {
                    writer.write("221 Bye\r\n");
                    writer.flush();
                    return message;
                } else {
                    writer.write("500 Unsupported\r\n");
                }
                writer.flush();
            }
            return message;
        } catch (SSLException | SocketException certificateRejected) {
            if (trusted) {
                throw certificateRejected;
            }
            return null;
        }
    }

    private void reopenSession() {
        var configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("isolated-h2", new JdbcTransactionFactory(), dataSource));
        configuration.addMapper(MembershipRecordMapper.class);
        configuration.addMapper(MembershipReminderMapper.class);
        factory = new MybatisSqlSessionFactoryBuilder().build(configuration);
        session = factory.openSession(true);
        mapper = session.getMapper(MembershipReminderMapper.class);
    }

    private MembershipReminderRecord insert(LocalDate expiry) {
        var reminder = row(expiry);
        mapper.insert(reminder);
        return reminder;
    }

    private MembershipReminderRecord row(LocalDate expiry) {
        var reminder = new MembershipReminderRecord();
        reminder.setOwnerId(41L);
        reminder.setMembershipId(membershipId);
        reminder.setExpiresOn(expiry);
        reminder.setRecipient("member@example.invalid");
        reminder.setBody("synthetic bounded body");
        reminder.setStatus(ReminderStatus.PENDING);
        return reminder;
    }
}