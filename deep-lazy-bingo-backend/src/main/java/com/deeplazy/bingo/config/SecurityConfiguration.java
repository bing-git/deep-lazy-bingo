package com.deeplazy.bingo.config;

import java.io.IOException;

import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.Customizer;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import tools.jackson.databind.ObjectMapper;

/** Public probes plus an explicitly enabled, single-account membership API. */
@Configuration(proxyBeanMethods = false)
public class SecurityConfiguration {

	private static final String[] HEALTH_PATHS = {
		"/actuator/health", "/actuator/health/liveness", "/actuator/health/readiness"
	};

	/** Prevents creation of a generated default account. */
	@Bean
	public UserDetailsService userDetailsService(Environment environment) {
		if (!environment.getProperty("bingo.personal-tools.enabled", Boolean.class, false)) {
			return new InMemoryUserDetailsManager();
		}
		String hash = environment.getProperty("bingo.personal-tools.password-hash", "");
		if (!hash.matches("\\{bcrypt}\\$2[aby]\\$.{56}")) {
			throw new IllegalStateException("Run --init-local before enabling the personal tools API.");
		}
		return new InMemoryUserDetailsManager(User.withUsername(
			environment.getRequiredProperty("bingo.personal-tools.username"))
			.password(hash).roles("PERSONAL_TOOLS").build());
	}

	/** Keeps CSRF on membership writes and denies all other non-health endpoints. */
	@Bean
	public SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectMapper objectMapper,
			Environment environment) throws Exception {
		boolean enabled = environment.getProperty("bingo.personal-tools.enabled", Boolean.class, false);
		String username = environment.getProperty("bingo.personal-tools.username", "");
		http.authorizeHttpRequests(authorize -> authorize
			.requestMatchers(HttpMethod.GET, HEALTH_PATHS).permitAll()
			.requestMatchers(HttpMethod.HEAD, HEALTH_PATHS).permitAll()
			.requestMatchers("/api/personal-tools/memberships", "/api/personal-tools/memberships/**")
				.access((authentication, request) -> new AuthorizationDecision(enabled
					&& username.equals(authentication.get().getName())
					&& authentication.get().getAuthorities().stream()
						.anyMatch(authority -> authority.getAuthority().equals("ROLE_PERSONAL_TOOLS"))))
			.anyRequest().denyAll())
			.formLogin(AbstractHttpConfigurer::disable)
			.requestCache(AbstractHttpConfigurer::disable)
			.logout(AbstractHttpConfigurer::disable)
			.sessionManagement(session -> session.sessionCreationPolicy(
				enabled ? SessionCreationPolicy.IF_REQUIRED : SessionCreationPolicy.STATELESS))
			.exceptionHandling(errors -> errors
				.authenticationEntryPoint((request, response, exception) ->
					writeProblem(response, objectMapper, HttpStatus.UNAUTHORIZED, "Authentication required."))
				.accessDeniedHandler((request, response, exception) ->
					writeProblem(response, objectMapper, HttpStatus.FORBIDDEN, "Access denied.")));
		if (enabled) {
			http.httpBasic(Customizer.withDefaults());
		} else {
			http.httpBasic(AbstractHttpConfigurer::disable);
		}
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