package com.deeplazy.bingo.config;

import java.io.IOException;

import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import tools.jackson.databind.ObjectMapper;

/** Restricts the framework surface to public health probes. */
@Configuration(proxyBeanMethods = false)
public class SecurityConfiguration {

	private static final String[] HEALTH_PATHS = {
		"/actuator/health", "/actuator/health/liveness", "/actuator/health/readiness"
	};

	/** Prevents creation of a generated default account. */
	@Bean
	public UserDetailsService userDetailsService() {
		return new InMemoryUserDetailsManager();
	}

	/** Keeps CSRF protection while denying every non-health request. */
	@Bean
	public SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectMapper objectMapper) throws Exception {
		http.authorizeHttpRequests(authorize -> authorize
			.requestMatchers(HttpMethod.GET, HEALTH_PATHS).permitAll()
			.requestMatchers(HttpMethod.HEAD, HEALTH_PATHS).permitAll()
			.anyRequest().denyAll())
			.formLogin(AbstractHttpConfigurer::disable)
			.httpBasic(AbstractHttpConfigurer::disable)
			.requestCache(AbstractHttpConfigurer::disable)
			.logout(AbstractHttpConfigurer::disable)
			.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.exceptionHandling(errors -> errors
				.authenticationEntryPoint((request, response, exception) ->
					writeProblem(response, objectMapper, HttpStatus.UNAUTHORIZED, "Authentication required."))
				.accessDeniedHandler((request, response, exception) ->
					writeProblem(response, objectMapper, HttpStatus.FORBIDDEN, "Access denied.")));
		return http.build();
	}

	private void writeProblem(HttpServletResponse response, ObjectMapper objectMapper,
			HttpStatus status, String detail) throws IOException {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setProperty("requestId", MDC.get("requestId"));
		response.setStatus(status.value());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.getOutputStream().write(objectMapper.writeValueAsBytes(problem));
	}
}