package com.deeplazy.bingo.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Returns fixed error details without exposing exception payloads. */
@RestControllerAdvice
public class RestExceptionHandler extends ResponseEntityExceptionHandler {

	private static final Logger LOGGER = LoggerFactory.getLogger(RestExceptionHandler.class);

	/** Rejects invalid arguments without returning their messages. */
	@ExceptionHandler(IllegalArgumentException.class)
	public ResponseEntity<Object> handleInvalidArgument(IllegalArgumentException exception) {
		return ResponseEntity.badRequest().body(problem(HttpStatus.BAD_REQUEST, "Invalid request."));
	}

	/** Logs only correlation and exception type for unexpected failures. */
	@ExceptionHandler(Exception.class)
	public ResponseEntity<Object> handleUnexpected(Exception exception) {
		LOGGER.error("requestId={} exceptionType={}", MDC.get("requestId"), exception.getClass().getName());
		return ResponseEntity.internalServerError()
			.body(problem(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred."));
	}

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException exception,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		ProblemDetail body = problem(status, "Request validation failed.");
		body.setProperty("fields", exception.getBindingResult().getFieldErrors().stream()
			.map(error -> error.getField()).distinct().sorted().toList());
		return new ResponseEntity<>(body, headers, status);
	}

	@Override
	protected ResponseEntity<Object> handleExceptionInternal(Exception exception, Object body,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		String detail = status.value() == HttpStatus.BAD_REQUEST.value()
			? "Invalid request." : "Request could not be processed.";
		return super.handleExceptionInternal(exception, problem(status, detail), headers, status, request);
	}

	private ProblemDetail problem(HttpStatusCode status, String detail) {
		ProblemDetail body = ProblemDetail.forStatusAndDetail(status, detail);
		String requestId = MDC.get("requestId");
		if (requestId != null) {
			body.setProperty("requestId", requestId);
		}
		return body;
	}
}