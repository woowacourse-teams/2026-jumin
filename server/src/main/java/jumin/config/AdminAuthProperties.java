package jumin.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "admin.auth")
public record AdminAuthProperties(
        @NotBlank String loginId,
        @NotBlank String passwordHash,
        @NotBlank @Size(min = 32) String tokenSecret,
        @NotNull Duration tokenExpiration,
        @NotBlank String environment
) {

    private static final Duration REQUIRED_TOKEN_EXPIRATION = Duration.ofHours(2);
    private static final Pattern BCRYPT_PATTERN = Pattern.compile(
            "\\A\\$2[aby]\\$(?:0[4-9]|[12][0-9]|3[01])\\$[./A-Za-z0-9]{53}\\z"
    );

    public AdminAuthProperties {
        if (passwordHash != null && !isBcryptHash(passwordHash)) {
            throw new IllegalArgumentException("관리자 비밀번호 해시는 BCrypt 형식이어야 합니다.");
        }
        if (tokenExpiration != null && !REQUIRED_TOKEN_EXPIRATION.equals(tokenExpiration)) {
            throw new IllegalArgumentException("관리자 토큰 만료시간은 2시간이어야 합니다.");
        }
    }

    public String issuer() {
        return "jumin-admin-" + environment;
    }

    private static boolean isBcryptHash(String passwordHash) {
        return BCRYPT_PATTERN.matcher(passwordHash)
                .matches();
    }
}
