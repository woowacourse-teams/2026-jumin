package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportFailureClassificationTest {

    @Test
    @DisplayName("다음 cursor fetch가 deadline 후 반환하면 그 행을 소비하거나 다음 fetch를 실행하지 않는다")
    void rejects_row_returned_after_total_deadline() throws Exception {
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

        assertThatThrownBy(() -> deadline.next(rows))
                .isInstanceOfSatisfying(BusinessException.class, failure ->
                        assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
        assertThatThrownBy(() -> deadline.next(rows))
                .isInstanceOfSatisfying(BusinessException.class, failure ->
                        assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
        assertThat(fetches).hasValue(1);
    }
}
