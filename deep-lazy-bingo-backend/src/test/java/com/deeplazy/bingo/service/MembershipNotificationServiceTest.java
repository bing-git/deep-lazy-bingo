package com.deeplazy.bingo.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.read.ListAppender;
import com.deeplazy.bingo.entity.MembershipReminder;
import com.deeplazy.bingo.entity.ReminderStatus;
import com.deeplazy.bingo.mapper.MembershipReminderMapper;
import com.deeplazy.bingo.service.SmtpTransport.SmtpTransportException;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class MembershipNotificationServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 30);
    private static final Clock CLOCK = Clock.fixed(
            Instant.parse("2026-10-29T16:30:00Z"), ZoneId.of("Asia/Shanghai"));
    private static final Long OWNER_ID = 41L;
    private static final int BATCH_SIZE = 100;
    private static final String RECIPIENT = "member@example.invalid";
    private static final String BODY = "synthetic-private-membership-body";

    private final MembershipReminderMapper mapper = mock(MembershipReminderMapper.class);
    private final SmtpTransport transport = mock(SmtpTransport.class);

    @Test
    void subtractsOneCalendarMonthAcrossJanuaryAndClampsLeapAndNonLeapFebruary() {
        assertThat(MembershipNotificationService.reminderDate(LocalDate.of(2027, 1, 31)))
                .isEqualTo(LocalDate.of(2026, 12, 31));
        assertThat(MembershipNotificationService.reminderDate(LocalDate.of(2028, 3, 31)))
                .isEqualTo(LocalDate.of(2028, 2, 29));
        assertThat(MembershipNotificationService.reminderDate(LocalDate.of(2027, 3, 31)))
                .isEqualTo(LocalDate.of(2027, 2, 28));
        assertThat(MembershipNotificationService.reminderDate(LocalDate.of(2027, 5, 15)))
                .isEqualTo(LocalDate.of(2027, 4, 15));
    }

    @Test
    void dispatchesOnlyInsideInclusiveReminderAndExpiryWindowUsingClockZone() throws Exception {
        var dueToday = reminder(1L, LocalDate.of(2026, 11, 30), RECIPIENT, BODY);
        var overdue = reminder(2L, LocalDate.of(2026, 11, 29), RECIPIENT, BODY);
        var expiryToday = reminder(3L, TODAY, RECIPIENT, BODY);
        var tooEarly = reminder(4L, LocalDate.of(2026, 12, 1), RECIPIENT, BODY);
        var expired = reminder(5L, TODAY.minusDays(1), RECIPIENT, BODY);
        when(mapper.selectDue(TODAY, BATCH_SIZE))
                .thenReturn(List.of(dueToday, overdue, expiryToday, tooEarly, expired));
        for (Long reminderId : List.of(1L, 2L, 3L)) {
            when(mapper.tryClaim(reminderId, OWNER_ID, TODAY)).thenReturn(1);
        }

        enabledService().dispatchDueReminders();

        verify(mapper).selectDue(TODAY, BATCH_SIZE);
        for (Long reminderId : List.of(1L, 2L, 3L)) {
            verify(mapper).tryClaim(reminderId, OWNER_ID, TODAY);
            verify(mapper).updateStatus(reminderId, OWNER_ID, ReminderStatus.SMTP_ACCEPTED);
        }
        verify(transport, times(3)).send(RECIPIENT, BODY);
        verifyNoMoreInteractions(mapper, transport);
    }

    @Test
    void duplicateDatabaseClaimSkipsProviderEvenAcrossServiceInstances() throws Exception {
        when(mapper.selectDue(TODAY, BATCH_SIZE)).thenReturn(List.of(validReminder()));
        when(mapper.tryClaim(1L, OWNER_ID, TODAY)).thenReturn(1, 0);

        enabledService().dispatchDueReminders();
        enabledService().dispatchDueReminders();

        var order = inOrder(mapper, transport);
        order.verify(mapper).selectDue(TODAY, BATCH_SIZE);
        order.verify(mapper).tryClaim(1L, OWNER_ID, TODAY);
        order.verify(transport).send(RECIPIENT, BODY);
        order.verify(mapper).updateStatus(1L, OWNER_ID, ReminderStatus.SMTP_ACCEPTED);
        order.verify(mapper).selectDue(TODAY, BATCH_SIZE);
        order.verify(mapper).tryClaim(1L, OWNER_ID, TODAY);
        verifyNoMoreInteractions(mapper, transport);
    }

    @Test
    void defaultsToDisabledAndSchedulerRequiresExplicitEnablement() throws Exception {
        var disabled = new MembershipNotificationService(mapper, transport, CLOCK);

        disabled.dispatchDueReminders();
        new MembershipNotificationScheduler(disabled).dispatchDueReminders();

        verifyNoInteractions(mapper, transport);
        var condition = MembershipNotificationScheduler.class.getAnnotation(ConditionalOnProperty.class);
        assertThat(condition).isNotNull();
        assertThat(condition.prefix()).isEqualTo("bingo.membership.notifications");
        assertThat(condition.name()).containsExactly("enabled");
        assertThat(condition.havingValue()).isEqualTo("true");
        assertThat(condition.matchIfMissing()).isFalse();
        assertThat(MembershipNotificationScheduler.class.getMethod("dispatchDueReminders")
                .getAnnotation(Scheduled.class)).isNotNull();
    }

    @Test
    void smtpAcceptanceIsPersistedAsAcceptedAndNeverAsDelivered() throws Exception {
        arrangeClaimed(validReminder());

        enabledService().dispatchDueReminders();

        var order = inOrder(mapper, transport);
        order.verify(mapper).selectDue(TODAY, BATCH_SIZE);
        order.verify(mapper).tryClaim(1L, OWNER_ID, TODAY);
        order.verify(transport).send(RECIPIENT, BODY);
        order.verify(mapper).updateStatus(1L, OWNER_ID, ReminderStatus.SMTP_ACCEPTED);
        verifyNoMoreInteractions(mapper, transport);
    }

    @Test
    void smtpFailureIsPersistedExplicitlyWithoutImmediateRetryOrAcceptedStatus() throws Exception {
        arrangeClaimed(validReminder());
        doThrow(new SmtpTransportException("Synthetic SMTP rejection"))
                .when(transport).send(RECIPIENT, BODY);

        assertThatCode(() -> enabledService().dispatchDueReminders()).doesNotThrowAnyException();

        var order = inOrder(mapper, transport);
        order.verify(mapper).selectDue(TODAY, BATCH_SIZE);
        order.verify(mapper).tryClaim(1L, OWNER_ID, TODAY);
        order.verify(transport).send(RECIPIENT, BODY);
        order.verify(mapper).updateStatus(1L, OWNER_ID, ReminderStatus.FAILED);
        verifyNoMoreInteractions(mapper, transport);
    }

    @Test
    void rejectsMalformedAndCrlfRecipientsBeforeContactingProvider() {
        var invalidRows = new ArrayList<MembershipReminder>();
        String[] invalidRecipients = {null, "", " ", "not-an-address", "member@example.invalid\r\nBcc: other@example.invalid",
                "member@example.invalid\n", "member@example.invalid\r", "a@example.invalid,b@example.invalid"};
        for (int index = 0; index < invalidRecipients.length; index++) {
            var row = reminder((long) index + 1, LocalDate.of(2026, 11, 30), invalidRecipients[index], BODY);
            invalidRows.add(row);
            when(mapper.tryClaim(row.id(), OWNER_ID, TODAY)).thenReturn(1);
        }
        when(mapper.selectDue(TODAY, BATCH_SIZE)).thenReturn(invalidRows);

        assertThatCode(() -> enabledService().dispatchDueReminders()).doesNotThrowAnyException();

        verify(mapper).selectDue(TODAY, BATCH_SIZE);
        for (MembershipReminder row : invalidRows) {
            verify(mapper).tryClaim(row.id(), OWNER_ID, TODAY);
            verify(mapper).updateStatus(row.id(), OWNER_ID, ReminderStatus.INVALID_RECIPIENT);
        }
        verifyNoInteractions(transport);
        verifyNoMoreInteractions(mapper);
    }

    @Test
    void successAndFailureLogsDoNotExposeRecipientBodyOrProviderSecrets() throws Exception {
        String privateRecipient = "private-log-marker@example.invalid";
        String privateBody = "synthetic-confidential-body-marker";
        String syntheticSecret = "synthetic-provider-secret-marker";
        var accepted = reminder(1L, LocalDate.of(2026, 11, 30), RECIPIENT, BODY);
        var rejected = reminder(2L, LocalDate.of(2026, 11, 30), privateRecipient, privateBody);
        when(mapper.selectDue(TODAY, BATCH_SIZE)).thenReturn(List.of(accepted, rejected));
        when(mapper.tryClaim(1L, OWNER_ID, TODAY)).thenReturn(1);
        when(mapper.tryClaim(2L, OWNER_ID, TODAY)).thenReturn(1);
        doThrow(new SmtpTransportException(privateRecipient + " " + privateBody + " " + syntheticSecret))
                .when(transport).send(privateRecipient, privateBody);
        Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        Level previousLevel = root.getLevel();
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        root.addAppender(appender);
        root.setLevel(Level.ALL);
        try {
            assertThatCode(() -> enabledService().dispatchDueReminders()).doesNotThrowAnyException();

            verify(transport).send(RECIPIENT, BODY);
            verify(transport).send(privateRecipient, privateBody);
            verify(mapper).updateStatus(1L, OWNER_ID, ReminderStatus.SMTP_ACCEPTED);
            verify(mapper).updateStatus(2L, OWNER_ID, ReminderStatus.FAILED);
            String logs = appender.list.stream().map(event -> event.getFormattedMessage() + " "
                    + event.getMDCPropertyMap() + " " + (event.getThrowableProxy() == null ? ""
                    : ThrowableProxyUtil.asString(event.getThrowableProxy())))
                    .reduce("", (previous, current) -> previous + "\n" + current);
            assertThat(logs).doesNotContain(RECIPIENT, BODY, privateRecipient, privateBody, syntheticSecret);
        } finally {
            root.setLevel(previousLevel);
            root.detachAppender(appender);
            appender.stop();
        }
    }

    private MembershipNotificationService enabledService() {
        return new MembershipNotificationService(mapper, transport, CLOCK, true);
    }

    private MembershipReminder validReminder() {
        return reminder(1L, LocalDate.of(2026, 11, 30), RECIPIENT, BODY);
    }

    private MembershipReminder reminder(Long reminderId, LocalDate expiresOn, String recipient, String body) {
        return new MembershipReminder(reminderId, OWNER_ID, 71L, expiresOn, recipient, body);
    }

    private void arrangeClaimed(MembershipReminder reminder) {
        when(mapper.selectDue(TODAY, BATCH_SIZE)).thenReturn(List.of(reminder));
        when(mapper.tryClaim(reminder.id(), reminder.ownerId(), TODAY)).thenReturn(1);
    }
}