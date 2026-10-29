package jumin.domain.parking.viewport;

import com.zaxxer.hikari.HikariConfig;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLTransientConnectionException;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;
import javax.sql.DataSource;
import org.springframework.jdbc.datasource.AbstractDataSource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Tracks the physical connection factory, independently of Hikari's waiting caller. */
final class ViewportConnectionAttempts extends AbstractDataSource {

    record Snapshot(long generation, int inFlight) { }
    @FunctionalInterface
    private interface Connect {
        Connection open() throws SQLException;
    }

    private final DataSource target;
    private final AtomicLong fence;
    private long generation;
    private int inFlight;
    private volatile int reportedLoginTimeout = 1;

    ViewportConnectionAttempts(HikariConfig config, AtomicLong fence) {
        this(dataSource(config), fence);
    }

    ViewportConnectionAttempts(DataSource target, AtomicLong fence) {
        this.target = target;
        this.fence = fence;
    }

    private static DataSource dataSource(HikariConfig config) {
        DriverManagerDataSource target = new DriverManagerDataSource(config.getJdbcUrl(), config.getDataSourceProperties());
        target.setUsername(config.getUsername());
        target.setPassword(config.getPassword());
        return target;
    }

    @Override
    public Connection getConnection() throws SQLException {
        return connect(target::getConnection);
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return connect(() -> target.getConnection(username, password));
    }

    private Connection connect(Connect operation) throws SQLException {
        synchronized (this) {
            if (fence.get() != 0) {
                throw new SQLTransientConnectionException("viewport physical connection generation is fenced", "08001");
            }
            inFlight++;
            generation++;
        }
        try {
            return operation.open();
        } finally {
            synchronized (this) {
                inFlight--;
                generation++;
            }
        }
    }

    synchronized Snapshot snapshot() {
        return new Snapshot(generation, inFlight);
    }

    synchronized boolean clearIfUnchanged(Snapshot observed, long expectedFence, BooleanSupplier noLogicalWork) {
        return observed.generation() == generation && inFlight == 0 && noLogicalWork.getAsBoolean()
                && fence.compareAndSet(expectedFence, 0);
    }

    @Override
    public void setLoginTimeout(int seconds) {
        // PG loginTimeout is explicitly 0: a timed-out ConnectThread must not escape this physical factory.
        // connectTimeout/socketTimeout bound driver I/O; Hikari waits up to 1,000 ms for readers, 250 ms for observers.
        reportedLoginTimeout = Math.max(1, seconds);
    }

    @Override
    public int getLoginTimeout() {
        return reportedLoginTimeout;
    }
}
