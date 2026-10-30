package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.time.Duration;
import java.util.concurrent.TimeoutException;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.transaction.TransactionSystemException;

class ViewportFailureDiagnosticsTest {

    @Test
    @DisplayName("일반 응답 예외 안의 알려진 원인을 유지하고 메시지는 제외한다")
    void retains_coded_queue_cause_through_generic_response_wrapper_without_messages() {
        // given
        var privateCause = new RuntimeException("private query parameters");
        var cause = ViewportFailureReason.DB_QUEUE_FULL.failure(privateCause);
        var wrapper = ViewportFailureReason.UNCLASSIFIED.failure(cause);
        // when
        var summary = ViewportFailureDiagnostics.inspect(wrapper);

        // then
        assertThat(summary.reason()).isEqualTo("DB_QUEUE_FULL");
        assertThat(summary.causeType()).isEqualTo("RuntimeException");
        assertThat(summary.sqlState()).isEqualTo("unavailable");
        assertThat(summary.toString()).doesNotContain("private query parameters", "response failed");
        assertThat(cause.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE);
        assertThat(cause.getCause()).isSameAs(privateCause);
        assertThat(wrapper.getCause()).isSameAs(cause);
    }

    @Test
    @DisplayName("다른 비즈니스 오류의 reason은 사용하지 않는다")
    void ignores_reason_from_other_business_error_codes() {
        // given
        var failure = new BusinessException(ErrorCode.INVALID_INPUT, "DB_QUEUE_FULL", null);

        // when
        var summary = ViewportFailureDiagnostics.inspect(failure);

        // then
        assertThat(summary.reason()).isEqualTo("UNCLASSIFIED");
    }

    @Test
    @DisplayName("알 수 없는 reason은 안전한 문자여도 제외한다")
    void ignores_unknown_reason_even_when_it_has_safe_characters() {
        // given
        var failure = new BusinessException(ErrorCode.VIEWPORT_UNAVAILABLE, "PRIVATE_VALUE", null);

        // when
        var summary = ViewportFailureDiagnostics.inspect(failure);

        // then
        assertThat(summary.reason()).isEqualTo("UNCLASSIFIED");
        assertThat(summary.toString()).doesNotContain("PRIVATE_VALUE");
    }

    @ParameterizedTest
    @ValueSource(strings = {"DB_CONNECTION_ERROR", "DB_SQL_ERROR", "DEADLINE"})
    @DisplayName("SQL과 timeout 진단용 이름은 비즈니스 reason으로 받아들이지 않는다")
    void computed_reason_labels_do_not_override_coded_causes(String reason) {
        // given
        var failure = new BusinessException(ErrorCode.VIEWPORT_UNAVAILABLE, reason,
                ViewportFailureReason.DB_QUEUE_FULL.failure());
        // when
        var summary = ViewportFailureDiagnostics.inspect(failure);
        // then
        assertThat(summary.reason()).isEqualTo("DB_QUEUE_FULL");
    }

    @Test
    @DisplayName("reason의 길이와 형식을 제한한다")
    void rejects_unbounded_or_unsafe_reason_values() {
        // given
        // when & then
        assertThatThrownBy(() -> new BusinessException(ErrorCode.VIEWPORT_UNAVAILABLE, "private detail", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Invalid exception reason");
        assertThatThrownBy(() -> new BusinessException(ErrorCode.VIEWPORT_UNAVAILABLE, "A".repeat(65), null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Invalid exception reason");
    }

    @Test
    @DisplayName("롤백 예외와 다음 SQL 예외 안의 SQLState를 검사한다")
    void inspects_sql_state_hidden_by_transaction_rollback_and_next_exception() {
        // given
        SQLException query = new SQLException("private SQL", "42601");
        query.setNextException(new SQLException("private bind value", "08006"));
        var transaction = new TransactionSystemException("rollback failed");
        transaction.initApplicationException(new SQLException("private SQL", "08006"));
        transaction.addSuppressed(query);

        // when
        var summary = ViewportFailureDiagnostics.inspect(transaction);

        // then
        assertThat(summary.reason()).isEqualTo("DB_CONNECTION_ERROR");
        assertThat(summary.sqlState()).isEqualTo("08006");
        assertThat(summary.toString()).doesNotContain("private SQL", "private bind value");
    }

    @Test
    @DisplayName("순환 예외에서 종료하고 유효하지 않은 SQLState를 노출하지 않는다")
    void terminates_on_cycles_and_does_not_log_arbitrary_sql_state_content() {
        // given
        RuntimeException first = new RuntimeException("one");
        RuntimeException second = new RuntimeException("two", first);
        first.initCause(second);
        second.addSuppressed(new SQLException("secret", "password=secret"));

        // when
        var summary = assertTimeoutPreemptively(Duration.ofSeconds(1),
                () -> ViewportFailureDiagnostics.inspect(first));

        // then
        assertThat(summary.sqlState()).isEqualTo("unavailable");
        assertThat(summary.toString()).doesNotContain("password=secret");
    }

    @Test
    @DisplayName("SQL 다음 예외는 cause와 suppressed보다 먼저 검사해 첫 유효 SQLState를 유지한다")
    void preserves_sql_next_cause_and_suppressed_order() {
        // given
        SQLException failure = new SQLException("private root", "invalid");
        failure.setNextException(new SQLException("private next", "08006"));
        failure.initCause(new SQLException("private cause", "42601"));
        failure.addSuppressed(new SQLException("private suppressed", "22000"));
        // when
        var summary = ViewportFailureDiagnostics.inspect(failure);
        // then
        assertThat(summary.reason()).isEqualTo("DB_CONNECTION_ERROR");
        assertThat(summary.sqlState()).isEqualTo("08006");
        assertThat(summary.causeType()).isEqualTo("SQLException");
        assertThat(summary.toString()).doesNotContain("private");
    }

    @Test
    @DisplayName("트랜잭션 원본 예외는 cause와 suppressed보다 먼저 검사하고 SQL 분류는 timeout보다 우선한다")
    void preserves_transaction_application_and_sql_priority() {
        // given
        var failure = new TransactionSystemException("private rollback", new SQLException("private cause", "08006"));
        failure.initApplicationException(new SQLException("private application", "42601"));
        failure.addSuppressed(new SQLTimeoutException("private timeout", "57014"));
        // when
        var summary = ViewportFailureDiagnostics.inspect(failure);
        // then
        assertThat(summary.reason()).isEqualTo("DB_SQL_ERROR");
        assertThat(summary.sqlState()).isEqualTo("42601");
        assertThat(summary.causeType()).isEqualTo("SQLTimeoutException");
        assertThat(summary.toString()).doesNotContain("private");
    }

    @Test
    @DisplayName("처음 발견한 알려진 비즈니스 원인은 뒤의 원인과 SQL 및 timeout보다 우선한다")
    void preserves_first_coded_reason_priority() {
        // given
        SQLTimeoutException failure = new SQLTimeoutException("private timeout", "08006");
        failure.initCause(ViewportFailureReason.DB_QUEUE_FULL.failure());
        failure.addSuppressed(ViewportFailureReason.CELL_LOADER_CLOSED.failure());
        // when
        var summary = ViewportFailureDiagnostics.inspect(failure);
        // then
        assertThat(summary.reason()).isEqualTo("DB_QUEUE_FULL");
        assertThat(summary.sqlState()).isEqualTo("08006");
        assertThat(summary.toString()).doesNotContain("private");
    }

    @Test
    @DisplayName("유효한 SQLState와 알려진 원인이 없을 때만 시간 초과로 분류한다")
    void classifies_timeout_without_sql_state() {
        // given
        for (Throwable failure : new Throwable[]{new TimeoutException("private timeout"),
                new SQLTimeoutException("private SQL timeout")}) {
            // when
            var summary = ViewportFailureDiagnostics.inspect(failure);
            // then
            assertThat(summary.reason()).isEqualTo("DEADLINE");
            assertThat(summary.sqlState()).isEqualTo("unavailable");
            assertThat(summary.toString()).doesNotContain("private");
        }
    }

    @ParameterizedTest(name = "wrapper {0}개")
    @ValueSource(ints = {31, 32})
    @DisplayName("32번째 예외까지 검사하고 33번째 예외는 검사하지 않는다")
    void preserves_thirty_two_failure_limit(int wrappers) {
        // given
        Throwable failure = ViewportFailureReason.DB_QUEUE_FULL.failure();
        for (int index = 0; index < wrappers; index++) {
            failure = new RuntimeException("private wrapper", failure);
        }
        // when
        var summary = ViewportFailureDiagnostics.inspect(failure);
        // then
        assertThat(summary.reason()).isEqualTo(wrappers == 31 ? "DB_QUEUE_FULL" : "UNCLASSIFIED");
        assertThat(summary.causeType()).isEqualTo(wrappers == 31 ? "BusinessException" : "RuntimeException");
        assertThat(summary.toString()).doesNotContain("private");
    }

    @Test
    @DisplayName("알려진 원인이 있어도 뒤의 SQLState와 마지막 원인 형식까지 검사한다")
    void known_reason_does_not_skip_remaining_metadata() {
        // given
        SQLException sql = new SQLException("private SQL", "08006", new IllegalStateException("private leaf"));
        BusinessException failure = ViewportFailureReason.DB_QUEUE_FULL.failure(sql);
        // when
        var summary = ViewportFailureDiagnostics.inspect(failure);
        // then
        assertThat(summary.reason()).isEqualTo("DB_QUEUE_FULL");
        assertThat(summary.sqlState()).isEqualTo("08006");
        assertThat(summary.causeType()).isEqualTo("IllegalStateException");
        assertThat(summary.toString()).doesNotContain("private");
    }

    @Test
    @DisplayName("null 예외 입력은 기존과 같이 거절한다")
    void rejects_null_failure() {
        // given & when & then
        assertThatThrownBy(() -> ViewportFailureDiagnostics.inspect(null)).isInstanceOf(NullPointerException.class);
    }

}
