package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import com.sun.management.ThreadMXBean;
import java.lang.management.ManagementFactory;
import java.util.stream.LongStream;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.global.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportContractTest {

    private final ViewportSquareGrid grid = new ViewportSquareGrid();
    private final ViewportCacheProperties properties = new ViewportCacheProperties();
    private final ViewportCellCodec codec = new ViewportCellCodec(256 * 1024, 4096);

    @Test
    @DisplayName("정상 wire의 decoded 예산 초과는 대량 행 객체 할당 전에 거절한다")
    void rejects_large_decoded_payload_before_row_allocation() {
        ViewportCellKey key = key("prod", 1);
        ViewportCellCodec largeCodec = new ViewportCellCodec(512 * 1024, 16_384);
        ViewportCell large = new ViewportCell(key, LongStream.range(1, 16_385).mapToObj(id ->
                new ViewportItem(id, 37.5, 127, null, false, true, false, false, false)).toList());
        byte[] bytes = largeCodec.encode(large);
        ThreadMXBean allocations = (ThreadMXBean) ManagementFactory.getThreadMXBean();
        assertThat(allocations.isThreadAllocatedMemorySupported()).isTrue();
        allocations.setThreadAllocatedMemoryEnabled(true);
        byte[] empty = largeCodec.encode(new ViewportCell(key, List.of()));
        for (int warmup = 0; warmup < 20; warmup++) {
            try {
                largeCodec.decode(key, empty, 0);
            } catch (ViewportStoreBudgetException expected) {
            }
        }
        long threadId = Thread.currentThread().threadId();
        long before = allocations.getThreadAllocatedBytes(threadId);
        boolean rejected = false;

        try {
            largeCodec.decode(key, bytes, 512 * 1024);
        } catch (ViewportStoreBudgetException expected) {
            rejected = true;
        }
        long allocated = allocations.getThreadAllocatedBytes(threadId) - before;

        assertThat(rejected).isTrue();
        assertThat(allocated).isLessThan(512 * 1024);
    }

    @Test
    @DisplayName("모든 지원 크기의 사각형 꼭짓점과 부동소수점 최소 bbox를 누락 없이 cover한다")
    void covers_square_vertices_at_supported_sizes() {
        for (int size : List.of(100, 500, 1000, 20_000)) {
            ViewportCacheProperties configuration = new ViewportCacheProperties();
            configuration.setGridSizeMeters(size);
            ViewportCellCover cover = new ViewportCellCover(grid, configuration);
            long center = grid.cellId(37.5, 127, size);
            int column = (int) (center >> 32);
            int row = (int) center;
            for (int dx = 0; dx <= 1; dx++) {
                for (int dy = 0; dy <= 1; dy++) {
                    double longitude = StrictMath.toDegrees((column + dx) * (double) size / 6_378_137.0);
                    double latitude = StrictMath.toDegrees(StrictMath.atan(
                            StrictMath.sinh((row + dy) * (double) size / 6_378_137.0)));
                    for (double width : List.of(Math.ulp(longitude), Math.ulp(longitude) * 16, 0.0000001)) {
                        ViewportBounds bounds = new ViewportBounds(longitude - width, latitude - width,
                                longitude + width, latitude + width);
                        assertThat(cover.cover(bounds)).as("size=%s width=%s", size, width)
                                .isNotEmpty().contains(grid.cellId(latitude, longitude, size));
                    }
                }
            }
        }
    }

    @Test
    @DisplayName("viewport 네 경계를 포함하고 무한대와 뒤집힌 좌표는 거절한다")
    void validates_and_preserves_inclusive_bounds() {
        ViewportBounds bounds = new ViewportBounds(127, 37, 127.01, 37.01);

        assertThat(bounds.contains(37, 127)).isTrue();
        assertThat(bounds.contains(37.01, 127.01)).isTrue();
        assertThat(bounds.contains(37.01001, 127.01)).isFalse();
        assertThatThrownBy(() -> new ViewportBounds(127, 37, Double.POSITIVE_INFINITY, 38))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> new ViewportBounds(127, 38, 126, 37))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("paid null과 운영정보 부재를 무료로 바꾸지 않고 서울 요일별 필드를 사용한다")
    void preserves_nullable_paid_and_daily_filters() {
        ViewportItem item = new ViewportItem(1, 37.5, 127, 50, false, null, false, true, null);
        ViewportBounds bounds = new ViewportBounds(126.99, 37.49, 127.01, 37.51);
        ParkingLotViewportRequest free = request(true, false, false);

        assertThat(item.matches(bounds, free, DayOfWeek.FRIDAY)).isTrue();
        assertThat(item.matches(bounds, free, DayOfWeek.SATURDAY)).isFalse();
        assertThat(item.matches(bounds, free, DayOfWeek.SUNDAY)).isFalse();
        assertThat(item.matches(bounds, request(false, false, true), DayOfWeek.FRIDAY)).isFalse();
        assertThat(item.matches(bounds, request(false, true, false), DayOfWeek.FRIDAY)).isTrue();
    }

    @Test
    @DisplayName("아주 작은 viewport와 네 모서리를 덮는 사각형 셀을 누락하지 않는다")
    void covers_tiny_rectangles_and_corners() {
        ViewportCellCover cover = new ViewportCellCover(grid, properties);
        ViewportBounds tiny = new ViewportBounds(127.0279, 37.499, 127.027900001, 37.499000001);

        List<Long> cells = cover.cover(tiny);

        assertThat(cells).contains(grid.cellId(37.499, 127.0279, 1000));
        assertThat(cells).contains(grid.cellId(tiny.north(), tiny.east(), 1000));
    }

    @Test
    @DisplayName("고정 seed의 viewport 내부와 경계 표본을 직접 계산한 사각형 cover가 모두 포함한다")
    void covers_reproducible_random_points() {
        ViewportCellCover cover = new ViewportCellCover(grid, properties);
        Random random = new Random(20261028);

        for (int index = 0; index < 150; index++) {
            double west = 126.9 + random.nextDouble() * 0.3;
            double south = 37.4 + random.nextDouble() * 0.2;
            ViewportBounds bounds = new ViewportBounds(west, south, west + 0.012, south + 0.008);
            List<Long> cells = cover.cover(bounds);
            assertThat(cells).isNotEmpty();
            for (int sample = 0; sample < 20; sample++) {
                double latitude = sample == 0 ? south : sample == 1 ? bounds.north()
                        : south + random.nextDouble() * 0.008;
                double longitude = sample == 0 ? west : sample == 1 ? bounds.east()
                        : west + random.nextDouble() * 0.012;
                assertThat(cells).contains(grid.cellId(latitude, longitude, 1000));
            }
        }
    }

    @Test
    @DisplayName("대형 긴 띠와 지원 영역 밖은 셀 열거 전에 우회한다")
    void bypasses_large_and_unsupported_bounds() {
        ViewportCellCover cover = new ViewportCellCover(grid, properties);

        assertThat(cover.cover(new ViewportBounds(127, 37, 127.2, 37.0001))).isEmpty();
        assertThat(cover.cover(new ViewportBounds(-74, 40, -73.99, 40.01))).isEmpty();
        assertThat(cover.cover(new ViewportBounds(-180, -89, 180, 89))).isEmpty();
    }

    @Test
    @DisplayName("짧은 환경 키의 정상 빈 셀과 nullable 필드 및 BIGINT를 무손실 왕복한다")
    void round_trips_empty_nullable_and_bigint_values() {
        ViewportCellKey key = key("p", 1);
        List<ViewportItem> items = List.of(
                new ViewportItem(-9_007_199_254_740_993L, 37.5, 127, null, false, null, null, true, false),
                new ViewportItem(9_007_199_254_740_993L, 37.5, 127, 50, false, true, false, null, true)
        );
        ViewportCell cell = new ViewportCell(key, items);

        assertThat(codec.decode(key, codec.encode(cell))).isEqualTo(cell);
        assertThat(codec.decode(key, codec.encode(new ViewportCell(key, List.of()))).items()).isEmpty();
    }

    @Test
    @DisplayName("다른 전체 namespace와 byte 손상 및 잘린 직렬화 값을 사용하지 않는다")
    void rejects_wrong_namespace_corruption_and_truncation() {
        ViewportCellKey key = key("prod", 1);
        byte[] bytes = codec.encode(new ViewportCell(key, List.of()));
        byte[] corrupted = bytes.clone();
        corrupted[20] ^= 1;

        assertThatThrownBy(() -> codec.decode(key("prod", 2), bytes))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> codec.decode(key, corrupted)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> codec.decode(key, new byte[10])).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("셀 저장은 완전한 정렬 목록만 허용하고 항목 및 byte 한도를 넘기지 않는다")
    void enforces_complete_order_and_size_limits() {
        ViewportCellKey key = key("prod", 1);
        ViewportItem item = new ViewportItem(1, 37.5, 127, 50, false, true, false, null, true);
        List<ViewportItem> mutable = new ArrayList<>(List.of(item));
        ViewportCell cell = new ViewportCell(key, mutable);
        mutable.clear();

        assertThat(cell.items()).containsExactly(item);
        assertThatThrownBy(() -> new ViewportCell(key, List.of(item, item)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ViewportCellCodec(64, 1).encode(cell))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private ViewportCellKey key(String environment, int policy) {
        return new ViewportCellKey(environment, 1, policy,
                1000,
                grid.cellId(37.5, 127, 1000));
    }

    private ParkingLotViewportRequest request(boolean free, boolean mechanical, boolean isPublic) {
        return new ParkingLotViewportRequest(126.99, 37.49, 127.01, 37.51, free, mechanical, isPublic);
    }
}
