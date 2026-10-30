package com.deeplazy.bingo.config;

import java.time.ZoneId;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("bingo.membership.notifications")
public class MembershipNotificationProperties {
    private boolean enabled = false;
    private ZoneId zone = ZoneId.of("Asia/Shanghai");
    private String from;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public ZoneId getZone() { return zone; }
    public void setZone(ZoneId zone) { this.zone = zone; }
    public String getFrom() { return from; }
    public void setFrom(String from) { this.from = from; }
}