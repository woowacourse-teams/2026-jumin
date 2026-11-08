package jumin.domain.parking.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import jumin.domain.parking.exception.ViewportFailureReason;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportDeadlineTest {

    @Test
    @DisplayName("만료된 viewport 기한은 DEADLINE 사유와 기존 오류 코드를 반환한다")
    void expired_deadline_has_explicit_reason() {
        // given
        ViewportDeadline deadline = ViewportDeadline.after(Duration.ZERO);

        // when & then
        assertThatThrownBy(deadline::requireRemaining)
                .isInstanceOfSatisfying(BusinessException.class, failure -> {
                    assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE);
                    assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.DEADLINE.name());
                });
    }

    @Test
    @DisplayName("중단된 viewport 요청은 DEADLINE 사유로 종료하고 interrupt 상태를 보존한다")
    void interrupted_request_preserves_interrupt_status() {
        // given
        ViewportDeadline deadline = ViewportDeadline.after(Duration.ofSeconds(30));

        // when & then
        try {
            Thread.currentThread().interrupt();
            assertThatThrownBy(deadline::requireRemaining)
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.DEADLINE.name()));
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted();
        }
    }
}
