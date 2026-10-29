package jumin.domain.parking.viewport;

import java.util.Objects;
import java.util.UUID;

public record ViewportVersion(UUID epoch, long revision, int gridSizeMeters, boolean ready) {

    public ViewportVersion {
        Objects.requireNonNull(epoch);
        if (revision < 0 || gridSizeMeters < ViewportSquareGrid.MIN_SIZE_METERS
                || gridSizeMeters > ViewportSquareGrid.MAX_SIZE_METERS) {
            throw new IllegalArgumentException("viewport 데이터 버전이 유효하지 않습니다.");
        }
    }
}
