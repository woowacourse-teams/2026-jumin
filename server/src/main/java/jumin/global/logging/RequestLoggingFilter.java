package jumin.global.logging;

import jakarta.annotation.Nonnull;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

@Slf4j
@Component
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final String REQUEST_ID_KEY = "request.id";
    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String HEALTH_PATH = "/actuator/health";
    private static final String UNMATCHED_PATH = "<unmatched>";

    @Override
    protected void doFilterInternal(
            @Nonnull HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String requestId = UUID.randomUUID().toString();
        long startedAt = System.nanoTime();

        MDC.put(REQUEST_ID_KEY, requestId);
        response.setHeader(REQUEST_ID_HEADER, requestId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            String requestPath = request.getRequestURI().substring(request.getContextPath().length());
            boolean isHealthCheck = requestPath.startsWith(HEALTH_PATH);
            Object matchedPattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
            String route = resolveRoute(isHealthCheck, matchedPattern);
            long durationMs = (System.nanoTime() - startedAt) / 1_000_000;
            log.atInfo()
                    .setMessage("HTTP request completed")
                    .addKeyValue("method", request.getMethod())
                    .addKeyValue("path", route)
                    .addKeyValue("requestType", isHealthCheck ? "health" : "application")
                    .addKeyValue("status", response.getStatus())
                    .addKeyValue("durationMs", durationMs)
                    .log();
            MDC.remove(REQUEST_ID_KEY);
        }
    }

    private static String resolveRoute(boolean isHealthCheck, Object matchedPattern) {
        if (isHealthCheck) {
            return HEALTH_PATH;
        }
        if (matchedPattern == null) {
            return UNMATCHED_PATH;
        }
        return matchedPattern.toString();
    }
}
