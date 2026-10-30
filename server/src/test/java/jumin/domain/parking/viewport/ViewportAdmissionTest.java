package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import jumin.domain.parking.service.ParkingSearchService;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportAdmissionTest {

    @Test
    @DisplayName("0은 요청 admission 제한을 해제하고 설정의 다른 한도는 계속 검사한다")
    void validates_unlimited_setting_and_retains_other_limits() {
        ViewportCacheProperties properties = new ViewportCacheProperties();

        assertThat(properties.getMaxConcurrentRequests()).isZero();
        properties.validate();

        properties.setMaxConcurrentRequests(0);
        properties.validate();
        properties.setMaxConcurrentDb(0);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setMaxConcurrentDb(3);
        properties.setMaxConcurrentRequests(-1);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setMaxConcurrentRequests(65);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setMaxConcurrentRequests(9);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("제한 해제 시 12개 동시 요청을 거절하지 않고 응답 완료까지 활성 수를 추적한다")
    void unlimited_admits_concurrent_requests_and_tracks_until_completion() throws Exception {
        int requestCount = 12;
        Fixture fixture = new Fixture();
        fixture.properties.setMaxConcurrentRequests(0);
        CountDownLatch entered = new CountDownLatch(requestCount);
        CountDownLatch proceed = new CountDownLatch(1);
        when(fixture.repository.fallback(any(), any(), anyInt(), any(), any())).thenAnswer(invocation -> {
            entered.countDown();
            if (!proceed.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("request latch timed out");
            }
            return CompletableFuture.completedFuture(body());
        });
        ViewportSearchService service = fixture.service(fixedClock());
        assertThat(fixture.limit()).isZero();
        List<CompletableFuture<ViewportBody>> requests = new ArrayList<>();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            try {
                for (int index = 0; index < requestCount; index++) {
                    requests.add(CompletableFuture.supplyAsync(() -> service.search(request()), executor));
                }
                assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
                assertThat(fixture.active()).isEqualTo(requestCount);
                assertThat(fixture.rejected()).isZero();
                proceed.countDown();

                List<ViewportBody> bodies = new ArrayList<>();
                for (CompletableFuture<ViewportBody> pending : requests) {
                    bodies.add(pending.get(5, TimeUnit.SECONDS));
                }
                assertThat(fixture.active()).isEqualTo(requestCount);
                for (int index = 0; index < bodies.size(); index++) {
                    ViewportBody body = bodies.get(index);
                    body.complete(index % 2 == 0);
                    assertThat(fixture.active()).isEqualTo(requestCount - index - 1);
                    body.close();
                    assertThat(fixture.active()).isEqualTo(requestCount - index - 1);
                }
            } finally {
                proceed.countDown();
                for (CompletableFuture<ViewportBody> pending : requests) {
                    pending.handle((body, failure) -> {
                        if (body != null) {
                            body.close();
                        }
                        return null;
                    }).get(10, TimeUnit.SECONDS);
                }
            }
        }
        assertThat(fixture.active()).isZero();
    }

    @Test
    @DisplayName("명시적으로 8개 제한을 설정하면 응답 완료 전 아홉 번째 요청을 거절한다")
    void configured_limit_rejects_ninth_request_and_reuses_released_capacity() {
        Fixture fixture = new Fixture();
        fixture.properties.setMaxConcurrentRequests(8);
        when(fixture.repository.fallback(any(), any(), anyInt(), any(), any()))
                .thenAnswer(invocation -> CompletableFuture.completedFuture(body()));
        ViewportSearchService service = fixture.service(fixedClock());
        assertThat(fixture.limit()).isEqualTo(8);
        List<ViewportBody> bodies = new ArrayList<>();
        try {
            for (int index = 0; index < 8; index++) {
                bodies.add(service.search(request()));
            }
            assertThat(fixture.active()).isEqualTo(8);
            assertThatThrownBy(() -> service.search(request()))
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            assertThat(fixture.rejected()).isEqualTo(1);
            assertThat(fixture.active()).isEqualTo(8);

            bodies.removeFirst().complete(true);
            assertThat(fixture.active()).isEqualTo(7);
            bodies.add(service.search(request()));
            assertThat(fixture.active()).isEqualTo(8);
        } finally {
            bodies.forEach(ViewportBody::close);
        }
        assertThat(fixture.active()).isZero();
    }

    @Test
    @DisplayName("요청 준비와 조회 예외에서도 활성 수를 정확히 회수한다")
    void releases_active_requests_on_failures_in_both_modes() {
        for (int limit : List.of(0, 8)) {
            Fixture preparation = new Fixture();
            preparation.properties.setMaxConcurrentRequests(limit);
            Clock brokenClock = mock(Clock.class);
            when(brokenClock.instant()).thenThrow(new IllegalStateException("clock failure"));
            ViewportSearchService brokenService = preparation.service(brokenClock);
            assertThatThrownBy(() -> brokenService.search(request())).isInstanceOf(IllegalStateException.class);
            assertThat(preparation.active()).isZero();

            Fixture execution = new Fixture();
            execution.properties.setMaxConcurrentRequests(limit);
            when(execution.repository.fallback(any(), any(), anyInt(), any(), any()))
                    .thenThrow(new IllegalStateException("fallback failure"));
            ViewportSearchService executionService = execution.service(fixedClock());
            assertThatThrownBy(() -> executionService.search(request())).isInstanceOf(IllegalStateException.class);
            assertThat(execution.active()).isZero();

        }
    }

    private static ViewportBody body() {
        return new ViewportBody(ParkingLotViewportResponses.from(List.of()));
    }

    private static ParkingLotViewportRequest request() {
        return new ParkingLotViewportRequest(126.99, 37.49, 127.01, 37.51, false, false, false);
    }

    private static Clock fixedClock() {
        return Clock.fixed(Instant.parse("2026-10-26T00:00:00Z"), ZoneOffset.UTC);
    }

    private static class Fixture {
        private final ViewportCacheProperties properties = new ViewportCacheProperties();
        private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
        private final ViewportReadRepository repository = mock(ViewportReadRepository.class);

        private Fixture() {
            properties.setEnabled(true);
            properties.setRequestTimeout(Duration.ofSeconds(30));
        }

        private ViewportSearchService service(Clock clock) {
            return new ViewportSearchService(properties, mock(ParkingSearchService.class),
                    mock(ViewportCellCover.class), repository, mock(ViewportCellStore.class),
                    mock(ViewportCellLoader.class), new ViewportMetrics(registry),
                    new ParkingLodScoreCalculator(), clock);
        }

        private double active() {
            return registry.get("parking.viewport.requests.active").gauge().value();
        }

        private double limit() {
            return registry.get("parking.viewport.requests.limit").gauge().value();
        }

        private double rejected() {
            return registry.counter("parking.viewport.requests", "outcome", "admission_rejected").count();
        }
    }
}
