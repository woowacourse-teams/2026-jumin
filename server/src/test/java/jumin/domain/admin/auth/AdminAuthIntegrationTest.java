package jumin.domain.admin.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import jumin.config.AdminSecurityConfig;
import jumin.domain.admin.auth.controller.AdminAuthController;
import jumin.domain.admin.auth.security.AdminAuthenticationEntryPoint;
import jumin.domain.admin.auth.service.AdminAuthService;
import jumin.domain.parking.controller.ParkingSearchController;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.service.ParkingSearchService;
import jumin.global.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

@WebMvcTest(
        controllers = {AdminAuthController.class, ParkingSearchController.class},
        properties = {
                "admin.auth.login-id=test-admin",
                "admin.auth.password-hash=$2y$10$2CGdlyW93vq30OgJ1NTD.OSCmxr1w9FNTD7E728l2ax58qias8r5a",
                "admin.auth.token-secret=test-only-admin-token-secret-32-bytes",
                "admin.auth.environment=test"
        }
)
@Import({
        AdminSecurityConfig.class,
        AdminAuthenticationEntryPoint.class,
        AdminAuthService.class,
        GlobalExceptionHandler.class
})
class AdminAuthIntegrationTest {

    private static final String LOGIN_PATH = "/api/admin/auth/login";
    private static final String PROTECTED_PATH = "/api/admin/parking/csv/preview";
    private static final String LOGIN_ID = "test-admin";
    private static final String PASSWORD = "test-password";
    private static final String LOGIN_FAILED_MESSAGE = "아이디 또는 비밀번호가 올바르지 않습니다.";
    private static final String AUTHENTICATION_REQUIRED_MESSAGE = "인증이 필요합니다.";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtEncoder jwtEncoder;

    @MockitoBean
    private ParkingSearchService parkingSearchService;

    @Test
    @DisplayName("정상 로그인은 Bearer 토큰과 7200초 만료시간 및 no-store 헤더를 반환한다")
    void returnsAccessTokenForValidCredentials() throws Exception {
        MvcResult result = login(LOGIN_ID, PASSWORD)
                .andExpect(status()
                        .isOk())
                .andExpect(header()
                        .string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.accessToken")
                        .isString())
                .andExpect(jsonPath("$.tokenType")
                        .value("Bearer"))
                .andExpect(jsonPath("$.expiresInSeconds")
                        .value(7_200))
                .andReturn();

        assertThat(result.getRequest()
                .getSession(false))
                .isNull();
        assertThat(result.getResponse()
                .getCookie("JSESSIONID"))
                .isNull();
    }

    @Test
    @DisplayName("잘못된 ID와 비밀번호는 같은 401 응답을 반환한다")
    void returnsSameUnauthorizedResponseForInvalidCredentials() throws Exception {
        assertLoginFailed("wrong-admin", PASSWORD);
        assertLoginFailed(LOGIN_ID, "wrong-password");
    }

    @Test
    @DisplayName("로그인 실패가 반복되어도 차단하지 않고 정상 계정의 로그인을 허용한다")
    void allowsLoginAfterRepeatedFailures() throws Exception {
        for (int attempt = 0; attempt < 6; attempt++) {
            assertLoginFailed(LOGIN_ID, "wrong-password");
        }

        login(LOGIN_ID, PASSWORD)
                .andExpect(status()
                        .isOk());
    }

    @Test
    @DisplayName("ID 앞뒤 공백은 제거하고 비밀번호 공백은 그대로 검증한다")
    void trimsOnlyLoginId() throws Exception {
        login("  " + LOGIN_ID + "  ", PASSWORD)
                .andExpect(status()
                        .isOk());

        assertLoginFailed(LOGIN_ID, " " + PASSWORD + " ");
        assertLoginFailed(LOGIN_ID, "   ");
    }

    @Test
    @DisplayName("ID나 비밀번호가 누락되거나 빈 값이면 400을 반환한다")
    void rejectsMissingOrEmptyCredentials() throws Exception {
        assertValidationError(
                "{\"password\":\"test-password\"}",
                "loginId",
                "관리자 ID는 필수입니다."
        );
        assertValidationError(
                "{\"loginId\":\"test-admin\"}",
                "password",
                "비밀번호는 필수입니다."
        );
        assertValidationError(
                "{\"loginId\":\"\",\"password\":\"test-password\"}",
                "loginId",
                "관리자 ID는 필수입니다."
        );
        assertValidationError(
                "{\"loginId\":\"   \",\"password\":\"test-password\"}",
                "loginId",
                "관리자 ID는 필수입니다."
        );
        assertValidationError(
                "{\"loginId\":\"test-admin\",\"password\":\"\"}",
                "password",
                "비밀번호는 필수입니다."
        );
    }

    @Test
    @DisplayName("요청 본문이 없거나 JSON 형식이 잘못되면 400을 반환한다")
    void rejectsMissingOrMalformedRequestBody() throws Exception {
        mockMvc.perform(post(LOGIN_PATH)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status()
                        .isBadRequest())
                .andExpect(jsonPath("$.errors")
                        .isEmpty());

        mockMvc.perform(post(LOGIN_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status()
                        .isBadRequest())
                .andExpect(jsonPath("$.errors")
                        .isEmpty());
    }

    @Test
    @DisplayName("토큰 없이 보호된 어드민 API를 호출하면 공통 401 응답을 반환한다")
    void rejectsProtectedAdminRequestWithoutToken() throws Exception {
        MvcResult result = mockMvc.perform(post(PROTECTED_PATH))
                .andExpect(status()
                        .isUnauthorized())
                .andExpect(header()
                        .string(HttpHeaders.WWW_AUTHENTICATE, "Bearer"))
                .andExpect(content()
                        .contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.message")
                        .value(AUTHENTICATION_REQUIRED_MESSAGE))
                .andExpect(jsonPath("$.errors")
                        .isEmpty())
                .andReturn();

        assertThat(result.getRequest()
                .getSession(false))
                .isNull();
    }

    @Test
    @DisplayName("만료된 토큰은 보호된 어드민 API에서 401을 반환한다")
    void rejectsExpiredToken() throws Exception {
        Instant now = Instant.now();
        String expiredToken = createToken(
                jwtEncoder,
                now.minusSeconds(7_200),
                now.minusSeconds(600)
        );

        assertInvalidToken(expiredToken);
    }

    @Test
    @DisplayName("만료된 지 1초인 토큰도 시간 오차 허용 없이 401을 반환한다")
    void rejectsTokenExpiredOneSecondAgo() throws Exception {
        Instant now = Instant.now();
        String expiredToken = createToken(
                jwtEncoder,
                now.minusSeconds(7_201),
                now.minusSeconds(1)
        );

        assertInvalidToken(expiredToken);
    }

    @Test
    @DisplayName("다른 키로 서명한 토큰은 보호된 어드민 API에서 401을 반환한다")
    void rejectsTokenSignedWithDifferentSecret() throws Exception {
        SecretKey wrongSecretKey = new SecretKeySpec(
                "different-test-token-secret-32-bytes".getBytes(StandardCharsets.UTF_8),
                "HmacSHA256"
        );
        JwtEncoder wrongEncoder = NimbusJwtEncoder.withSecretKey(wrongSecretKey)
                .algorithm(MacAlgorithm.HS256)
                .build();
        Instant now = Instant.now();
        String invalidToken = createToken(wrongEncoder, now, now.plusSeconds(7_200));

        assertInvalidToken(invalidToken);
    }

    @Test
    @DisplayName("같은 키로 서명해도 다른 환경의 issuer인 토큰은 401을 반환한다")
    void rejectsTokenWithDifferentIssuer() throws Exception {
        Instant now = Instant.now();
        String invalidToken = createToken(jwtEncoder, now, now.plusSeconds(7_200), "jumin-admin-other");

        assertInvalidToken(invalidToken);
    }

    @Test
    @DisplayName("정상 토큰은 어드민 경로의 인증을 통과한다")
    void acceptsValidTokenForProtectedAdminPath() throws Exception {
        String accessToken = loginAndReadAccessToken();

        mockMvc.perform(post(PROTECTED_PATH)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status()
                        .isNotFound());
    }

    @Test
    @DisplayName("기존 사용자 API는 토큰 없이 접근할 수 있다")
    void keepsExistingUserApiPublic() throws Exception {
        given(parkingSearchService.search(any(ParkingSearchRequest.class)))
                .willReturn(ParkingSearchResponse.from(600, List.of()));

        mockMvc.perform(get("/api/parking/search")
                        .queryParam("destinationLatitude", "37.5665")
                        .queryParam("destinationLongitude", "126.9780")
                        .queryParam("entryAt", "2026-09-03T10:00:00+09:00")
                        .queryParam("exitAt", "2026-09-03T11:00:00+09:00"))
                .andExpect(status()
                        .isOk());
    }

    private ResultActions login(String loginId, String password) throws Exception {
        String requestBody = """
                {"loginId":"%s","password":"%s"}
                """.formatted(loginId, password);
        return mockMvc.perform(post(LOGIN_PATH)
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody));
    }

    private void assertLoginFailed(String loginId, String password) throws Exception {
        login(loginId, password)
                .andExpect(status()
                        .isUnauthorized())
                .andExpect(jsonPath("$.message")
                        .value(LOGIN_FAILED_MESSAGE))
                .andExpect(jsonPath("$.errors")
                        .isEmpty());
    }

    private void assertValidationError(
            String requestBody,
            String field,
            String message
    ) throws Exception {
        mockMvc.perform(post(LOGIN_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status()
                        .isBadRequest())
                .andExpect(jsonPath("$.message")
                        .value("요청 값이 올바르지 않습니다."))
                .andExpect(jsonPath("$.errors[0].field")
                        .value(field))
                .andExpect(jsonPath("$.errors[0].message")
                        .value(message));
    }

    private void assertInvalidToken(String token) throws Exception {
        mockMvc.perform(post(PROTECTED_PATH)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status()
                        .isUnauthorized())
                .andExpect(header()
                        .string(HttpHeaders.WWW_AUTHENTICATE, "Bearer"))
                .andExpect(jsonPath("$.message")
                        .value(AUTHENTICATION_REQUIRED_MESSAGE))
                .andExpect(jsonPath("$.errors")
                        .isEmpty());
    }

    private String loginAndReadAccessToken() throws Exception {
        MvcResult result = login(LOGIN_ID, PASSWORD)
                .andExpect(status()
                        .isOk())
                .andReturn();
        return JsonPath.read(result.getResponse()
                .getContentAsString(), "$.accessToken");
    }

    private String createToken(JwtEncoder encoder, Instant issuedAt, Instant expiresAt) {
        return createToken(encoder, issuedAt, expiresAt, "jumin-admin-test");
    }

    private String createToken(JwtEncoder encoder, Instant issuedAt, Instant expiresAt, String issuer) {
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .subject("admin")
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256)
                .build();
        return encoder.encode(JwtEncoderParameters.from(header, claims))
                .getTokenValue();
    }
}
