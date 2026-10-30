package com.deeplazy.bingo.service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Objects;
import java.util.regex.Pattern;

import com.deeplazy.bingo.entity.MembershipReminder;
import com.deeplazy.bingo.entity.ReminderStatus;
import com.deeplazy.bingo.mapper.MembershipReminderMapper;

public final class MembershipNotificationService {
    private static final int BATCH_SIZE = 100;
    private static final int MAX_BODY_LENGTH = 8192;
    private static final Pattern RECIPIENT = Pattern.compile(
            "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@"
            + "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
            + "(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+");
    private final MembershipReminderMapper mapper;
    private final SmtpTransport transport;
    private final Clock clock;
    private final boolean enabled;

    public MembershipNotificationService(MembershipReminderMapper mapper, SmtpTransport transport, Clock clock) {
        this(mapper, transport, clock, false);
    }

    public MembershipNotificationService(MembershipReminderMapper mapper, SmtpTransport transport,
            Clock clock, boolean enabled) {
        this.mapper = Objects.requireNonNull(mapper);
        this.transport = Objects.requireNonNull(transport);
        this.clock = Objects.requireNonNull(clock);
        this.enabled = enabled;
    }

    public static LocalDate reminderDate(LocalDate expiresOn) {
        return Objects.requireNonNull(expiresOn).minusMonths(1);
    }

    public static boolean isSafeRecipient(String recipient) {
        return recipient != null && recipient.length() <= 254 && recipient.indexOf('@') <= 64
                && RECIPIENT.matcher(recipient).matches();
    }

    public static boolean isSafeBody(String body) {
        return body != null && !body.isBlank() && body.length() <= MAX_BODY_LENGTH
                && body.indexOf('\0') < 0;
    }

    public void dispatchDueReminders() {
        if (!enabled) {
            return;
        }
        LocalDate today = LocalDate.now(clock);
        for (MembershipReminder reminder : mapper.selectDue(today, BATCH_SIZE)) {
            if (reminder.expiresOn() == null || today.isAfter(reminder.expiresOn())
                    || today.isBefore(reminderDate(reminder.expiresOn()))
                    || mapper.tryClaim(reminder.id(), reminder.ownerId(), today) != 1) {
                continue;
            }
            dispatchClaimed(reminder);
        }
    }

    private void dispatchClaimed(MembershipReminder reminder) {
        if (!isSafeRecipient(reminder.recipient())) {
            mapper.updateStatus(reminder.id(), reminder.ownerId(), ReminderStatus.INVALID_RECIPIENT);
            return;
        }
        if (!isSafeBody(reminder.body())) {
            mapper.updateStatus(reminder.id(), reminder.ownerId(), ReminderStatus.FAILED);
            return;
        }
        ReminderStatus status;
        try {
            transport.send(reminder.recipient(), reminder.body());
            status = ReminderStatus.SMTP_ACCEPTED;
        } catch (SmtpTransport.SmtpTransportException exception) {
            status = ReminderStatus.FAILED;
        }
        mapper.updateStatus(reminder.id(), reminder.ownerId(), status);
    }
}