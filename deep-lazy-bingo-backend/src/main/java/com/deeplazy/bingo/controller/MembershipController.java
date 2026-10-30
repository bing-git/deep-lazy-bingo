package com.deeplazy.bingo.controller;

import java.util.List;
import java.util.UUID;

import com.deeplazy.bingo.entity.MembershipSync;
import com.deeplazy.bingo.service.MembershipNotificationService;
import com.deeplazy.bingo.service.MembershipSyncService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

/** 仅供唯一配置账号使用的会员通知同步接口，不声明全站登录或多家庭授权能力。 */
@RestController
@RequestMapping("/api/personal-tools/memberships")
@ConditionalOnProperty(prefix = "bingo.personal-tools", name = "enabled", havingValue = "true")
public class MembershipController {
    private final MembershipSyncService memberships;
    private final ObjectProvider<MembershipNotificationService> notifications;

    public MembershipController(MembershipSyncService memberships,
            ObjectProvider<MembershipNotificationService> notifications) {
        this.memberships = memberships;
        this.notifications = notifications;
    }

    public record Csrf(String headerName, String token) { }
    public record Session(Csrf csrf, Boolean emailEnabled) { }

    @GetMapping("/session")
    public Session session(CsrfToken csrf) {
        return new Session(new Csrf(csrf.getHeaderName(), csrf.getToken()),
                notifications.getIfAvailable() != null);
    }

    @GetMapping
    public List<MembershipSync.Saved> list() {
        return memberships.list();
    }

    @PutMapping("/{id}")
    public MembershipSync.Saved sync(@PathVariable UUID id, @Valid @RequestBody MembershipSync input) {
        return memberships.sync(id, input);
    }
}
