package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.Connection;
import java.sql.SQLTransientConnectionException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportConnectionAttemptsTest {

    @Test
    @DisplayName("논리 대기가 끝나도 물리 연결을 추적하고 fence 이후 새 접속 및 오래된 관측의 해제를 막는다")
    void tracks_actual_factory_and_rejects_stale_observation() throws Exception {
        // given
        DataSource target = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(target.getConnection()).thenAnswer(invocation -> {
            started.countDown();
            assertThat(release.await(5,TimeUnit.SECONDS)).isTrue();
            return connection;
        });
        AtomicLong fence = new AtomicLong();
        ViewportConnectionAttempts attempts = new ViewportConnectionAttempts(target,fence);
        ViewportConnectionAttempts.Snapshot old = attempts.snapshot();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var creating = CompletableFuture.supplyAsync(() -> {
                try {
                    return attempts.getConnection();
                } catch (Exception failure) {
                    throw new IllegalStateException(failure);
                }
            },executor);
            assertThat(started.await(5,TimeUnit.SECONDS)).isTrue();

            // when & then
            assertThatThrownBy(() -> creating.get(10,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            fence.set(1);
            assertThat(attempts.snapshot().inFlight()).isEqualTo(1);
            assertThat(attempts.clearIfUnchanged(old,1,() -> true)).isFalse();
            assertThatThrownBy(attempts::getConnection).isInstanceOf(SQLTransientConnectionException.class);
            release.countDown();
            assertThat(creating.get(5,TimeUnit.SECONDS)).isSameAs(connection);
            assertThat(attempts.snapshot().inFlight()).isZero();
            assertThat(attempts.clearIfUnchanged(old,1,() -> true)).isFalse();
            assertThat(attempts.clearIfUnchanged(attempts.snapshot(),1,() -> false)).isFalse();
            assertThat(attempts.clearIfUnchanged(attempts.snapshot(),1,() -> true)).isTrue();
            assertThat(fence).hasValue(0);
        } finally {
            release.countDown();
        }
    }
}
