package jumin.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "admin.auth")
public record AdminAuthProperties(
        @NotBlank String loginId,
        @NotBlank String passwordHash,
        @NotBlank @Size(min = 32) String tokenSecret,
        @NotBlank String environment
) {

    private static final Pattern BCRYPT_PATTERN = Pattern.compile(
            "\\A\\$2[aby]\\$(?:0[4-9]|[12][0-9]|3[01])\\$[./A-Za-z0-9]{53}\\z"
    );

    public AdminAuthProperties {
        if (passwordHash != null && !isBcryptHash(passwordHash)) {
            throw new IllegalArgumentException("관리자 비밀번호 해시는 BCrypt 형식이어야 합니다.");
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
