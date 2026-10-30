package com.deeplazy.bingo.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;

@ConditionalOnProperty(prefix = "bingo.membership.notifications", name = "enabled",
        havingValue = "true", matchIfMissing = false)
public final class MembershipNotificationScheduler {
    private final MembershipNotificationService service;

    public MembershipNotificationScheduler(MembershipNotificationService service) {
        this.service = service;
    }

    @Scheduled(fixedDelay = 60000, initialDelay = 60000)
    public void dispatchDueReminders() {
        service.dispatchDueReminders();
    }
}