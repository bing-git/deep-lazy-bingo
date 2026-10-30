package com.deeplazy.bingo.service;

import java.util.Properties;

import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

public final class JavaMailSmtpTransport implements SmtpTransport {
    private static final String SUBJECT = "Membership expiry reminder";
    private static final String FAILURE = "SMTP submission failed";
    private final JavaMailSenderImpl sender;
    private final String from;

    public JavaMailSmtpTransport(JavaMailSender sender, String from) {
        if (!(sender instanceof JavaMailSenderImpl implementation)
                || !MembershipNotificationService.isSafeRecipient(from)) {
            throw new IllegalArgumentException("Safe SMTP sender configuration required");
        }
        this.sender = implementation;
        this.from = from;
        requireTls();
    }

    @Override
    public void send(String recipient, String body) throws SmtpTransportException {
        if (!MembershipNotificationService.isSafeRecipient(recipient)
                || !MembershipNotificationService.isSafeBody(body)) {
            throw new SmtpTransportException(FAILURE);
        }
        try {
            requireTls();
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(recipient);
            message.setSubject(SUBJECT);
            message.setText(body);
            sender.send(message);
        } catch (MailException | IllegalArgumentException exception) {
            throw new SmtpTransportException(FAILURE);
        }
    }

    private void requireTls() {
        String protocol = sender.getProtocol();
        if (protocol == null) {
            protocol = "smtp";
            sender.setProtocol(protocol);
        }
        if (!"smtp".equals(protocol) && !"smtps".equals(protocol)) {
            throw new IllegalArgumentException("TLS SMTP configuration required");
        }
        Properties properties = sender.getJavaMailProperties();
        String prefix = "mail." + protocol + ".";
        boolean implicitTls = Boolean.parseBoolean(properties.getProperty(prefix + "ssl.enable"));
        boolean requiredStartTls = Boolean.parseBoolean(properties.getProperty(prefix + "starttls.enable"))
                && Boolean.parseBoolean(properties.getProperty(prefix + "starttls.required"));
        if ((!implicitTls && !("smtp".equals(protocol) && requiredStartTls))
                || properties.containsKey(prefix + "ssl.trust")
                || properties.containsKey(prefix + "ssl.socketFactory")
                || properties.containsKey(prefix + "ssl.socketFactory.class")
                || properties.containsKey(prefix + "socketFactory")
                || properties.containsKey(prefix + "socketFactory.class")) {
            throw new IllegalArgumentException("TLS SMTP configuration required");
        }
        properties.setProperty(prefix + "ssl.checkserveridentity", "true");
        properties.setProperty(prefix + "connectiontimeout", "10000");
        properties.setProperty(prefix + "timeout", "10000");
        properties.setProperty(prefix + "writetimeout", "10000");
        properties.setProperty("mail.debug", "false");
        properties.setProperty("mail.debug.auth", "false");
        sender.getSession().setDebug(false);
    }
}