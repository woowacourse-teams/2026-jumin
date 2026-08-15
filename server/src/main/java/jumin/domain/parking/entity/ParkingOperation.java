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

    @Enumerated(EnumType.STRING)
    @Column(name = "monday_status", length = 10)
    private ParkingOperationStatus mondayStatus; // 월요일 운영 상태

    @Column(name = "monday_open_time")
    private LocalTime mondayOpenTime; // 월요일 운영 시작시간

    @Column(name = "monday_close_time")
    private LocalTime mondayCloseTime; // 월요일 운영 종료시간

    @Enumerated(EnumType.STRING)
    @Column(name = "tuesday_status", length = 10)
    private ParkingOperationStatus tuesdayStatus; // 화요일 운영 상태

    @Column(name = "tuesday_open_time")
    private LocalTime tuesdayOpenTime; // 화요일 운영 시작시간

    @Column(name = "tuesday_close_time")
    private LocalTime tuesdayCloseTime; // 화요일 운영 종료시간

    @Enumerated(EnumType.STRING)
    @Column(name = "wednesday_status", length = 10)
    private ParkingOperationStatus wednesdayStatus; // 수요일 운영 상태

    @Column(name = "wednesday_open_time")
    private LocalTime wednesdayOpenTime; // 수요일 운영 시작시간

    @Column(name = "wednesday_close_time")
    private LocalTime wednesdayCloseTime; // 수요일 운영 종료시간

    @Enumerated(EnumType.STRING)
    @Column(name = "thursday_status", length = 10)
    private ParkingOperationStatus thursdayStatus; // 목요일 운영 상태

    @Column(name = "thursday_open_time")
    private LocalTime thursdayOpenTime; // 목요일 운영 시작시간

    @Column(name = "thursday_close_time")
    private LocalTime thursdayCloseTime; // 목요일 운영 종료시간

    @Enumerated(EnumType.STRING)
    @Column(name = "friday_status", length = 10)
    private ParkingOperationStatus fridayStatus; // 금요일 운영 상태

    @Column(name = "friday_open_time")
    private LocalTime fridayOpenTime; // 금요일 운영 시작시간

    @Column(name = "friday_close_time")
    private LocalTime fridayCloseTime; // 금요일 운영 종료시간

    @Enumerated(EnumType.STRING)
    @Column(name = "saturday_status", length = 10)
    private ParkingOperationStatus saturdayStatus; // 토요일 운영 상태

    @Column(name = "saturday_open_time")
    private LocalTime saturdayOpenTime; // 토요일 운영 시작시간

    @Column(name = "saturday_close_time")
    private LocalTime saturdayCloseTime; // 토요일 운영 종료시간

    @Enumerated(EnumType.STRING)
    @Column(name = "sunday_status", length = 10)
    private ParkingOperationStatus sundayStatus; // 일요일 운영 상태

    @Column(name = "sunday_open_time")
    private LocalTime sundayOpenTime; // 일요일 운영 시작시간

    @Column(name = "sunday_close_time")
    private LocalTime sundayCloseTime; // 일요일 운영 종료시간

    @Enumerated(EnumType.STRING)
    @Column(name = "holiday_status", length = 10)
    private ParkingOperationStatus holidayStatus; // 공휴일 운영 상태

    @Column(name = "holiday_open_time")
    private LocalTime holidayOpenTime; // 공휴일 운영 시작시간

    @Column(name = "holiday_close_time")
    private LocalTime holidayCloseTime; // 공휴일 운영 종료시간

    @Column(name = "source_checked_at", nullable = false)
    private LocalDateTime sourceCheckedAt; // 데이터 갱신 시각

    public Integer calculateFee(int durationMinutes) {
        if (!isValidBaseRule(durationMinutes)) {
            return null;
        }

        if (durationMinutes <= baseMinutes) {
            return toFee(baseFee, dailyMaxFee);
        }

        if (isFreeRule()) {
            return toFee(0, dailyMaxFee);
        }

        if (!isPositive(additionalMinutes) || !isNonNegative(additionalFee)) {
            return null;
        }

        long excessMinutes = (long) durationMinutes - baseMinutes;
        long units = (excessMinutes + additionalMinutes - 1) / additionalMinutes;
        long fee = baseFee + units * additionalFee;
        return toFee(fee, dailyMaxFee);
    }

    private boolean isValidBaseRule(int durationMinutes) {
        return durationMinutes > 0
                && isNonNegative(baseMinutes)
                && isNonNegative(baseFee);
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
