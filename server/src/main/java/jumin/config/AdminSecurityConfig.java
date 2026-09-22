package jumin.config;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import jumin.domain.admin.auth.security.AdminAuthenticationEntryPoint;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.savedrequest.NullRequestCache;

@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(AdminAuthProperties.class)
public class AdminSecurityConfig {

    @Bean
    public SecurityFilterChain adminSecurityFilterChain(
            HttpSecurity http,
            AdminAuthenticationEntryPoint authenticationEntryPoint
    ) throws Exception {
        return http.csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(requestCache -> requestCache.requestCache(new NullRequestCache()))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.POST, "/api/admin/auth/login")
                        .permitAll()
                        .requestMatchers("/api/admin/**")
                        .authenticated()
                        .anyRequest()
                        .permitAll())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(Customizer.withDefaults())
                        .authenticationEntryPoint(authenticationEntryPoint))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(authenticationEntryPoint))
                .build();
    }

    @Bean
    public PasswordEncoder adminPasswordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecretKey adminTokenSecretKey(AdminAuthProperties properties) {
        byte[] secret = properties.tokenSecret()
                .getBytes(StandardCharsets.UTF_8);
        return new SecretKeySpec(secret, "HmacSHA256");
    }

    @Bean
    public JwtEncoder adminJwtEncoder(SecretKey adminTokenSecretKey) {
        return NimbusJwtEncoder.withSecretKey(adminTokenSecretKey)
                .algorithm(MacAlgorithm.HS256)
                .build();
    }

    @Bean
    public JwtDecoder adminJwtDecoder(
            SecretKey adminTokenSecretKey,
            AdminAuthProperties properties
    ) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(adminTokenSecretKey)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        JwtTimestampValidator timestampValidator = new JwtTimestampValidator(Duration.ZERO);
        OAuth2TokenValidator<Jwt> validator = JwtValidators.createDefaultWithValidators(
                List.of(timestampValidator, new JwtIssuerValidator(properties.issuer()))
        );
        decoder.setJwtValidator(validator);
        return decoder;
    }

    @Bean
    public Clock adminAuthClock() {
        return Clock.systemUTC();
    }
}
