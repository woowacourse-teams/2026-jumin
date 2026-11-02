package jumin.domain.parking;

import static jumin.config.ViewportCacheProperties.MAX_REQUEST_BYTES;
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
    @DisplayName("TTL 캐시 키는 환경과 격자를 구분하고 다른 키의 payload를 거절한다")
    void separates_namespaces_and_grid_sizes() {
        // given
        ViewportCellKey key = new ViewportCellKey("dev", 1000, 42);
        ViewportCellKey otherGrid = new ViewportCellKey("dev", 2000, 42);
        ViewportCellCodec codec = new ViewportCellCodec(1024, 10);

        // when
        byte[] encoded = codec.encode(new ViewportCell(key, List.of()));

        // then
        assertThat(key.redisKey()).isEqualTo("jumin:dev:viewport:square:ttl:cell:m1000:2a");
        assertThat(key.redisKey()).isNotEqualTo("jumin:dev:viewport:square:wm1:ttl:cell:s1:p1:m1000:2a");
        assertThat(new ViewportCellKey("prod", 1000, 42).redisKey()).isNotEqualTo(key.redisKey());
        assertThat(otherGrid.redisKey()).isNotEqualTo(key.redisKey());
        assertThatThrownBy(() -> codec.decode(otherGrid, encoded, MAX_REQUEST_BYTES)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> codec.decode(new ViewportCellKey("dev", 1000, 43), encoded, MAX_REQUEST_BYTES))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("환경명 경계의 빈 셀도 정확한 byte 크기로 왕복한다")
    void round_trips_empty_cells_at_environment_limits() {
        // given
        ViewportCellCodec codec = new ViewportCellCodec(256 * 1024, 4096);

        // when & then
        for (String environment : List.of("a", "a".repeat(48))) {
            ViewportCellKey key = new ViewportCellKey(environment, 1000, 42);
            ViewportCell cell = new ViewportCell(key, List.of());
            byte[] encoded = codec.encode(cell);
            assertThat(encoded).hasSize(22 + environment.length());
            assertThat(codec.decode(key, encoded, MAX_REQUEST_BYTES)).isEqualTo(cell);
            assertThat(codec.encodedSize(cell)).isEqualTo(encoded.length);
        }
    }

    @Test
    @DisplayName("환경명 길이가 맞지 않는 저장값은 큰 문자열 할당 전에 거절한다")
    void rejects_invalid_environment_lengths() {
        // given
        ViewportCellCodec codec = new ViewportCellCodec(256 * 1024, 4096);
        ViewportCellKey key = new ViewportCellKey("dev", 1000, 42);
        byte[] priorPayload = HexFormat.of().parseHex(
                "4a56543300036465760000000100000001000003e8000000000000002a00000000f04cef6b");

        // when & then
        assertThatThrownBy(() -> codec.decode(key, priorPayload, MAX_REQUEST_BYTES))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("환경명 byte 길이");
        for (int length : List.of(0, 49, 65535)) {
            byte[] malformed = new byte[64 * 1024];
            malformed[0] = (byte) (length >>> 8);
            malformed[1] = (byte) length;
            assertThatThrownBy(() -> codec.decode(key, malformed, MAX_REQUEST_BYTES))
                    .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("환경명 byte 길이");
        }
    }
}
