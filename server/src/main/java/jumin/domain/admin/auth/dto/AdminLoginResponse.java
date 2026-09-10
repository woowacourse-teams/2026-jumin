package jumin.domain.admin.auth.dto;

import java.time.Duration;

public record AdminLoginResponse(
        String accessToken,
        String tokenType,
        long expiresInSeconds
) {

    private static final String BEARER_TOKEN_TYPE = "Bearer";

    public static AdminLoginResponse from(String accessToken, Duration tokenExpiration) {
        return new AdminLoginResponse(
                accessToken,
                BEARER_TOKEN_TYPE,
                tokenExpiration.toSeconds()
        );
    }
}
