package com.deeplazy.bingo.mapper;

import java.util.List;
import java.util.UUID;

import com.deeplazy.bingo.entity.MembershipSync;
import com.deeplazy.bingo.entity.ReminderStatus;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 参数化持久化访问；所有查询都限定为本机唯一配置账号。 */
@Repository
@ConditionalOnProperty(prefix = "bingo.personal-tools", name = "enabled", havingValue = "true")
public class MembershipStore {
    private static final long OWNER_ID = 1L;
    private final JdbcTemplate jdbc;

    public MembershipStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Member(Long key, UUID id, Integer version, String service, String accountLabel,
            Boolean archived) { }
    public record PeriodRow(Long membershipKey, MembershipSync.SavedPeriod value) { }

    public List<Member> members() {
        return jdbc.query("""
                SELECT id, client_id, version, service, account_label, archived
                FROM bingo_membership WHERE owner_id = ? AND client_id IS NOT NULL ORDER BY id
                """, (rs, row) -> new Member(rs.getLong("id"), rs.getObject("client_id", UUID.class),
                rs.getInt("version"), rs.getString("service"), rs.getString("account_label"),
                rs.getBoolean("archived")), OWNER_ID);
    }

    public List<PeriodRow> periods() {
        return jdbc.query("""
                SELECT membership_id, client_period_id, starts_on, expires_on, amount_minor,
                       currency, recipient, status
                FROM bingo_membership_reminder
                WHERE owner_id = ? AND client_period_id IS NOT NULL
                ORDER BY starts_on, id
                """, (rs, row) -> new PeriodRow(rs.getLong("membership_id"), new MembershipSync.SavedPeriod(
                rs.getObject("client_period_id", UUID.class), rs.getObject("starts_on", java.time.LocalDate.class),
                rs.getObject("expires_on", java.time.LocalDate.class), rs.getLong("amount_minor"),
                rs.getString("currency"), rs.getString("recipient"),
                ReminderStatus.valueOf(rs.getString("status")))), OWNER_ID);
    }

    public List<Long> lock(UUID id) {
        return jdbc.query("SELECT id FROM bingo_membership WHERE owner_id = ? AND client_id = ? FOR UPDATE",
                (rs, row) -> rs.getLong(1), OWNER_ID, id);
    }

    public void insert(UUID id, MembershipSync input) {
        jdbc.update("""
                INSERT INTO bingo_membership (owner_id, client_id, version, service, account_label, archived)
                VALUES (?, ?, 0, ?, ?, ?)
                """, OWNER_ID, id, input.service(), input.accountLabel(), input.archived());
    }

    public int update(Long key, MembershipSync input) {
        return jdbc.update("""
                UPDATE bingo_membership SET version = version + 1, service = ?, account_label = ?, archived = ?
                WHERE id = ? AND owner_id = ? AND version = ?
                """, input.service(), input.accountLabel(), input.archived(), key, OWNER_ID, input.expectedVersion());
    }

    public void append(Long key, String service, List<MembershipSync.Period> periods) {
        jdbc.batchUpdate("""
                INSERT INTO bingo_membership_reminder
                  (owner_id, membership_id, client_period_id, starts_on, expires_on, amount_minor,
                   currency, recipient, body, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, periods, 100, (statement, period) -> {
            statement.setLong(1, OWNER_ID);
            statement.setLong(2, key);
            statement.setObject(3, period.id());
            statement.setObject(4, period.startDate());
            statement.setObject(5, period.endDate());
            statement.setLong(6, period.amountMinor());
            statement.setString(7, period.currency());
            statement.setString(8, period.reminderEmail());
            statement.setString(9, service + "\n会员将于 " + period.endDate() + " 到期，请及时检查续费安排。");
            statement.setString(10, period.reminderEmail().isEmpty() ? "INVALID_RECIPIENT" : "PENDING");
        });
    }
}
