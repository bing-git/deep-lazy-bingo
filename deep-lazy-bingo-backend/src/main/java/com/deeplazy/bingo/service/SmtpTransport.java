package com.deeplazy.bingo.service;

public interface SmtpTransport {

    void send(String recipient, String body) throws SmtpTransportException;

    final class SmtpTransportException extends Exception {
        private static final long serialVersionUID = 1L;

        public SmtpTransportException(String message) {
            super(message);
        }
    }
}