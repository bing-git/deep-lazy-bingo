package com.deeplazy.bingo.entity;

import java.time.LocalDate;

public record MembershipReminder(Long id, Long ownerId, Long membershipId,
        LocalDate expiresOn, String recipient, String body) {
}