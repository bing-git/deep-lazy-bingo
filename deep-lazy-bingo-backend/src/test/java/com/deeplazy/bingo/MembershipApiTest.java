package com.deeplazy.bingo;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import com.deeplazy.bingo.service.MembershipNotificationService;
import com.deeplazy.bingo.service.SmtpTransport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "bingo.personal-tools.enabled=true",
        "bingo.personal-tools.username=owner",
        "bingo.personal-tools.password-hash={bcrypt}$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
        "bingo.membership.notifications.enabled=true",
        "spring.datasource.url=jdbc:h2:mem:membership_api;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.flyway.enabled=true"
})
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Import(MembershipApiTest.MailFixture.class)
class MembershipApiTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectProvider<MembershipNotificationService> notifications;
    @Autowired MailFixture mail;

    @DynamicPropertySource
    static void privateTestAccount(DynamicPropertyRegistry registry) {
        registry.add("bingo.personal-tools.password-hash", () -> "{bcrypt}"
                + new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder()
                        .encode("public-test-only-password"));
    }

    @Test
    void realBasicAuthenticationAndSessionCsrfAllowOnlyTheConfiguredAccount() throws Exception {
        mvc.perform(get("/api/personal-tools/memberships/session")
                .with(httpBasic("owner", "wrong-public-test-password"))).andExpect(status().isUnauthorized());
        var response = mvc.perform(get("/api/personal-tools/memberships/session")
                .with(httpBasic("owner", "public-test-only-password")))
                .andExpect(status().isOk()).andReturn();
        var json = new tools.jackson.databind.ObjectMapper().readTree(response.getResponse().getContentAsString());
        mvc.perform(put("/api/personal-tools/memberships/" + UUID.randomUUID())
                .with(httpBasic("owner", "public-test-only-password"))
                .session((org.springframework.mock.web.MockHttpSession) response.getRequest().getSession(false))
                .header("X-CSRF-TOKEN", json.path("csrf").path("token").asString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(snapshot(UUID.randomUUID().toString(), "Real authentication synthetic", 0, true)))
                .andExpect(status().isOk());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class MailFixture {
        final CopyOnWriteArrayList<String> submitted = new CopyOnWriteArrayList<>();
        @Bean SmtpTransport smtpTransport() {
            return (recipient, body) -> submitted.add(body);
        }
    }

    @Test
    void membershipEndpointsRequireAuthenticationAndCsrf() throws Exception {
        mvc.perform(get("/api/personal-tools/memberships")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/personal-tools/memberships/" + UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "other", roles = "PERSONAL_TOOLS")
    void anotherPrincipalCannotUseThePersonalAccount() throws Exception {
        mvc.perform(get("/api/personal-tools/memberships")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "owner", roles = "PERSONAL_TOOLS")
    void exposesCsrfAndActualProviderConfigurationWithoutSecrets() throws Exception {
        mvc.perform(get("/api/personal-tools/memberships/session")).andExpect(status().isOk())
                .andExpect(jsonPath("$.csrf.token").isNotEmpty())
                .andExpect(jsonPath("$.emailEnabled").value(true))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("password"))));
    }

    @Test
    @WithMockUser(username = "owner", roles = "PERSONAL_TOOLS")
    void syncPersistsHistoryClaimsOnceAndRejectsStaleOrRewrittenPeriods() throws Exception {
        String id = UUID.randomUUID().toString();
        String period = UUID.randomUUID().toString();
        String body = snapshot(period, "Synthetic annual membership", 0, false);
        mvc.perform(put("/api/personal-tools/memberships/" + id).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.periods[0].status").value("PENDING"));
        mvc.perform(get("/api/personal-tools/memberships"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString(period)));
        int before = mail.submitted.size();
        notifications.getObject().dispatchDueReminders();
        notifications.getObject().dispatchDueReminders();
        assertThat(mail.submitted.size()).isEqualTo(before + 1);
        mvc.perform(put("/api/personal-tools/memberships/" + id).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
        mvc.perform(put("/api/personal-tools/memberships/" + id).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(snapshot(period, "Edited membership", 1, false).replace("1234", "9999")))
                .andExpect(status().isConflict());
        mvc.perform(put("/api/personal-tools/memberships/" + id).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(snapshot(period, "Edited membership", 1, false)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.periods[0].status").value("SMTP_ACCEPTED"));
    }

    @Test
    @WithMockUser(username = "owner", roles = "PERSONAL_TOOLS")
    void archivedMembershipDoesNotSendAndInvalidSnapshotIsAtomic() throws Exception {
        String id = UUID.randomUUID().toString();
        String period = UUID.randomUUID().toString();
        mvc.perform(put("/api/personal-tools/memberships/" + id).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(snapshot(period, "Archived synthetic", 0, true)))
                .andExpect(status().isOk());
        int before = mail.submitted.size();
        notifications.getObject().dispatchDueReminders();
        assertThat(mail.submitted.size()).isEqualTo(before);
        String invalidId = UUID.randomUUID().toString();
        mvc.perform(put("/api/personal-tools/memberships/" + invalidId).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(snapshot(UUID.randomUUID().toString(), "Invalid synthetic", 0, false)
                        .replace("member@example.invalid", "bad-address")))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/personal-tools/memberships"))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString(invalidId))));
    }

    private String snapshot(String period, String service, int version, boolean archived) {
        LocalDate end = LocalDate.now(ZoneId.of("Asia/Shanghai")).plusDays(10);
        return """
                {"expectedVersion":%d,"service":"%s","accountLabel":"synthetic",
                 "archived":%s,"periods":[{"id":"%s","startDate":"%s","endDate":"%s",
                 "amountMinor":1234,"currency":"CNY","reminderEmail":"member@example.invalid"}]}
                """.formatted(version, service, archived, period, end.minusYears(1), end);
    }
}
