package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportSquareGridTest {

    private final ViewportSquareGrid grid = new ViewportSquareGrid();

    @Test
    @DisplayName("공식 Web Mercator 표본의 투영 위치를 1000m 사각형으로 나눈다")
    void matches_known_projected_coordinate() {
        // PROJ: longitude=2, latitude=49 -> x=222638.98, y=6274861.39 metres.
        long cell = grid.cellId(49, 2, 1000);
        assertThat((int) (cell >> 32)).isEqualTo(222);
        assertThat((int) cell).isEqualTo(6274);
    }

    @Test
    @DisplayName("음수 좌표는 0 방향 절삭 대신 floor로 분할하고 사분면 ID가 충돌하지 않는다")
    void floors_negative_coordinates_without_id_collisions() {
        assertThat(grid.cellId(0, 0, 1000)).isZero();
        HashSet<Long> cells = new HashSet<>();
        for (double latitude : List.of(-0.00001, 0.00001)) {
            for (double longitude : List.of(-0.00001, 0.00001)) {
                long cell = grid.cellId(latitude, longitude, 1000);
                cells.add(cell);
                assertThat((int) (cell >> 32)).isEqualTo(longitude < 0 ? -1 : 0);
                assertThat((int) cell).isEqualTo(latitude < 0 ? -1 : 0);
            }
        }
        assertThat(cells).hasSize(4);
    }

    @Test
    @DisplayName("적도와 원점의 최소 부동소수점 범위도 점이 속한 셀을 빠뜨리지 않는다")
    void covers_subnormal_coordinates_through_zero() {
        ViewportBounds bounds = new ViewportBounds(-Double.MIN_VALUE, -Double.MIN_VALUE,
                Double.MIN_VALUE, Double.MIN_VALUE);
        List<Long> cells = grid.cover(bounds, 1000, 4);
        assertThat(cells).isNotEmpty();
        for (double coordinate : List.of(-Double.MIN_VALUE, 0.0, Double.MIN_VALUE)) {
            assertThat(cells).contains(grid.cellId(coordinate, coordinate, 1000));
        }
    }

    @Test
    @DisplayName("최대 셀 수와 정확히 같은 범위는 허용하고 초과 범위는 열거 전에 우회한다")
    void checks_cell_count_before_allocation() {
        double east = longitude(1999);
        double north = latitude(1999);
        ViewportBounds fourCells = new ViewportBounds(0, 0, east, north);
        assertThat(grid.cover(fourCells, 1000, 4)).hasSize(4);
        assertThat(grid.cover(fourCells, 1000, 3)).isEmpty();
        assertThat(grid.cover(new ViewportBounds(-180, -85, 180, 85), 100, 256)).isEmpty();
    }

    @Test
    @DisplayName("지원 크기와 모든 사분면에서 cover가 내부 및 네 경계의 점을 포함한다")
    void covers_seeded_points_and_inclusive_edges() {
        Random random = new Random(20261029);
        for (int size : List.of(100, 500, 1000, 20_000)) {
            for (int index = 0; index < 200; index++) {
                double west = -170 + random.nextDouble() * 340;
                double south = -80 + random.nextDouble() * 160;
                ViewportBounds bounds = new ViewportBounds(west, south, west + 0.0005, south + 0.0005);
                List<Long> cells = grid.cover(bounds, size, 64);
                assertThat(cells).isNotEmpty().doesNotHaveDuplicates().isSorted();
                for (int sample = 0; sample < 16; sample++) {
                    double latitude = sample % 4 == 0 ? bounds.south() : sample % 4 == 1 ? bounds.north()
                            : bounds.south() + random.nextDouble() * 0.0005;
                    double longitude = sample % 4 == 2 ? bounds.west() : sample % 4 == 3 ? bounds.east()
                            : bounds.west() + random.nextDouble() * 0.0005;
                    assertThat(cells).contains(grid.cellId(latitude, longitude, size));
                }
            }
        }
    }

    @Test
    @DisplayName("서로 다른 viewport 안의 같은 위치는 동일한 그리드 키를 재사용한다")
    void reuses_cells_between_overlapping_viewports() {
        long point = grid.cellId(37.5, 127, 1000);
        List<Long> first = grid.cover(new ViewportBounds(126.999, 37.499, 127.001, 37.501), 1000, 64);
        List<Long> second = grid.cover(new ViewportBounds(126.9995, 37.4995, 127.0015, 37.5015), 1000, 64);
        assertThat(first).contains(point);
        assertThat(second).contains(point);
    }

    @Test
    @DisplayName("캐시 키는 그리드 크기와 square 알고리즘을 구분한다")
    void namespaces_grid_size_and_algorithm() {
        UUID epoch = UUID.randomUUID();
        ViewportCellKey first = new ViewportCellKey("prod", 1, 1,
                new ViewportVersion(epoch, 1, 1000, true), 0);
        ViewportCellKey second = new ViewportCellKey("prod", 1, 1,
                new ViewportVersion(epoch, 1, 2000, true), 0);
        assertThat(first.redisKey()).contains(":viewport:square:wm1:", ":m1000:");
        assertThat(first.redisKey()).isNotEqualTo(second.redisKey());
        ViewportCellCodec codec = new ViewportCellCodec(1024, 10);
        byte[] encoded = codec.encode(new ViewportCell(first, List.of()));
        assertThatThrownBy(() -> codec.decode(second, encoded)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("극점과 비정상 좌표 및 그리드 크기를 거절한다")
    void rejects_unsupported_coordinates_and_sizes() {
        assertThat(grid.supports(90, 127)).isFalse();
        assertThat(grid.supports(Double.NaN, 127)).isFalse();
        assertThat(grid.cover(new ViewportBounds(126, 86, 127, 87), 1000, 64)).isEmpty();
        assertThatThrownBy(() -> grid.cellId(90, 127, 1000)).isInstanceOf(IllegalArgumentException.class);
        for (int size : List.of(-1, 0, 99, 20_001, Integer.MAX_VALUE)) {
            assertThatThrownBy(() -> grid.cellId(37.5, 127, size)).isInstanceOf(IllegalArgumentException.class);
            ViewportCacheProperties properties = new ViewportCacheProperties();
            properties.setGridSizeMeters(size);
            assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        }
    }

    private static double longitude(double x) {
        return StrictMath.toDegrees(x / 6_378_137.0);
    }

    private static double latitude(double y) {
        return StrictMath.toDegrees(StrictMath.atan(StrictMath.sinh(y / 6_378_137.0)));
    }
}
