package jumin.global.logging;

import static org.junit.jupiter.api.Assertions.assertEquals;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.event.KeyValuePair;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.servlet.HandlerMapping;

class RequestLoggingFilterTest {

    private final RequestLoggingFilter filter = new RequestLoggingFilter();
    private final Logger logger = (Logger) LoggerFactory.getLogger(RequestLoggingFilter.class);
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

    @BeforeEach
    void attachAppender() {
        appender.start();
        logger.addAppender(appender);
    }

    @AfterEach
    void detachAppender() {
        logger.detachAppender(appender);
        appender.stop();
    }

    @Test
    @DisplayName("경로 변수 대신 매칭된 경로 템플릿을 로그에 기록한다")
    void logsMatchedRouteTemplateInsteadOfPathVariable() throws Exception {
        // given
        MockHttpServletRequest request = request("/jumin/api/parking/123", "/jumin");
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE,
                "/api/parking/{parkingLotId}");

        // when
        filter.doFilter(request, new MockHttpServletResponse(), emptyChain());

        // then
        assertLoggedValue("path", "/api/parking/{parkingLotId}");
        assertLoggedValue("requestType", "application");
    }

    @Test
    @DisplayName("health 경로와 하위 경로를 health 요청으로 기록한다")
    void marksHealthRouteAndItsSubpathsAsHealthRequests() throws Exception {
        // given
        MockHttpServletRequest request = request(
                "/jumin/actuator/health/liveness", "/jumin");
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE,
                "/actuator/health/{*path}");

        // when
        filter.doFilter(request, new MockHttpServletResponse(), emptyChain());

        // then
        assertLoggedValue("path", "/actuator/health");
        assertLoggedValue("requestType", "health");
    }

    @Test
    @DisplayName("매칭된 경로가 없으면 실제 요청 경로 대신 unmatched를 기록한다")
    void usesUnmatchedMarkerInsteadOfRawUnmatchedPath() throws Exception {
        // given
        MockHttpServletRequest request = request(
                "/jumin/api/users/hana@example.com", "/jumin");

        // when
        filter.doFilter(request, new MockHttpServletResponse(), emptyChain());

        // then
        assertLoggedValue("path", "<unmatched>");
        assertLoggedValue("requestType", "application");
    }

    private MockHttpServletRequest request(String requestUri, String contextPath) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", requestUri);
        request.setContextPath(contextPath);
        return request;
    }

    private FilterChain emptyChain() {
        return (request, response) -> { };
    }

    private void assertLoggedValue(String key, String expectedValue) {
        ILoggingEvent event = appender.list.getFirst();

        for (KeyValuePair pair : event.getKeyValuePairs()) {
            if (pair.key.equals(key)) {
                assertEquals(expectedValue, pair.value);
                return;
            }
        }

        throw new AssertionError("로그에 '" + key + "' 항목이 없습니다.");
    }
}
