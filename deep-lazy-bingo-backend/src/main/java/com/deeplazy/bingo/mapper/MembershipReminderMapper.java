package com.deeplazy.bingo.mapper;

import java.time.LocalDate;
import java.util.List;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.deeplazy.bingo.entity.MembershipReminder;
import com.deeplazy.bingo.entity.MembershipReminderRecord;
import com.deeplazy.bingo.entity.ReminderStatus;
import org.apache.ibatis.annotations.Arg;
import org.apache.ibatis.annotations.ConstructorArgs;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

@Mapper
@ConditionalOnProperty(prefix = "bingo.membership.notifications", name = "enabled",
        havingValue = "true", matchIfMissing = false)
public interface MembershipReminderMapper extends BaseMapper<MembershipReminderRecord> {

    @Select("""
            SELECT r.id, r.owner_id, r.membership_id, r.expires_on, r.recipient, r.body
            FROM bingo_membership_reminder r
            JOIN bingo_membership m ON m.id = r.membership_id AND m.owner_id = r.owner_id
            WHERE m.archived = FALSE AND r.status = 'PENDING' AND r.expires_on >= #{today}
              AND CAST(r.expires_on - INTERVAL '1' MONTH AS DATE) <= #{today}
            ORDER BY r.expires_on, r.id
            LIMIT CASE WHEN #{limit} BETWEEN 1 AND 100 THEN #{limit} ELSE 100 END
            """)
    @ConstructorArgs({
            @Arg(column = "id", javaType = Long.class),
            @Arg(column = "owner_id", javaType = Long.class),
            @Arg(column = "membership_id", javaType = Long.class),
            @Arg(column = "expires_on", javaType = LocalDate.class),
            @Arg(column = "recipient", javaType = String.class),
            @Arg(column = "body", javaType = String.class)
    })
    List<MembershipReminder> selectDue(@Param("today") LocalDate today, @Param("limit") int limit);

    @Update("""
            UPDATE bingo_membership_reminder
            SET status = 'CLAIMED', updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND owner_id = #{ownerId} AND status = 'PENDING'
              AND expires_on >= #{today}
              AND CAST(expires_on - INTERVAL '1' MONTH AS DATE) <= #{today}
              AND EXISTS (SELECT 1 FROM bingo_membership m
                          WHERE m.id = bingo_membership_reminder.membership_id
                            AND m.owner_id = #{ownerId} AND m.archived = FALSE)
            """)
    int tryClaim(@Param("id") Long id, @Param("ownerId") Long ownerId, @Param("today") LocalDate today);

    @Update("""
            UPDATE bingo_membership_reminder
            SET status = #{status}, updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND owner_id = #{ownerId} AND status = 'CLAIMED'
              AND #{status} IN ('SMTP_ACCEPTED', 'FAILED', 'INVALID_RECIPIENT')
              AND EXISTS (SELECT 1 FROM bingo_membership m
                          WHERE m.id = bingo_membership_reminder.membership_id
                            AND m.owner_id = #{ownerId})
            """)
    int updateStatus(@Param("id") Long id, @Param("ownerId") Long ownerId,
            @Param("status") ReminderStatus status);
}