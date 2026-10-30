package com.deeplazy.bingo.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.deeplazy.bingo.entity.MembershipRecord;
import org.apache.ibatis.annotations.Mapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

@Mapper
@ConditionalOnProperty(prefix = "bingo.membership.notifications", name = "enabled",
        havingValue = "true", matchIfMissing = false)
public interface MembershipRecordMapper extends BaseMapper<MembershipRecord> {
}