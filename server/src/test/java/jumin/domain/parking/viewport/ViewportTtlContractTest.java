package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportTtlContractTest {

    @Test
    @DisplayName("버전 검사는 기본으로 켜지고 TTL 키는 같은 버전 필드의 엄격 키와 분리된다")
    void keeps_strict_mode_default_and_separates_cache_namespaces() {
        assertThat(new ViewportCacheProperties().isVersionCheckEnabled()).isTrue();

        ViewportCellKey ttl = ViewportCellKey.ttlOnly("test", 1, 1, 1000, 42);
        ViewportCellKey strict = new ViewportCellKey("test", 1, 1,
                new ViewportVersion(new UUID(0, 0), 0, 1000, true), 42);

        assertThat(strict.versioned()).isTrue();
        assertThat(ttl.versioned()).isFalse();
        assertThat(ttl.version()).isEqualTo(strict.version());
        assertThat(ttl).isNotEqualTo(strict);
        assertThat(ttl.redisKey()).isNotEqualTo(strict.redisKey());
        assertThat(ViewportCellKey.ttlOnly("test", 1, 1, 2000, 42).redisKey())
                .isNotEqualTo(ttl.redisKey());
    }

    @Test
    @DisplayName("기존 strict wire를 읽고 TTL과 strict wire를 서로 다른 모드로 읽지 않는다")
    void isolates_wire_modes_and_reads_the_existing_strict_format() {
        ViewportCellCodec codec = new ViewportCellCodec(256 * 1024, 4096);
        ViewportCellKey ttl = ViewportCellKey.ttlOnly("test", 1, 1, 1000, 42);
        ViewportCellKey strict = new ViewportCellKey("test", 1, 1,
                new ViewportVersion(new UUID(0, 0), 0, 1000, true), 42);
        ViewportCell ttlCell = new ViewportCell(ttl, List.of());
        ViewportCell strictCell = new ViewportCell(strict, List.of());
        // Strict-mode bytes produced by the existing format before TTL mode was added.
        byte[] oldStrict = HexFormat.of().parseHex("4a5653310004746573740000000100000001"
                + "000000000000000000000000000000000000000000000000000003e8"
                + "000000000000002a010000000076c0b06c");
        byte[] newStrict = codec.encode(strictCell);
        byte[] ttlBytes = codec.encode(ttlCell);

        assertThat(newStrict).isEqualTo(oldStrict);
        assertThat(codec.decode(strict, oldStrict)).isEqualTo(strictCell);
        assertThat(codec.decode(ttl, ttlBytes)).isEqualTo(ttlCell);
        assertThatThrownBy(() -> codec.decode(ttl, newStrict)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> codec.decode(strict, ttlBytes)).isInstanceOf(IllegalArgumentException.class);
    }
}
