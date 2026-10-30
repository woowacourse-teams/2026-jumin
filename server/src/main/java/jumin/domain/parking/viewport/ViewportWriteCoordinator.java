package jumin.domain.parking.viewport;

import java.sql.Connection;
import jumin.config.ViewportCacheProperties;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.IllegalTransactionStateException;

@Service
public class ViewportWriteCoordinator {

    private final JdbcTemplate jdbc;
    private final ViewportMappingStateRepository states;
    private final ViewportMappingMaintainer mappings;
    private final ViewportCacheProperties properties;

    public ViewportWriteCoordinator(JdbcTemplate jdbc, ViewportMappingStateRepository states,
                                    ViewportMappingMaintainer mappings, ViewportCacheProperties properties) {
        this.jdbc = jdbc;
        this.states = states;
        this.mappings = mappings;
        this.properties = properties;
    }

    public ViewportMappingState beforeSourceWrite() {
        requireReadCommitted();
        ViewportMappingState state = states.lockForWrite();
        lockSource();
        return state;
    }

    public void afterSourceWrite(ViewportMappingState previous) {
        if (!previous.ready()) {
            return;
        }
        ViewportMappingResult result = mappings.repairAndVerify(previous.gridSizeMeters());
        states.publish(previous.gridSizeMeters(), result.valid());
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ViewportMappingState prepare() {
        requireReadCommitted();
        states.lockForWrite();
        lockSource();
        ViewportMappingResult result = mappings.repairAndVerify(properties.getGridSizeMeters());
        return states.publish(properties.getGridSizeMeters(), result.valid());
    }

    private void lockSource() {
        jdbc.execute("LOCK TABLE parking_lots IN SHARE ROW EXCLUSIVE MODE");
    }

    private void requireReadCommitted() {
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            if (connection.getTransactionIsolation() != Connection.TRANSACTION_READ_COMMITTED) {
                throw new IllegalTransactionStateException("viewport 매핑 갱신은 READ COMMITTED가 필요합니다.");
            }
            return null;
        });
    }
}
