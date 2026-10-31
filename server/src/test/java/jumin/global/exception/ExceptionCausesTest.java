package jumin.global.exception;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.SQLException;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionSystemException;

class ExceptionCausesTest {

    @Test
    @DisplayName("SQL 다음 예외와 트랜잭션 원본 및 cause와 suppressed를 기존 순서로 모은다")
    void collects_related_failures_in_order() {
        // given
        var next = new SQLException("next");
        var cause = new IllegalStateException("cause");
        var suppressed = new IllegalArgumentException("suppressed");
        var sql = new SQLException("query", cause);
        sql.setNextException(next);
        sql.addSuppressed(suppressed);
        var rollback = new TransactionSystemException("rollback", sql);
        var application = new RuntimeException("application");
        rollback.initApplicationException(application);

        // when
        List<Throwable> failures = ExceptionCauses.collect(rollback);

        // then
        assertThat(failures).containsExactly(rollback, application, sql, next, cause, suppressed);
    }

    @Test
    @DisplayName("같은 예외를 한 번만 모으고 순환 참조에서 종료한다")
    void visits_each_failure_once() {
        // given
        var first = new RuntimeException("first");
        var second = new RuntimeException("second", first);
        first.initCause(second);
        first.addSuppressed(second);

        // when
        List<Throwable> failures = ExceptionCauses.collect(first);

        // then
        assertThat(failures).containsExactly(first, second);
    }

    @Test
    @DisplayName("예외 수집은 32개로 제한하고 null 입력을 거절한다")
    void limits_collection_and_rejects_null() {
        // given
        Throwable failure = new RuntimeException("leaf");
        for (int index = 0; index < 40; index++) {
            failure = new RuntimeException("wrapper", failure);
        }

        // when
        List<Throwable> failures = ExceptionCauses.collect(failure);

        // then
        assertThat(failures).hasSize(32).startsWith(failure);
        assertThatThrownBy(() -> ExceptionCauses.collect(null)).isInstanceOf(NullPointerException.class);
    }
}
