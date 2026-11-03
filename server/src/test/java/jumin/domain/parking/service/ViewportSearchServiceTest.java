package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.stream.Stream;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.cache.ViewportCellStore;
import jumin.domain.parking.controller.ParkingSearchController;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.exception.ViewportFailureReason;
import jumin.domain.parking.model.ViewportBounds;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.repository.ViewportRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import jumin.global.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.CannotCreateTransactionException;

class ViewportSearchServiceTest {

    private final ViewportCacheProperties properties = new ViewportCacheProperties();
    private final ViewportCellCover cover = mock(ViewportCellCover.class);
    private final ViewportRepository repository = mock(ViewportRepository.class);
    private final ViewportCellStore store = mock(ViewportCellStore.class);
    private final ViewportCellLoader loader = mock(ViewportCellLoader.class);
    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final Clock clock = mock(Clock.class);
    private final ViewportSearchService service = new ViewportSearchService(properties, cover, repository, store,
            loader, new ViewportMetrics(registry), new ParkingLodScoreCalculator(), clock);

    @BeforeEach
    void setUp() {
        when(clock.instant()).thenReturn(Instant.parse("2026-10-26T00:00:00Z"));
    }

    @Test
    @DisplayName("캐시 OFF는 공통 전체 조회만 사용하고 Redis와 셀 조회 및 fallback 지표를 건드리지 않는다")
    void disabled_cache_only_reads_whole_viewport() {
        // given
        ParkingLotViewportRequest request = request();
        ParkingLotViewportResponses expected = ParkingLotViewportResponses.from(
                List.of(new ParkingLotViewportResponse(1L, 37.5, 127.0, 0.5)));
        when(repository.findWithinBounds(any(), any(), anyInt(), any())).thenReturn(expected);

        // when
        ParkingLotViewportResponses actual = service.search(request);

        // then
        assertThat(actual).isSameAs(expected);
        verify(repository).findWithinBounds(eq(ViewportBounds.from(request)), eq(request), eq(1), any());
        verifyNoInteractions(cover, store, loader);
        assertThat(registry.find("parking.viewport.logical").tag("outcome", "fallback").counter()).isNull();
    }

    @ParameterizedTest
    @CsvSource({
            "2026-10-12T03:00:00Z, 1", "2026-10-13T03:00:00Z, 2", "2026-10-14T03:00:00Z, 3",
            "2026-10-15T03:00:00Z, 4", "2026-10-16T03:00:00Z, 5", "2026-10-17T03:00:00Z, 6",
            "2026-10-18T03:00:00Z, 7", "2026-10-16T14:59:59Z, 5", "2026-10-16T15:00:00Z, 6",
            "2026-10-17T15:00:00Z, 7", "2026-10-18T15:00:00Z, 1"
    })
    @DisplayName("캐시 OFF의 무료 조회도 한국 요일과 자정 경계를 공통 조회에 전달한다")
    void uses_seoul_day_when_cache_is_disabled(String instant, int day) {
        // given
        when(clock.instant()).thenReturn(Instant.parse(instant));
        when(repository.findWithinBounds(any(), any(), anyInt(), any()))
                .thenReturn(ParkingLotViewportResponses.from(List.of()));
        ParkingLotViewportRequest request = new ParkingLotViewportRequest(126.99, 37.49, 127.01, 37.51,
                true, false, false);

        // when
        service.search(request);

        // then
        verify(repository).findWithinBounds(eq(ViewportBounds.from(request)), eq(request), eq(day), any());
    }

    @ParameterizedTest
    @CsvSource({"127.01,37.49,126.99,37.51", "126.99,37.51,127.01,37.49"})
    @DisplayName("캐시 OFF도 역전된 경계는 DB와 Redis 호출 전에 400으로 거절한다")
    void rejects_reversed_bounds(double west, double south, double east, double north) {
        // given
        ParkingLotViewportRequest request = new ParkingLotViewportRequest(west, south, east, north,
                false, false, false);

        // when & then
        assertThatThrownBy(() -> service.search(request)).isInstanceOfSatisfying(BusinessException.class,
                failure -> assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
        verifyNoInteractions(repository, cover, store, loader);
    }

    @ParameterizedTest
    @MethodSource("databaseFailures")
    @DisplayName("캐시 OFF의 DB 자원과 트랜잭션 실패는 상세 원문 없이 HTTP 503으로 응답한다")
    void disabled_database_failures_return_service_unavailable(RuntimeException failure) throws Exception {
        // given
        when(repository.findWithinBounds(any(), any(), anyInt(), any())).thenThrow(failure);
        var mvc = MockMvcBuilders.standaloneSetup(new ParkingSearchController(mock(ParkingSearchService.class), service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();

        // when & then
        var response = mvc.perform(get("/api/parking/viewport").param("westLongitude", "126.99")
                        .param("southLatitude", "37.49").param("eastLongitude", "127.01")
                        .param("northLatitude", "37.51"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("message").value(ErrorCode.VIEWPORT_UNAVAILABLE.getMessage()))
                .andReturn().getResponse();
        assertThat(response.getContentAsString()).doesNotContain("private-database-detail");
        verifyNoInteractions(cover, store, loader);
    }

    @Test
    @DisplayName("캐시 OFF도 전체 요청 기한 이후 완성된 결과를 성공으로 반환하지 않는다")
    void rejects_response_after_total_deadline() {
        // given
        properties.setRequestTimeout(Duration.ofNanos(1));
        when(repository.findWithinBounds(any(), any(), anyInt(), any()))
                .thenReturn(ParkingLotViewportResponses.from(List.of()));

        // when & then
        assertThatThrownBy(() -> service.search(request())).isInstanceOfSatisfying(BusinessException.class,
                failure -> assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
    }

    private static Stream<RuntimeException> databaseFailures() {
        return Stream.of(new DataAccessResourceFailureException("private-database-detail"),
                new CannotCreateTransactionException("private-database-detail"),
                ViewportFailureReason.DB_QUEUE_FULL.failure(), ViewportFailureReason.DB_DEADLINE.failure(),
                ViewportFailureReason.DB_SHUTTING_DOWN.failure());
    }

    private static ParkingLotViewportRequest request() {
        return new ParkingLotViewportRequest(126.99, 37.49, 127.01, 37.51, false, false, false);
    }
}
