package jumin.domain.admin.auth.service;

import java.time.Clock;
import java.time.Instant;
import jumin.config.AdminAuthProperties;
import jumin.domain.admin.auth.dto.AdminLoginRequest;
import jumin.domain.admin.auth.dto.AdminLoginResponse;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AdminAuthService {

    private static final String ADMIN_SUBJECT = "admin";

    private final AdminAuthProperties properties;
    private final PasswordEncoder passwordEncoder;
    private final JwtEncoder jwtEncoder;
    private final Clock clock;

    public AdminLoginResponse login(AdminLoginRequest request) {
        String loginId = request.loginId()
                .strip();
        boolean loginIdMatches = properties.loginId()
                .equals(loginId);
        boolean passwordMatches = passwordEncoder.matches(request.password(), properties.passwordHash());
        if (!loginIdMatches || !passwordMatches) {
            throw new BusinessException(ErrorCode.ADMIN_LOGIN_FAILED);
        }

        Jwt token = issueAccessToken();
        return AdminLoginResponse.from(token.getTokenValue(), properties.tokenExpiration());
    }

    private Jwt issueAccessToken() {
        Instant issuedAt = clock.instant();
        Instant expiresAt = issuedAt.plus(properties.tokenExpiration());
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .subject(ADMIN_SUBJECT)
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256)
                .build();
        return jwtEncoder.encode(JwtEncoderParameters.from(header, claims));
    }
}
