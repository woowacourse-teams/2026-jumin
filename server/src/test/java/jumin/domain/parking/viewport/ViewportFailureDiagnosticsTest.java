package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.sql.SQLException;
import java.time.Duration;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionSystemException;

class ViewportFailureDiagnosticsTest {

    @Test
    void retains_coded_queue_cause_through_generic_response_wrapper_without_messages() {
        var privateCause = new RuntimeException("private query parameters");
        var cause = ViewportFailureReason.DB_QUEUE_FULL.failure(privateCause);
        var wrapper = ViewportFailureReason.UNCLASSIFIED.failure(cause);
        var summary = ViewportFailureDiagnostics.inspect(wrapper);

        assertThat(summary.reason()).isEqualTo("DB_QUEUE_FULL");
        assertThat(summary.causeType()).isEqualTo("RuntimeException");
        assertThat(summary.sqlState()).isEqualTo("unavailable");
        assertThat(summary.toString()).doesNotContain("private query parameters", "response failed");
        assertThat(cause.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE);
        assertThat(cause.getCause()).isSameAs(privateCause);
        assertThat(wrapper.getCause()).isSameAs(cause);
    }

    @Test
    void ignores_reason_from_other_business_error_codes() {
        var failure = new BusinessException(ErrorCode.INVALID_INPUT, "DB_QUEUE_FULL", null);

        var summary = ViewportFailureDiagnostics.inspect(failure);

        assertThat(summary.reason()).isEqualTo("UNCLASSIFIED");
    }

    @Test
    void ignores_unknown_reason_even_when_it_has_safe_characters() {
        var failure = new BusinessException(ErrorCode.VIEWPORT_UNAVAILABLE, "PRIVATE_VALUE", null);

        var summary = ViewportFailureDiagnostics.inspect(failure);

        assertThat(summary.reason()).isEqualTo("UNCLASSIFIED");
        assertThat(summary.toString()).doesNotContain("PRIVATE_VALUE");
    }

    @Test
    void rejects_unbounded_or_unsafe_reason_values() {
        assertThatThrownBy(() -> new BusinessException(ErrorCode.VIEWPORT_UNAVAILABLE, "private detail", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Invalid exception reason");
        assertThatThrownBy(() -> new BusinessException(ErrorCode.VIEWPORT_UNAVAILABLE, "A".repeat(65), null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Invalid exception reason");
    }

    @Test
    void inspects_sql_state_hidden_by_transaction_rollback_and_next_exception() {
        SQLException query = new SQLException("private SQL", "42601");
        query.setNextException(new SQLException("private bind value", "08006"));
        var transaction = new TransactionSystemException("rollback failed");
        transaction.initApplicationException(new SQLException("private SQL", "08006"));
        transaction.addSuppressed(query);

        var summary = ViewportFailureDiagnostics.inspect(transaction);

        assertThat(summary.reason()).isEqualTo("DB_CONNECTION_ERROR");
        assertThat(summary.sqlState()).isEqualTo("08006");
        assertThat(summary.toString()).doesNotContain("private SQL", "private bind value");
    }

    @Test
    void terminates_on_cycles_and_does_not_log_arbitrary_sql_state_content() {
        RuntimeException first = new RuntimeException("one");
        RuntimeException second = new RuntimeException("two", first);
        first.initCause(second);
        second.addSuppressed(new SQLException("secret", "password=secret"));

        var summary = assertTimeoutPreemptively(Duration.ofSeconds(1),
                () -> ViewportFailureDiagnostics.inspect(first));

        assertThat(summary.sqlState()).isEqualTo("unavailable");
        assertThat(summary.toString()).doesNotContain("password=secret");
    }
}
