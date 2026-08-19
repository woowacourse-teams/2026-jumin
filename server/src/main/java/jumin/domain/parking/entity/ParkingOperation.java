package jumin.domain.parking.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import jumin.global.entity.BaseEntity;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Table(name = "parking_operations")
@Entity
@Getter
@NoArgsConstructor
public class ParkingOperation extends BaseEntity {

    @Id
    @Column(name = "parking_lot_id")
    private Long parkingLotId; // 주차장 기본 키

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "parking_lot_id", nullable = false)
    private ParkingLot parkingLot;

    @Column(name = "base_free_minutes")
    private Integer baseFreeMinutes; // 기본 무료시간(분)

    @Column(name = "base_minutes")
    private Integer baseMinutes; // 기본요금 적용시간(분)

    @Column(name = "base_fee")
    private Integer baseFee; // 기본요금(원)

    @Column(name = "additional_minutes")
    private Integer additionalMinutes; // 추가요금 단위시간(분)

    @Column(name = "additional_fee")
    private Integer additionalFee; // 추가 단위요금(원)

    @Column(name = "daily_max_fee")
    private Integer dailyMaxFee; // 일 최대요금(원)

    @Column(name = "monthly_fee")
    private Integer monthlyFee; // 월 정기권 요금(원)

    @Column(name = "weekday_paid")
    private Boolean weekdayPaid; // 평일 유료 여부

    @Column(name = "saturday_paid")
    private Boolean saturdayPaid; // 토요일 유료 여부

    @Column(name = "holiday_paid")
    private Boolean holidayPaid; // 일요일·공휴일 유료 여부

    @Enumerated(EnumType.STRING)
    @Column(name = "weekday_status", length = 10)
    private ParkingOperationStatus weekdayStatus; // 평일 운영 상태

    @Column(name = "weekday_open_time")
    private LocalTime weekdayOpenTime; // 평일 운영 시작시간

    @Column(name = "weekday_close_time")
    private LocalTime weekdayCloseTime; // 평일 운영 종료시간

    @Enumerated(EnumType.STRING)
    @Column(name = "weekend_status", length = 10)
    private ParkingOperationStatus weekendStatus; // 토요일 운영 상태

    @Column(name = "weekend_open_time")
    private LocalTime weekendOpenTime; // 토요일 운영 시작시간

    @Column(name = "weekend_close_time")
    private LocalTime weekendCloseTime; // 토요일 운영 종료시간

    @Enumerated(EnumType.STRING)
    @Column(name = "holiday_status", length = 10)
    private ParkingOperationStatus holidayStatus; // 일요일·공휴일 운영 상태

    @Column(name = "holiday_open_time")
    private LocalTime holidayOpenTime; // 일요일·공휴일 운영 시작시간

    @Column(name = "holiday_close_time")
    private LocalTime holidayCloseTime; // 일요일·공휴일 운영 종료시간

    @Column(name = "source_checked_at", nullable = false)
    private LocalDateTime sourceCheckedAt; // 데이터 갱신 시각

    public Integer calculateFee(int durationMinutes, DayOfWeek entryDayOfWeek) {
        Boolean paidForEntryDate = paidForEntryDate(entryDayOfWeek);
        if (durationMinutes <= 0 || paidForEntryDate == null) {
            return null;
        }
        if (!paidForEntryDate) {
            return 0;
        }
        if (!isValidBaseRule()) {
            return null;
        }

        int paidDurationMinutes = paidDurationMinutes(durationMinutes);
        if (paidDurationMinutes <= 0) {
            return toFee(0, dailyMaxFee);
        }

        if (paidDurationMinutes <= baseMinutes) {
            return toFee(baseFee, dailyMaxFee);
        }

        if (isFreeRule()) {
            return toFee(0, dailyMaxFee);
        }

        if (!isPositive(additionalMinutes) || !isNonNegative(additionalFee)) {
            return null;
        }

        long excessMinutes = (long) paidDurationMinutes - baseMinutes;
        long units = (excessMinutes + additionalMinutes - 1) / additionalMinutes;
        long fee = baseFee + units * additionalFee;
        return toFee(fee, dailyMaxFee);
    }

    private Boolean paidForEntryDate(DayOfWeek dayOfWeek) {
        if (dayOfWeek == null) {
            return null;
        }

        return switch (dayOfWeek) {
            case MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY -> weekdayPaid;
            case SATURDAY -> saturdayPaid;
            case SUNDAY -> holidayPaid;
        };
    }

    private boolean isValidBaseRule() {
        return (baseFreeMinutes == null || isNonNegative(baseFreeMinutes))
                && isNonNegative(baseMinutes)
                && isNonNegative(baseFee);
    }

    private int paidDurationMinutes(int durationMinutes) {
        if (baseFreeMinutes == null) {
            return durationMinutes;
        }
        return durationMinutes - baseFreeMinutes;
    }

    private boolean isFreeRule() {
        return baseFee == 0 && Integer.valueOf(0).equals(additionalFee);
    }

    private Integer toFee(long fee, Integer maxFee) {
        if (isNonNegative(maxFee)) {
            fee = Math.min(fee, maxFee);
        }
        if (fee > Integer.MAX_VALUE) {
            return null;
        }
        return (int) fee;
    }

    private boolean isNonNegative(Integer value) {
        return value != null && value >= 0;
    }

    private boolean isPositive(Integer value) {
        return value != null && value > 0;
    }
}
