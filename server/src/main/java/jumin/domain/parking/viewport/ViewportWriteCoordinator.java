package jumin.domain.parking.viewport;

import java.sql.Connection;
import jumin.config.ViewportCacheProperties;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ViewportWriteCoordinator {

    private final JdbcTemplate jdbc;
    private final ViewportVersionRepository versions;
    private final ViewportMappingMaintainer mappings;
    private final ViewportCacheProperties properties;

    public ViewportWriteCoordinator(JdbcTemplate jdbc, ViewportVersionRepository versions,
                                    ViewportMappingMaintainer mappings, ViewportCacheProperties properties) {
        this.jdbc = jdbc;
        this.versions = versions;
        this.mappings = mappings;
        this.properties = properties;
    }

    public ViewportVersion beforeSourceWrite() {
        ViewportVersion version = versions.lockForWrite();
        authorizeWriter();
        jdbc.execute("DROP TABLE IF EXISTS pg_temp.viewport_cache_before");
        jdbc.execute("CREATE TEMP TABLE viewport_cache_before ON COMMIT DROP AS " + ViewportProjectionSql.SOURCE);
        return version;
    }

    public void afterSourceWrite(ViewportVersion previous) {
        Boolean changed = jdbc.queryForObject("SELECT EXISTS ("
                + "(SELECT * FROM viewport_cache_before EXCEPT " + ViewportProjectionSql.SOURCE + ") UNION ALL ("
                + ViewportProjectionSql.SOURCE + " EXCEPT SELECT * FROM viewport_cache_before))", Boolean.class);
        boolean ready = previous.ready();
        boolean mappingChanged = false;
        if (previous.ready()) {
            ViewportMappingMaintainer.MappingResult result = mappings.repairAndVerify(previous.gridSizeMeters());
            ready = previous.ready() && result.valid();
            mappingChanged = result.changed();
        }
        versions.publish(previous, previous.gridSizeMeters(), ready, Boolean.TRUE.equals(changed) || mappingChanged);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ViewportVersion prepare() {
        // REQUIRED may join a transaction whose isolation differs from the annotation.
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            if (connection.getTransactionIsolation() != Connection.TRANSACTION_READ_COMMITTED) {
                throw new IllegalTransactionStateException("viewport 준비 작업은 READ COMMITTED가 필요합니다.");
            }
            return null;
        });
        ViewportVersion previous = versions.lockForWrite();
        authorizeWriter();
        if (!previous.ready()) {
            previous = versions.rotateEpoch(previous);
        }
        ViewportMappingMaintainer.MappingResult result = mappings.repairAndVerify(properties.getGridSizeMeters());
        return versions.publish(previous, properties.getGridSizeMeters(), result.valid(), result.changed());
    }

    private void authorizeWriter() {
        jdbc.queryForObject("SELECT set_config('jumin.viewport_writer_protocol', '1', TRUE)", String.class);
    }
}
