package jumin.global.exception;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest
@Import(GlobalExceptionHandlerTest.ExceptionTestController.class)
class GlobalExceptionHandlerTest {

	@Autowired
	private MockMvc mockMvc;

	@MockitoBean
	private ExceptionTestService exceptionTestService;

	@Test
	@DisplayName("비즈니스 예외는 정의된 HTTP 상태와 메시지로 응답한다")
	void businessExceptionReturnsDefinedStatusAndMessage() throws Exception {
		given(exceptionTestService.business())
				.willThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

		mockMvc.perform(get("/test/business"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").doesNotExist())
				.andExpect(jsonPath("$.message").value("요청한 리소스를 찾을 수 없습니다."))
				.andExpect(jsonPath("$.errors").isEmpty());
	}

	@Test
	@DisplayName("DTO 검증에 실패하면 필드 오류를 포함해 400으로 응답한다")
	void invalidRequestBodyReturnsFieldError() throws Exception {
		mockMvc.perform(post("/test/validation")
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"name\":\"\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").doesNotExist())
				.andExpect(jsonPath("$.message").value("요청 값이 올바르지 않습니다."))
				.andExpect(jsonPath("$.errors[0].field").value("name"))
				.andExpect(jsonPath("$.errors[0].message").value("이름은 필수입니다."));
	}

	@Test
	@DisplayName("요청 본문을 읽을 수 없으면 파서 정보를 노출하지 않고 400으로 응답한다")
	void unreadableRequestBodyReturnsBadRequestWithoutParserDetails() throws Exception {
		mockMvc.perform(post("/test/validation")
					.contentType(MediaType.APPLICATION_JSON)
					.content("{"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").doesNotExist())
				.andExpect(jsonPath("$.message").value("요청 본문을 읽을 수 없습니다."))
				.andExpect(jsonPath("$.errors").isEmpty());
	}

	@Test
	@DisplayName("없는 리소스를 요청하면 404로 응답한다")
	void missingResourceReturnsNotFound() throws Exception {
		mockMvc.perform(get("/missing"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").doesNotExist())
				.andExpect(jsonPath("$.message").value("요청한 리소스를 찾을 수 없습니다."));
	}

	@Test
	@DisplayName("허용되지 않은 HTTP 메서드로 요청하면 405로 응답한다")
	void unsupportedHttpMethodReturnsMethodNotAllowed() throws Exception {
		mockMvc.perform(post("/test/business"))
				.andExpect(status().isMethodNotAllowed())
				.andExpect(header().string(HttpHeaders.ALLOW, "GET"))
				.andExpect(jsonPath("$.code").doesNotExist())
				.andExpect(jsonPath("$.message").value("허용되지 않은 HTTP 메서드입니다."));
	}

	@Test
	@DisplayName("지원하지 않는 미디어 타입으로 요청하면 415로 응답한다")
	void unsupportedMediaTypeReturnsUnsupportedMediaType() throws Exception {
		mockMvc.perform(post("/test/validation")
					.contentType(MediaType.TEXT_PLAIN)
					.content("name"))
				.andExpect(status().isUnsupportedMediaType())
				.andExpect(header().exists(HttpHeaders.ACCEPT))
				.andExpect(jsonPath("$.code").doesNotExist())
				.andExpect(jsonPath("$.message").value("지원하지 않는 미디어 타입입니다."));
	}

	@Test
	@DisplayName("필수 헤더가 누락되면 Spring이 정의한 400 상태를 유지한다")
	void missingRequestHeaderPreservesBadRequestStatus() throws Exception {
		mockMvc.perform(get("/test/header"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").doesNotExist())
				.andExpect(jsonPath("$.message").isNotEmpty())
				.andExpect(jsonPath("$.errors").isEmpty());
	}

	@Test
	@DisplayName("ResponseStatusException이 정의한 HTTP 상태를 유지한다")
	void responseStatusExceptionPreservesDefinedStatus() throws Exception {
		given(exceptionTestService.responseStatus())
				.willThrow(new ResponseStatusException(HttpStatus.CONFLICT, "요청이 현재 상태와 충돌합니다."));

		mockMvc.perform(get("/test/response-status"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").doesNotExist())
				.andExpect(jsonPath("$.message").value("요청이 현재 상태와 충돌합니다."))
				.andExpect(jsonPath("$.errors").isEmpty());
	}

	@Test
	@DisplayName("예상하지 못한 예외는 내부 메시지를 노출하지 않고 500으로 응답한다")
	void unexpectedExceptionDoesNotExposeInternalMessage() throws Exception {
		given(exceptionTestService.unexpected())
				.willThrow(new IllegalStateException("sensitive detail"));

		mockMvc.perform(get("/test/unexpected"))
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.code").doesNotExist())
				.andExpect(jsonPath("$.message").value("요청을 처리하는 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."))
				.andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.not("sensitive detail")));
	}

	@RestController
	static class ExceptionTestController {

		private final ExceptionTestService exceptionTestService;

		ExceptionTestController(ExceptionTestService exceptionTestService) {
			this.exceptionTestService = exceptionTestService;
		}

		@GetMapping("/test/business")
		String business() {
			return exceptionTestService.business();
		}

		@PostMapping("/test/validation")
		void validation(@Valid @RequestBody ExceptionTestRequest request) {
		}

		@GetMapping("/test/unexpected")
		String unexpected() {
			return exceptionTestService.unexpected();
		}

		@GetMapping("/test/header")
		void header(@RequestHeader("X-Test-Header") String header) {
		}

		@GetMapping("/test/response-status")
		String responseStatus() {
			return exceptionTestService.responseStatus();
		}
	}

	interface ExceptionTestService {

		String business();

		String unexpected();

		String responseStatus();
	}

	record ExceptionTestRequest(@NotBlank(message = "이름은 필수입니다.") String name) {
	}
}
