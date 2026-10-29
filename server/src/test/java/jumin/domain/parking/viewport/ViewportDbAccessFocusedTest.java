package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.zaxxer.hikari.HikariDataSource;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import javax.sql.DataSource;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.postgresql.PGConnection;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

class ViewportDbAccessFocusedTest {

    @Test
    @DisplayName("확정된 연결의 callback에서 deadline이 끝나도 전역 연결 fence를 만들지 않는다")
    void deadline_after_connection_is_acquired_does_not_fence() throws Exception {
        try (Harness harness = new Harness()) {
            Connection connection = mock(Connection.class);
            PGConnection postgres = mock(PGConnection.class);
            when(connection.unwrap(PGConnection.class)).thenReturn(postgres);
            when(postgres.getBackendPID()).thenReturn(123);
            when(harness.jdbc.execute(any(ConnectionCallback.class))).thenAnswer(invocation -> {
                ConnectionCallback<?> callback = invocation.getArgument(0);
                return callback.doInConnection(connection);
            });
            ViewportDeadline deadline = mock(ViewportDeadline.class);
            when(deadline.remainingNanos()).thenReturn(TimeUnit.SECONDS.toNanos(5));
            doNothing().doThrow(new ViewportUnavailableException("deadline"))
                    .when(deadline).requireRemaining();

            var result = harness.db.readAsync("version", deadline, ignored -> 1);
            assertThatThrownBy(() -> result.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(ViewportUnavailableException.class);
            completion(result).get(5, TimeUnit.SECONDS);
            verify(postgres).getBackendPID();
            assertThat(harness.fence).hasValue(0);
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isZero();
            assertThat(harness.registry.get("parking.viewport.db.stage.active").tag("stage", "version")
                    .gauge().value()).isZero();
        }
    }

    @Test
    @DisplayName("callback에 진입한 확정 연결의 비연결 식별 오류는 PID가 없어도 전역 fence를 만들지 않는다")
    void callback_entered_without_pid_does_not_imply_unknown_connection() throws Exception {
        try (Harness harness = new Harness()) {
            Connection connection = mock(Connection.class);
            when(connection.unwrap(PGConnection.class)).thenThrow(new SQLException("unsupported", "0A000"));
            when(harness.jdbc.execute(any(ConnectionCallback.class))).thenAnswer(invocation -> {
                ConnectionCallback<?> callback = invocation.getArgument(0);
                try {
                    return callback.doInConnection(connection);
                } catch (SQLException failure) {
                    throw new DataAccessResourceFailureException("unwrap failed", failure);
                }
            });
            var result = harness.db.readAsync("version", deadline(), ignored -> 1);
            assertThatThrownBy(() -> result.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(DataAccessResourceFailureException.class);
            completion(result).get(5, TimeUnit.SECONDS);
            assertThat(harness.fence).hasValue(0);
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isZero();
        }
    }

    @Test
    @DisplayName("연결 식별 전 권한 오류는 전역 fence로 확대하지 않지만 실제 연결 장애는 차단한다")
    void distinguishes_definite_permission_failure_from_unknown_connection() throws Exception {
        try (Harness harness = new Harness()) {
            when(harness.jdbc.execute(any(ConnectionCallback.class)))
                    .thenThrow(new DataAccessResourceFailureException("denied", new SQLException("denied", "42501")))
                    .thenThrow(new DataAccessResourceFailureException("connection lost", new SQLException("lost", "08001")));

            var denied = harness.db.readAsync("version", deadline(), ignored -> 1);
            assertThatThrownBy(() -> denied.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(DataAccessResourceFailureException.class);
            completion(denied).get(5, TimeUnit.SECONDS);
            assertThat(harness.fence).hasValue(0);

            var lost = harness.db.readAsync("version", deadline(), ignored -> 1);
            assertThatThrownBy(() -> lost.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(DataAccessResourceFailureException.class);
            completion(lost).get(5, TimeUnit.SECONDS);
            assertThat(harness.fence).hasValue(1);
            var blocked = harness.db.readAsync("version", deadline(), ignored -> 1);
            assertThatThrownBy(() -> blocked.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(ViewportUnavailableException.class);
            completion(blocked).get(5, TimeUnit.SECONDS);
            assertThat(harness.fence).hasValue(1);
        }
    }

    @Test
    @DisplayName("rollback 실패는 SQL08이 없어도 이미 확인한 backend와 permit을 격리한다")
    void rollback_failure_quarantines_identified_backend() throws Exception {
        try (Harness harness = new Harness()) {
            Connection connection = mock(Connection.class);
            PGConnection postgres = mock(PGConnection.class);
            when(harness.pool.getConnection()).thenReturn(connection);
            when(connection.unwrap(PGConnection.class)).thenReturn(postgres);
            when(postgres.getBackendPID()).thenReturn(456);
            when(harness.jdbc.queryForObject(anyString(), eq(Boolean.class), anyInt(), anyInt())).thenReturn(true);
            when(harness.transaction.execute(any())).thenAnswer(invocation -> {
                TransactionCallback<?> callback = invocation.getArgument(0);
                try {
                    callback.doInTransaction(mock(TransactionStatus.class));
                } catch (RuntimeException applicationFailure) {
                    TransactionSystemException rollback = new TransactionSystemException("rollback failed",
                            new SQLException("rollback failed"));
                    rollback.initApplicationException(applicationFailure);
                    throw rollback;
                }
                throw new AssertionError("expected application failure");
            });
            var result = harness.db.readAsync("source", deadline(), ignored -> {
                throw new ViewportUnavailableException("query failed");
            });
            assertThatThrownBy(() -> result.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(TransactionSystemException.class);
            completion(result).get(5, TimeUnit.SECONDS);
            assertThat(harness.fence).hasValue(0);
            assertThat(harness.registry.get("parking.viewport.db.uncertain").gauge().value()).isEqualTo(1);
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isEqualTo(1);
            assertThat(harness.registry.get("parking.viewport.db.stage.active").tag("stage", "source")
                    .gauge().value()).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("기존 fence 재검사 및 완료된 권한 오류와 진행 중인 물리 연결을 구분한다")
    void classifies_the_acquisition_phase() {
        var idle = new ViewportConnectionAttempts.Snapshot(0, 0);
        var connecting = new ViewportConnectionAttempts.Snapshot(1, 1);
        RuntimeException deadline = new ViewportUnavailableException("deadline");
        RuntimeException permission = new DataAccessResourceFailureException("denied",
                new SQLException("denied", "42501"));
        assertThat(ViewportDbAccess.unknownConnectionNeeded(false, false, deadline, idle)).isFalse();
        assertThat(ViewportDbAccess.unknownConnectionNeeded(true, true, deadline, idle)).isFalse();
        assertThat(ViewportDbAccess.unknownConnectionNeeded(true, false, permission, idle)).isFalse();
        assertThat(ViewportDbAccess.unknownConnectionNeeded(true, false, permission, connecting)).isTrue();
        assertThat(ViewportDbAccess.unknownConnectionNeeded(true, false, deadline, idle)).isTrue();
        assertThat(ViewportDbAccess.unknownConnectionNeeded(true, true,
                new TransactionSystemException("rollback failed"), idle)).isTrue();
    }

    private static ViewportDeadline deadline() {
        return ViewportDeadline.after(Duration.ofSeconds(5));
    }

    private static java.util.concurrent.CompletableFuture<Void> completion(java.util.concurrent.CompletableFuture<?> future) {
        return ((ViewportDbFuture<?>) future).workCompletion();
    }

    private static final class Harness implements AutoCloseable {
        private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
        private final TransactionTemplate transaction = mock(TransactionTemplate.class);
        private final HikariDataSource pool = mock(HikariDataSource.class);
        private final AtomicLong fence = new AtomicLong();
        private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
        private final ViewportDbAccess db = new ViewportDbAccess(jdbc, transaction, pool,
                new ViewportConnectionAttempts(mock(DataSource.class), fence), fence,
                new ViewportCacheProperties(), new ViewportMetrics(registry));

        @Override
        public void close() {
            db.close();
            registry.close();
        }
    }
}
