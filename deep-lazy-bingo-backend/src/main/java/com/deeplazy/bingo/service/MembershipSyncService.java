package com.deeplazy.bingo.service;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.deeplazy.bingo.entity.MembershipSync;
import com.deeplazy.bingo.mapper.MembershipStore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 为显式上传的会员快照追加持久化提醒，绝不接收客户端 ownerId。 */
@Service
@ConditionalOnProperty(prefix = "bingo.personal-tools", name = "enabled", havingValue = "true")
public class MembershipSyncService {
    private final MembershipStore store;

    public MembershipSyncService(MembershipStore store) {
        this.store = store;
    }

    @Transactional(readOnly = true)
    public List<MembershipSync.Saved> list() {
        Map<Long, List<MembershipSync.SavedPeriod>> periods = store.periods().stream().collect(
                Collectors.groupingBy(MembershipStore.PeriodRow::membershipKey,
                        Collectors.mapping(MembershipStore.PeriodRow::value, Collectors.toList())));
        return store.members().stream().map(member -> new MembershipSync.Saved(member.id(), member.version(),
                member.service(), member.accountLabel(), member.archived(),
                periods.getOrDefault(member.key(), List.of()))).toList();
    }

    @Transactional
    public MembershipSync.Saved sync(UUID id, MembershipSync input) {
        validate(input);
        List<Long> keys = store.lock(id);
        if (keys.isEmpty()) {
            if (input.expectedVersion() != 0) {
                throw new OptimisticLockingFailureException("Unknown membership version");
            }
            store.insert(id, input);
            keys = store.lock(id);
        }
        Long key = keys.getFirst();
        MembershipSync.Saved previous = list().stream().filter(member -> member.id().equals(id))
                .findFirst().orElseThrow();
        Map<UUID, MembershipSync.Period> old = previous.periods().stream().collect(
                Collectors.toMap(MembershipSync.SavedPeriod::id, period -> period.input()));
        Map<UUID, MembershipSync.Period> next = input.periods().stream().collect(
                Collectors.toMap(MembershipSync.Period::id, Function.identity()));
        if (!old.entrySet().stream().allMatch(entry -> entry.getValue().equals(next.get(entry.getKey())))) {
            throw new OptimisticLockingFailureException("Membership history is immutable");
        }
        if (store.update(key, input) != 1) {
            throw new OptimisticLockingFailureException("Membership version conflict");
        }
        store.append(key, input.service(), input.periods().stream()
                .filter(period -> !old.containsKey(period.id())).toList());
        return list().stream().filter(member -> member.id().equals(id)).findFirst().orElseThrow();
    }

    private void validate(MembershipSync input) {
        List<MembershipSync.Period> periods = input.periods().stream()
                .sorted(Comparator.comparing(MembershipSync.Period::startDate)).toList();
        if (periods.stream().map(MembershipSync.Period::id).distinct().count() != periods.size()) {
            throw new IllegalArgumentException("Duplicate period");
        }
        LocalDate previousEnd = null;
        for (MembershipSync.Period period : periods) {
            if (period.startDate().isBefore(LocalDate.of(1900, 1, 1))
                    || period.endDate().isAfter(LocalDate.of(2200, 12, 31))
                    || period.startDate().isAfter(period.endDate())
                    || (previousEnd != null && !period.startDate().isAfter(previousEnd))
                    || (!period.reminderEmail().isEmpty()
                        && !MembershipNotificationService.isSafeRecipient(period.reminderEmail()))) {
                throw new IllegalArgumentException("Invalid period");
            }
            previousEnd = period.endDate();
        }
    }
}
