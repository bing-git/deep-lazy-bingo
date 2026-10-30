package com.deeplazy.bingo.entity;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

/** 单用户会员快照；历史期限只允许追加，不允许覆盖。 */
public record MembershipSync(
        @NotNull @Min(0) Integer expectedVersion,
        @NotBlank @Size(max = 120) String service,
        @NotNull @Size(max = 120) String accountLabel,
        @NotNull Boolean archived,
        @NotNull @Size(min = 1, max = 200) List<@NotNull @Valid Period> periods) {

    public record Period(
            @NotNull UUID id,
            @NotNull LocalDate startDate,
            @NotNull LocalDate endDate,
            @NotNull @Min(0) @Max(99999999999L) Long amountMinor,
            @NotNull @Pattern(regexp = "CNY|USD|EUR|GBP|JPY") String currency,
            @NotNull @Size(max = 254) String reminderEmail) { }

    public record SavedPeriod(UUID id, LocalDate startDate, LocalDate endDate, Long amountMinor,
            String currency, String reminderEmail, ReminderStatus status) {
        public Period input() {
            return new Period(id, startDate, endDate, amountMinor, currency, reminderEmail);
        }
    }

    public record Saved(UUID id, Integer version, String service, String accountLabel,
            Boolean archived, List<SavedPeriod> periods) { }
}
