package jumin.domain.parking.viewport;

import java.util.Objects;
import java.util.UUID;

public record ViewportCellKey(String environment, int schema, int policy,
                              ViewportVersion version, long cellId, boolean versioned) {

    private static final UUID TTL_EPOCH = new UUID(0, 0);

    public ViewportCellKey(String environment, int schema, int policy, ViewportVersion version, long cellId) {
        this(environment, schema, policy, version, cellId, true);
    }

    public static ViewportCellKey ttlOnly(String environment, int schema, int policy, int gridSizeMeters, long cellId) {
        return new ViewportCellKey(environment, schema, policy,
                new ViewportVersion(TTL_EPOCH, 0, gridSizeMeters, true), cellId, false);
    }

    public ViewportCellKey {
        Objects.requireNonNull(environment);
        Objects.requireNonNull(version);
        if (!environment.matches("[a-zA-Z0-9_-]{1,48}") || schema <= 0 || policy <= 0 || !version.ready()) {
            throw new IllegalArgumentException("viewport 캐시 namespace가 유효하지 않습니다.");
        }
        if (!versioned && (!TTL_EPOCH.equals(version.epoch()) || version.revision() != 0)) {
            throw new IllegalArgumentException("TTL 전용 키에는 데이터 버전을 사용할 수 없습니다.");
        }
    }

    public String redisKey() {
        if (!versioned) {
            return "jumin:" + environment + ":viewport:square:wm1:ttl:cell:s" + schema + ":p" + policy
                    + ":m" + version.gridSizeMeters() + ":" + Long.toHexString(cellId);
        }
        return "jumin:" + environment + ":viewport:square:wm1:cell:s" + schema + ":p" + policy
                + ":m" + version.gridSizeMeters() + ":e" + version.epoch()
                + ":g" + version.revision() + ":" + Long.toHexString(cellId);
    }
}
