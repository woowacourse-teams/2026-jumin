package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.global.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;

class ParkingSearchQueryValidatorTest {

    private final ParkingSearchQueryValidator validator = new ParkingSearchQueryValidator(
            Clock.fixed(Instant.parse("2026-08-13T00:00:00Z"), ZoneOffset.UTC)
    );

    @Test
    @DisplayName("미래의 유효한 이용 시간 요청을 허용한다")
    void accepts_valid_future_query() {
        // given
        ParkingSearchRequest searchRequest = request(
                37.5, 127.0, "2026-08-14T10:00:00+09:00", "2026-08-14T11:00:00+09:00");

        // when
        validator.validate(searchRequest);

        // then
        // No exception means the request is accepted.
    }

    @Test
    @DisplayName("퇴장 시간이 입장 시간보다 빠르면 거부한다")
    void rejects_exit_before_entry() {
        // given
        ParkingSearchRequest searchRequest = request(
                37.5, 127.0, "2026-08-14T11:00:00+09:00", "2026-08-14T10:00:00+09:00");

        // when & then
        assertThatThrownBy(() -> validator.validate(searchRequest))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("이용 시간이 0분이면 거부한다")
    void rejects_zero_minute_duration() {
        // given
        ParkingSearchRequest searchRequest = request(
                37.5, 127.0, "2026-08-14T10:00:00+09:00", "2026-08-14T10:00:00+09:00");

        // when & then
        assertThatThrownBy(() -> validator.validate(searchRequest))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("검증 대상 요청이 없으면 거부한다")
    void rejects_null_request() {
        // given
        ParkingSearchRequest searchRequest = null;

        // when & then
        assertThatThrownBy(() -> validator.validate(searchRequest))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("입차 시간이 없으면 거부한다")
    void rejects_missing_entry_time() {
        // given
        ParkingSearchRequest searchRequest = new ParkingSearchRequest(
                37.5,
                127.0,
                null,
                OffsetDateTime.parse("2026-08-14T11:00:00+09:00")
        );

        // when & then
        assertThatThrownBy(() -> validator.validate(searchRequest))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("출차 시간이 없으면 거부한다")
    void rejects_missing_exit_time() {
        // given
        ParkingSearchRequest searchRequest = new ParkingSearchRequest(
                37.5,
                127.0,
                OffsetDateTime.parse("2026-08-14T10:00:00+09:00"),
                null
        );

        // when & then
        assertThatThrownBy(() -> validator.validate(searchRequest))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("서울 시간대가 아니면 거부한다")
    void rejects_non_seoul_offset() {
        // given
        ParkingSearchRequest searchRequest = request(
                37.5, 127.0, "2026-08-14T10:00:00+08:00", "2026-08-14T11:00:00+08:00");

        // when & then
        assertThatThrownBy(() -> validator.validate(searchRequest))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("10분 단위가 아니면 거부한다")
    void rejects_non_ten_minute_time() {
        // given
        ParkingSearchRequest searchRequest = request(
                37.5, 127.0, "2026-08-14T10:05:00+09:00", "2026-08-14T11:00:00+09:00");

        // when & then
        assertThatThrownBy(() -> validator.validate(searchRequest))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("현재 시각 이전의 입차 시간은 거부한다")
    void rejects_past_entry_time() {
        // given
        ParkingSearchRequest searchRequest = request(
                37.5, 127.0, "2026-08-13T08:00:00+09:00", "2026-08-13T09:00:00+09:00");

        // when & then
        assertThatThrownBy(() -> validator.validate(searchRequest))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("24시간을 넘는 이용 시간은 거부한다")
    void rejects_duration_over_one_day() {
        // given
        ParkingSearchRequest searchRequest = request(
                37.5, 127.0, "2026-08-14T10:00:00+09:00", "2026-08-15T10:10:00+09:00");

        // when & then
        assertThatThrownBy(() -> validator.validate(searchRequest))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("정확히 24시간인 이용 시간은 허용한다")
    void accepts_exactly_one_day_duration() {
        // given
        ParkingSearchRequest searchRequest = request(
                37.5, 127.0, "2026-08-14T10:00:00+09:00", "2026-08-15T10:00:00+09:00");

        // when
        validator.validate(searchRequest);

        // then
        // No exception means the maximum duration is accepted.
    }

    private ParkingSearchRequest request(double latitude, double longitude, String entryAt, String exitAt) {
        return new ParkingSearchRequest(
                latitude,
                longitude,
                OffsetDateTime.parse(entryAt),
                OffsetDateTime.parse(exitAt)
        );
    }
}
