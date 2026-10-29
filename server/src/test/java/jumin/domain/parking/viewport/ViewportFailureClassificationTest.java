package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.transaction.TransactionSystemException;

class ViewportFailureClassificationTest {

    @Test
    @DisplayName("rollback 오류에 가려진 원래 SQL08 application 예외를 연결 장애로 분류한다")
    void finds_original_application_connection_failure() {
        // given
        TransactionSystemException rollback = new TransactionSystemException("rollback failed", new SQLException("closed"));
        rollback.initApplicationException(new DataAccessResourceFailureException("query failed", new SQLException("network", "08006")));

        // when & then
        assertThat(ViewportDbAccess.hasConnectionFailure(rollback)).isTrue();
        assertThat(ViewportDbAccess.hasConnectionFailure(new SQLException("bad query", "42601"))).isFalse();
    }

    @Test
    @DisplayName("next 및 suppressed 예외를 탐색하고 순환 cause에서도 종료한다")
    void traverses_exception_graph_with_cycles() {
        // given
        SQLException first = new SQLException("first", "42601");
        first.setNextException(new SQLException("connection", "08003"));
        RuntimeException wrapper = new RuntimeException("wrapper");
        RuntimeException nested = new RuntimeException("nested", wrapper);
        wrapper.initCause(nested);
        wrapper.addSuppressed(first);
        RuntimeException cycleOnly = new RuntimeException("one");
        RuntimeException other = new RuntimeException("two", cycleOnly);
        cycleOnly.initCause(other);

        // when & then
        assertThat(ViewportDbAccess.hasConnectionFailure(wrapper)).isTrue();
        assertThat(ViewportDbAccess.hasConnectionFailure(cycleOnly)).isFalse();
    }

    @Test
    @DisplayName("다음 cursor fetch가 deadline 후 반환하면 그 행을 소비하거나 다음 fetch를 실행하지 않는다")
    void rejects_row_returned_after_total_deadline() throws Exception {
        // given
        ResultSet rows = mock(ResultSet.class);
        ViewportDeadline deadline = ViewportDeadline.after(Duration.ofMillis(20));
        AtomicInteger fetches = new AtomicInteger();
        when(rows.next()).thenAnswer(invocation -> {
            fetches.incrementAndGet();
            while (deadline.remainingNanos() > 0) {
                Thread.sleep(1);
            }
            return true;
        });

        // when & then
        assertThatThrownBy(() -> deadline.next(rows)).isInstanceOf(ViewportUnavailableException.class);
        assertThatThrownBy(() -> deadline.next(rows)).isInstanceOf(ViewportUnavailableException.class);
        assertThat(fetches).hasValue(1);
    }
}
