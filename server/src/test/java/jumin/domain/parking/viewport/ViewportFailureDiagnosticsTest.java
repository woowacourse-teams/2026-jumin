package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.sql.SQLException;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionSystemException;

class ViewportFailureDiagnosticsTest {

    @Test
    void retains_coded_queue_cause_through_generic_response_wrapper_without_messages() {
        var cause = new ViewportUnavailableException(ViewportUnavailableException.Reason.DB_QUEUE_FULL,
                "private query parameters");
        var summary = ViewportFailureDiagnostics.inspect(new ViewportUnavailableException("response failed", cause));

        assertThat(summary.reason()).isEqualTo("DB_QUEUE_FULL");
        assertThat(summary.causeType()).isEqualTo("ViewportUnavailableException");
        assertThat(summary.sqlState()).isEqualTo("unavailable");
        assertThat(summary.toString()).doesNotContain("private query parameters", "response failed");
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
