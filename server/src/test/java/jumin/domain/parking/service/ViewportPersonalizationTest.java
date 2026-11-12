package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.cache.ViewportCellStore;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.exception.ViewportFailureReason;
import jumin.domain.parking.model.ViewportCell;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.model.ViewportItem;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.repository.ViewportRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

// 공용 조회 경로와 관계없이 개인 상태를 분리하고 목록 조회와 같은 기한을 사용한다.
class ViewportPersonalizationTest {

    private static final ParkingLotViewportRequest REQUEST =
            new ParkingLotViewportRequest(126.97, 37.56, 126.99, 37.58, false, false, false);
    private static final UUID GUEST = UUID.randomUUID();

    @ParameterizedTest
    @ValueSource(strings = {"cache", "fallback", "disabled"})
    @DisplayName("캐시·대체·비활성 경로 모두 요청자별 좋아요와 취소를 반영하고 공용 결과는 유지한다")
    void personalizes_each_path_without_mutating_shared_data(String path) {
        try (Fixture fixture = new Fixture(path, false)) {
            UUID otherGuest = UUID.randomUUID();
            when(fixture.repository.findLikedParkingLotIds(eq(GUEST), any()))
                    .thenReturn(Set.of(1L)).thenReturn(Set.of());
            when(fixture.repository.findLikedParkingLotIds(eq(otherGuest), any()))
                    .thenReturn(Set.of(2L));

            // 각 요청에서 저장소의 최신 상태를 읽고 목록 순서·좌표·점수는 유지한다.
            assertThat(fixture.search(GUEST).parkingLots()).containsExactly(
                    new ParkingLotViewportResponse(1L, 37.5665, 126.978, 0.5, true),
                    new ParkingLotViewportResponse(2L, 37.567, 126.979, 0.75, false));
            assertThat(fixture.search(otherGuest).parkingLots()).containsExactly(
                    new ParkingLotViewportResponse(1L, 37.5665, 126.978, 0.5, false),
                    new ParkingLotViewportResponse(2L, 37.567, 126.979, 0.75, true));
            assertThat(fixture.search(GUEST)).isEqualTo(fixture.shared);
            assertThat(fixture.search(null)).isEqualTo(fixture.shared);
            assertThat(fixture.shared.parkingLots()).allMatch(row -> !row.likedByMe());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"cache", "fallback", "disabled"})
    @DisplayName("빈 지도 결과에서는 요청자가 있어도 좋아요 DB 조회를 실행하지 않는다")
    void skips_likes_for_empty_results(String path) {
        try (Fixture fixture = new Fixture(path, true)) {
            assertThat(fixture.search(GUEST)).isEqualTo(ParkingLotViewportResponses.from(List.of()));
            verify(fixture.repository, never()).findLikedParkingLotIds(any(), any());
        }
    }

    @Test
    @DisplayName("좋아요가 없거나 화면 밖에만 있으면 목록을 복제하지 않고 원래 응답을 반환한다")
    void reuses_response_without_visible_likes() {
        // 새 DTO·목록을 만들 필요가 없는 두 경우를 구분하여 확인한다.
        try (Fixture fixture = new Fixture("fallback", false)) {
            when(fixture.repository.findLikedParkingLotIds(eq(GUEST), any()))
                    .thenReturn(Set.of()).thenReturn(Set.of(99L));
            assertThat(fixture.search(GUEST)).isSameAs(fixture.shared);
            assertThat(fixture.search(GUEST)).isSameAs(fixture.shared);
        }
    }

    @Test
    @DisplayName("좋아요한 행만 새로 만들고 나머지 불변 DTO와 공용 응답은 재사용한다")
    void copies_only_liked_rows() {
        try (Fixture fixture = new Fixture("fallback", false)) {
            when(fixture.repository.findLikedParkingLotIds(eq(GUEST), any())).thenReturn(Set.of(1L));
            var response = fixture.search(GUEST);

            // 목록의 순서와 값은 유지하되 사용자 상태가 바뀐 행만 별도 객체로 만든다.
            assertThat(response.parkingLots().get(0)).isNotSameAs(fixture.shared.parkingLots().get(0));
            assertThat(response.parkingLots().get(0).likedByMe()).isTrue();
            assertThat(response.parkingLots().get(1)).isSameAs(fixture.shared.parkingLots().get(1));
            assertThat(fixture.shared.parkingLots()).allMatch(row -> !row.likedByMe());
            assertThat(response.totalCount()).isEqualTo(fixture.shared.totalCount());
        }
    }

    @Test
    @DisplayName("지도 조회와 좋아요 조회는 같은 기한을 공유하고 실패 후 재조회할 수 있다")
    void shares_deadline_and_recovers_after_likes_failure() {
        try (Fixture fixture = new Fixture("fallback", false)) {
            AtomicReference<ViewportDeadline> sourceDeadline = new AtomicReference<>();
            when(fixture.repository.findWithinBounds(any(), any(), anyInt(), any())).thenAnswer(call -> {
                sourceDeadline.set(call.getArgument(3));
                return fixture.shared;
            });
            when(fixture.repository.findLikedParkingLotIds(any(), any())).thenAnswer(call -> {
                assertThat((ViewportDeadline) call.getArgument(1)).isSameAs(sourceDeadline.get());
                throw ViewportFailureReason.DEADLINE.failure();
            });

            assertThatThrownBy(() -> fixture.service.search(REQUEST, GUEST))
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));

            // 좋아요 조회 실패 후에도 다음 조회는 정상 결과를 반환한다.
            doReturn(Set.of()).when(fixture.repository).findLikedParkingLotIds(any(), any());
            assertThat(fixture.service.search(REQUEST, GUEST)).isEqualTo(fixture.shared);
        }
    }

    @Test
    @DisplayName("만료된 지도 조회의 기한을 좋아요 조회에 새로 부여하지 않는다")
    void refuses_likes_after_source_deadline_expired() {
        try (Fixture fixture = new Fixture("fallback", false)) {
            // 요청 기한을 즉시 소진시켜 좋아요 조회에 별도 시간을 부여하지 않는지 확인한다.
            fixture.properties.setRequestTimeout(Duration.ofNanos(1));
            assertThatThrownBy(() -> fixture.service.search(REQUEST, GUEST))
                    .isInstanceOf(BusinessException.class);
            verify(fixture.repository, never()).findLikedParkingLotIds(any(), any());
        }
    }

    private static final class Fixture implements AutoCloseable {
        private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
        private final ViewportCacheProperties properties = new ViewportCacheProperties();
        private final ViewportRepository repository = mock(ViewportRepository.class);
        private final ParkingLotViewportResponses shared;
        private final ViewportSearchService service;

        private Fixture(String path, boolean empty) {
            List<ParkingLotViewportResponse> rows = List.of();
            if (!empty) {
                rows = List.of(new ParkingLotViewportResponse(1L, 37.5665, 126.978, 0.5),
                        new ParkingLotViewportResponse(2L, 37.567, 126.979, 0.75));
            }
            shared = ParkingLotViewportResponses.from(rows);
            properties.setEnabled(!path.equals("disabled"));
            properties.setRequestTimeout(Duration.ofSeconds(5));
            when(repository.findWithinBounds(any(), any(), anyInt(), any())).thenReturn(shared);
            ViewportCellCover cover = mock(ViewportCellCover.class);
            ViewportCellStore store = mock(ViewportCellStore.class);
            ViewportCellLoader loader = mock(ViewportCellLoader.class);
            if (path.equals("cache")) {
                when(cover.cover(any())).thenReturn(List.of(1L));
                var key = new ViewportCellKey("local", 1000, 1L);
                List<ViewportItem> items = List.of();
                if (!empty) {
                    items = List.of(
                            new ViewportItem(1, 37.5665, 126.978, 50, false, true, false, false, false),
                            new ViewportItem(2, 37.567, 126.979, 150, false, true, false, false, false));
                }
                var cell = new ViewportCell(key, items);
                when(store.getMany(anyList(), any())).thenReturn(Map.of(key, cell));
                when(loader.resolve(anyList(), any(), any(), any(Boolean.class)))
                        .thenReturn(List.of(cell));
            }
            service = new ViewportSearchService(properties, cover, repository, store, loader,
                    new ViewportMetrics(registry), new ParkingLodScoreCalculator(), Clock.systemUTC());
        }

        private ParkingLotViewportResponses search(UUID guestId) {
            return service.search(REQUEST, guestId);
        }

        @Override
        public void close() {
            registry.close();
        }
    }
}
