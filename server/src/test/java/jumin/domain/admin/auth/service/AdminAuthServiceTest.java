package jumin.domain.admin.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import javax.crypto.SecretKey;
import jumin.config.AdminAuthProperties;
import jumin.config.AdminSecurityConfig;
import jumin.domain.admin.auth.dto.AdminLoginRequest;
import jumin.domain.admin.auth.dto.AdminLoginResponse;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;

class AdminAuthServiceTest {

    private static final String LOGIN_ID = "test-admin";
    private static final String PASSWORD = "test-password";
    private static final String TOKEN_SECRET = "test-only-admin-token-secret-32-bytes";
    private static final Instant NOW = Instant.now();

    private AdminAuthService adminAuthService;
    private JwtDecoder jwtDecoder;

    @BeforeEach
    void setUp() {
        configureService(PASSWORD);
    }

    private void configureService(String password) {
        PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
        AdminAuthProperties properties = new AdminAuthProperties(
                LOGIN_ID,
                passwordEncoder.encode(password),
                TOKEN_SECRET,
                Duration.ofHours(2),
                "test"
        );
        AdminSecurityConfig securityConfig = new AdminSecurityConfig();
        SecretKey secretKey = securityConfig.adminTokenSecretKey(properties);
        JwtEncoder jwtEncoder = securityConfig.adminJwtEncoder(secretKey);
        jwtDecoder = securityConfig.adminJwtDecoder(secretKey, properties);
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        adminAuthService = new AdminAuthService(
                properties,
                passwordEncoder,
                jwtEncoder,
                clock
        );
    }

    @Test
    @DisplayName("정상 계정으로 로그인하면 2시간 유효한 Bearer 토큰을 반환한다")
    void issuesTwoHourBearerToken() {
        AdminLoginResponse response = adminAuthService.login(
                new AdminLoginRequest("  " + LOGIN_ID + "  ", PASSWORD)
        );

        Jwt jwt = jwtDecoder.decode(response.accessToken());
        assertThat(response.tokenType())
                .isEqualTo("Bearer");
        assertThat(response.expiresInSeconds())
                .isEqualTo(7_200);
        assertThat(Duration.between(jwt.getIssuedAt(), jwt.getExpiresAt()))
                .isEqualTo(Duration.ofHours(2));
        assertThat(jwt.getClaimAsString("iss"))
                .isEqualTo("jumin-admin-test");
        assertThat(jwt.getSubject())
                .isEqualTo("admin");
    }

    @Test
    @DisplayName("잘못된 ID와 비밀번호는 동일한 로그인 실패 오류를 반환한다")
    void rejectsInvalidCredentialsWithSameError() {
        assertLoginFailed(new AdminLoginRequest("wrong-admin", PASSWORD));
        assertLoginFailed(new AdminLoginRequest(LOGIN_ID, "wrong-password"));
    }

    @Test
    @DisplayName("공백을 포함한 비밀번호는 공백까지 일치해야 로그인할 수 있다")
    void preservesSpacesInConfiguredPassword() {
        String passwordWithSpaces = " " + PASSWORD + " ";
        configureService(passwordWithSpaces);

        AdminLoginResponse response = adminAuthService.login(new AdminLoginRequest(LOGIN_ID, passwordWithSpaces));

        assertThat(response.accessToken())
                .isNotBlank();
        assertLoginFailed(new AdminLoginRequest(LOGIN_ID, PASSWORD));
    }

    private void assertLoginFailed(AdminLoginRequest request) {
        assertThatThrownBy(() -> adminAuthService.login(request))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.ADMIN_LOGIN_FAILED);
    }
}
