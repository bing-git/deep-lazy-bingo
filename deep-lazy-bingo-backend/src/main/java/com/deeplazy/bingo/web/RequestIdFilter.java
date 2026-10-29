package com.deeplazy.bingo.web;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Establishes a bounded ASCII request identifier before security processing. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

	private static final Pattern SAFE_ID = Pattern.compile("[A-Za-z0-9_.-]{1,64}");

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		String candidate = request.getHeader("X-Request-Id");
		String requestId = candidate != null && SAFE_ID.matcher(candidate).matches()
			? candidate : UUID.randomUUID().toString();
		response.setHeader("X-Request-Id", requestId);
		MDC.put("requestId", requestId);
		try {
			filterChain.doFilter(request, response);
		} finally {
			MDC.remove("requestId");
		}
	}
}