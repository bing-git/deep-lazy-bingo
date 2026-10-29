package com.deeplazy.bingo;

import com.baomidou.mybatisplus.autoconfigure.MybatisPlusProperties;
import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.BlockAttackInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import jakarta.servlet.Filter;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "logging.level.org.springframework.boot.security.autoconfigure=ERROR")
@ActiveProfiles("test")
@AutoConfigureMockMvc
class FrameworkSecurityTest {
	@Autowired MockMvc mvc;
	@Autowired ApplicationContext context;
	@Autowired MybatisPlusProperties mybatisProperties;

	@Test
	void healthGetAndHeadArePublic() throws Exception {
		for (String path : new String[]{"/actuator/health", "/actuator/health/liveness", "/actuator/health/readiness"}) {
			mvc.perform(get(path)).andExpect(status().isOk()).andExpect(jsonPath("$.components").doesNotExist());
			mvc.perform(head(path)).andExpect(status().isOk());
		}
	}

	@Test
	void unknownAndAdministrativeRoutesRequireAuthentication() throws Exception {
		for (String path : new String[]{"/unknown", "/api/v1/system/capabilities", "/actuator/info", "/v3/api-docs", "/swagger-ui/index.html", "/login"}) {
			mvc.perform(get(path)).andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(401))
				.andExpect(header().exists("X-Request-Id"));
		}
	}

	@Test
	@WithMockUser
	void authenticatedRequestsAreStillDenied() throws Exception {
		mvc.perform(get("/api/private")).andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403));
		mvc.perform(post("/actuator/health").with(csrf())).andExpect(status().isForbidden());
	}

	@Test
	void csrfRemainsEnabledAndCorsDoesNotOpenOrigins() throws Exception {
		mvc.perform(post("/api/private")).andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403));
		mvc.perform(get("/actuator/health/liveness").header("Origin", "https://untrusted.invalid"))
			.andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
	}

	@Test
	void generatedDefaultUserDoesNotExist() {
		var users = context.getBean(UserDetailsService.class);
		assertThatThrownBy(() -> users.loadUserByUsername("user")).isInstanceOf(UsernameNotFoundException.class);
	}

	@Test
	void acceptedRequestIdReachesRejectedResponse() throws Exception {
		mvc.perform(get("/api/private").header("X-Request-Id", "trace_123-ABC.9"))
			.andExpect(status().isUnauthorized()).andExpect(header().string("X-Request-Id", "trace_123-ABC.9"));
		assertThat(MDC.get("requestId")).isNull();
	}

	@Test
	void invalidAndOversizeIdsAreReplaced() throws Exception {
		for (String candidate : new String[]{"bad id", "x".repeat(65), "bad\r\nvalue", "\u4e2d\u6587", ""}) {
			String actual = mvc.perform(get("/api/private").header("X-Request-Id", candidate))
				.andReturn().getResponse().getHeader("X-Request-Id");
			assertThat(actual).isNotEqualTo(candidate);
			assertThat(UUID.fromString(actual)).isNotNull();
		}
	}

	@Test
	void filterSetsMdcOnceAndClearsItOnFailure() throws Exception {
		Filter filter = context.getBean("requestIdFilter", Filter.class);
		var request = new MockHttpServletRequest();
		request.addHeader("X-Request-Id", "trace-once");
		var response = new MockHttpServletResponse();
		assertThatThrownBy(() -> filter.doFilter(request, response, (incoming, outgoing) -> {
			assertThat(MDC.get("requestId")).isEqualTo("trace-once");
			filter.doFilter(incoming, outgoing, (nestedRequest, nestedResponse) ->
				assertThat(MDC.get("requestId")).isEqualTo("trace-once"));
			throw new jakarta.servlet.ServletException("synthetic failure");
		})).isInstanceOf(jakarta.servlet.ServletException.class);
		assertThat(response.getHeader("X-Request-Id")).isEqualTo("trace-once");
		assertThat(MDC.get("requestId")).isNull();
	}

	@Test
	void persistenceUsesSafePluginOrderAndPrefix() {
		var interceptors = context.getBean(MybatisPlusInterceptor.class).getInterceptors();
		assertThat(interceptors).hasSize(3);
		assertThat(interceptors.get(0)).isInstanceOf(OptimisticLockerInnerInterceptor.class);
		assertThat(interceptors.get(1)).isInstanceOf(BlockAttackInnerInterceptor.class);
		assertThat(interceptors.get(2)).isInstanceOf(PaginationInnerInterceptor.class);
		assertThat(((PaginationInnerInterceptor) interceptors.get(2)).getDbType()).isEqualTo(DbType.POSTGRE_SQL);
		assertThat(mybatisProperties.getGlobalConfig().getDbConfig().getTablePrefix()).isEqualTo("bingo_");
	}

	@Test
	void noBusinessControllersAreRegistered() {
		var mapping = context.getBean("requestMappingHandlerMapping", RequestMappingHandlerMapping.class);
		assertThat(mapping.getHandlerMethods().values()).noneMatch(handler ->
			handler.getBeanType().getPackageName().startsWith("com.deeplazy.bingo"));
	}

	@Test
	void illegalArgumentDoesNotEchoItsMessage() throws Exception {
		adviceMvc().perform(get("/fixture/argument")).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value("Invalid request."))
			.andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("sensitive-marker"))));
	}

	@Test
	void unexpectedFailureReturnsSanitizedProblem() throws Exception {
		adviceMvc().perform(get("/fixture/failure")).andExpect(status().isInternalServerError())
			.andExpect(jsonPath("$.detail").value("An unexpected error occurred."))
			.andExpect(jsonPath("$.stackTrace").doesNotExist())
			.andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("sensitive-marker"))));
	}

	@Test
	void validationOnlyReturnsSafeFieldNames() throws Exception {
		adviceMvc().perform(post("/fixture/validation").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\"}"))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("Request validation failed."))
			.andExpect(jsonPath("$.fields[0]").value("name"));
	}

	@Test
	void malformedBodyRetainsBadRequestStatus() throws Exception {
		adviceMvc().perform(post("/fixture/validation").contentType(MediaType.APPLICATION_JSON).content("{"))
			.andExpect(status().isBadRequest());
	}

	private MockMvc adviceMvc() {
		return MockMvcBuilders.standaloneSetup(new TestController())
			.setControllerAdvice(context.getBean("restExceptionHandler"))
			.setValidator(context.getBean(LocalValidatorFactoryBean.class)).build();
	}

	@RestController
	class TestController {
		@GetMapping("/fixture/argument")
		String argument() { throw new IllegalArgumentException("sensitive-marker"); }
		@GetMapping("/fixture/failure")
		String failure() { throw new IllegalStateException("sensitive-marker"); }
		@PostMapping("/fixture/validation")
		void validate(@Valid @RequestBody TestInput input) { }
	}

	record TestInput(@NotBlank String name) { }
}