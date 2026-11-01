package jumin.domain.parking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HexFormat;
import java.util.List;
import jumin.domain.parking.cache.ViewportCellCodec;
import jumin.domain.parking.model.ViewportCell;
import jumin.domain.parking.model.ViewportCellKey;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportTtlContractTest {

    @Test
    @DisplayName("TTL 캐시 키는 환경과 격자 크기를 구분하고 다른 격자의 payload를 거절한다")
    void separates_namespaces_and_grid_sizes() {
        // given
        ViewportCellKey key = new ViewportCellKey("dev", 1, 1, 1000, 42);
        ViewportCellKey otherGrid = new ViewportCellKey("dev", 1, 1, 2000, 42);
        ViewportCellCodec codec = new ViewportCellCodec(1024, 10);

        // when
        byte[] encoded = codec.encode(new ViewportCell(key, List.of()));

        // then
        assertThat(key.redisKey()).isEqualTo("jumin:dev:viewport:square:wm1:ttl:cell:s1:p1:m1000:2a");
        assertThat(new ViewportCellKey("prod", 1, 1, 1000, 42).redisKey()).isNotEqualTo(key.redisKey());
        assertThat(otherGrid.redisKey()).isNotEqualTo(key.redisKey());
        assertThatThrownBy(() -> codec.decode(otherGrid, encoded)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("TTL 셀은 왕복 직렬화되며 이전 버전 형식은 캐시 미스로 처리할 수 있게 거절한다")
    void round_trips_ttl_cells_and_rejects_old_format() {
        ViewportCellCodec codec = new ViewportCellCodec(256 * 1024, 4096);
        ViewportCellKey key = new ViewportCellKey("test", 1, 1, 1000, 42);
        ViewportCell cell = new ViewportCell(key, List.of());
        byte[] old = HexFormat.of().parseHex("4a5653310004746573740000000100000001"
                + "000000000000000000000000000000000000000000000000000003e8"
                + "000000000000002a010000000076c0b06c");

        byte[] encoded = codec.encode(cell);

        assertThat(codec.decode(key, encoded)).isEqualTo(cell);
        assertThat(codec.encodedSize(cell)).isEqualTo(encoded.length);
        assertThatThrownBy(() -> codec.decode(key, old)).isInstanceOf(IllegalArgumentException.class);
    }
}
