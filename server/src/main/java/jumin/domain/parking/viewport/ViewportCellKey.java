package jumin.domain.parking.viewport;

import java.util.Objects;

public record ViewportCellKey(String environment, int schema, int policy, int gridSizeMeters, long cellId) {

    public ViewportCellKey {
        Objects.requireNonNull(environment);
        if (!environment.matches("[a-zA-Z0-9_-]{1,48}") || schema <= 0 || policy <= 0
                || gridSizeMeters < 100 || gridSizeMeters > 20_000) {
            throw new IllegalArgumentException("viewport 캐시 namespace가 유효하지 않습니다.");
        }
    }

    public String redisKey() {
        return "jumin:" + environment + ":viewport:square:wm1:ttl:cell:s" + schema + ":p" + policy
                + ":m" + gridSizeMeters + ":" + Long.toHexString(cellId);
    }
}
