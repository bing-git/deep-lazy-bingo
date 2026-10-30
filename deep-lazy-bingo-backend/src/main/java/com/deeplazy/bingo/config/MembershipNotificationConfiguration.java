package com.deeplazy.bingo.config;

import java.time.Clock;

import com.deeplazy.bingo.mapper.MembershipReminderMapper;
import com.deeplazy.bingo.service.JavaMailSmtpTransport;
import com.deeplazy.bingo.service.MembershipNotificationScheduler;
import com.deeplazy.bingo.service.MembershipNotificationService;
import com.deeplazy.bingo.service.SmtpTransport;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.mail.autoconfigure.MailSenderAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "bingo.membership.notifications", name = "enabled",
        havingValue = "true", matchIfMissing = false)
@EnableConfigurationProperties(MembershipNotificationProperties.class)
@Import(MailSenderAutoConfiguration.class)
@EnableScheduling
public class MembershipNotificationConfiguration {

    @Bean
    @ConditionalOnMissingBean(SmtpTransport.class)
    @ConditionalOnBean(JavaMailSender.class)
    SmtpTransport membershipSmtpTransport(JavaMailSender sender, MembershipNotificationProperties properties) {
        return new JavaMailSmtpTransport(sender, properties.getFrom());
    }

    @Bean
    MembershipNotificationService membershipNotificationService(MembershipReminderMapper mapper,
            SmtpTransport transport, MembershipNotificationProperties properties) {
        return new MembershipNotificationService(mapper, transport, Clock.system(properties.getZone()),
                properties.isEnabled());
    }

    @Bean
    MembershipNotificationScheduler membershipNotificationScheduler(MembershipNotificationService service) {
        return new MembershipNotificationScheduler(service);
    }
}