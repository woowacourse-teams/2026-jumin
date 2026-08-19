ALTER TABLE parking_operations
    ADD COLUMN weekday_status VARCHAR(10),
    ADD COLUMN weekday_open_time TIME,
    ADD COLUMN weekday_close_time TIME,
    ADD COLUMN weekend_status VARCHAR(10),
    ADD COLUMN weekend_open_time TIME,
    ADD COLUMN weekend_close_time TIME,
    ADD COLUMN weekday_paid BOOLEAN,
    ADD COLUMN saturday_paid BOOLEAN,
    ADD COLUMN holiday_paid BOOLEAN;

UPDATE parking_operations
SET weekday_status     = CASE WHEN monday_status = 'ALL_DAY' THEN 'OPEN' ELSE monday_status END,
    weekday_open_time  = CASE WHEN monday_status = 'ALL_DAY' THEN TIME '00:00:00' ELSE monday_open_time END,
    weekday_close_time = CASE WHEN monday_status = 'ALL_DAY' THEN TIME '00:00:00' ELSE monday_close_time END,
    weekend_status     = CASE WHEN saturday_status = 'ALL_DAY' THEN 'OPEN' ELSE saturday_status END,
    weekend_open_time  = CASE WHEN saturday_status = 'ALL_DAY' THEN TIME '00:00:00' ELSE saturday_open_time END,
    weekend_close_time = CASE WHEN saturday_status = 'ALL_DAY' THEN TIME '00:00:00' ELSE saturday_close_time END,
    holiday_status     = CASE WHEN holiday_status = 'ALL_DAY' THEN 'OPEN' ELSE holiday_status END,
    holiday_open_time  = CASE WHEN holiday_status = 'ALL_DAY' THEN TIME '00:00:00' ELSE holiday_open_time END,
    holiday_close_time = CASE WHEN holiday_status = 'ALL_DAY' THEN TIME '00:00:00' ELSE holiday_close_time END,
    -- 기존 스키마는 유료 여부를 저장하지 않았으므로 평일은 종전 요금 계산 동작을 유지한다.
    -- 토요일·공휴일은 원본의 N 값을 무료로 신뢰할 수 없어 재적재 전까지 미상으로 둔다.
    weekday_paid       = TRUE,
    saturday_paid      = NULL,
    holiday_paid       = NULL,
    daily_max_fee      = NULLIF(daily_max_fee, 0),
    monthly_fee        = NULLIF(monthly_fee, 0);

ALTER TABLE parking_operations
    DROP CONSTRAINT ck_parking_operations_monday_status,
    DROP CONSTRAINT ck_parking_operations_tuesday_status,
    DROP CONSTRAINT ck_parking_operations_wednesday_status,
    DROP CONSTRAINT ck_parking_operations_thursday_status,
    DROP CONSTRAINT ck_parking_operations_friday_status,
    DROP CONSTRAINT ck_parking_operations_saturday_status,
    DROP CONSTRAINT ck_parking_operations_sunday_status,
    DROP CONSTRAINT ck_parking_operations_holiday_status,
    DROP COLUMN monday_status,
    DROP COLUMN monday_open_time,
    DROP COLUMN monday_close_time,
    DROP COLUMN tuesday_status,
    DROP COLUMN tuesday_open_time,
    DROP COLUMN tuesday_close_time,
    DROP COLUMN wednesday_status,
    DROP COLUMN wednesday_open_time,
    DROP COLUMN wednesday_close_time,
    DROP COLUMN thursday_status,
    DROP COLUMN thursday_open_time,
    DROP COLUMN thursday_close_time,
    DROP COLUMN friday_status,
    DROP COLUMN friday_open_time,
    DROP COLUMN friday_close_time,
    DROP COLUMN saturday_status,
    DROP COLUMN saturday_open_time,
    DROP COLUMN saturday_close_time,
    DROP COLUMN sunday_status,
    DROP COLUMN sunday_open_time,
    DROP COLUMN sunday_close_time;

ALTER TABLE parking_operations
    ADD CONSTRAINT ck_parking_operations_weekday_status
        CHECK (weekday_status IS NULL OR weekday_status IN ('OPEN', 'CLOSED', 'UNKNOWN')),
    ADD CONSTRAINT ck_parking_operations_weekend_status
        CHECK (weekend_status IS NULL OR weekend_status IN ('OPEN', 'CLOSED', 'UNKNOWN')),
    ADD CONSTRAINT ck_parking_operations_holiday_status
        CHECK (holiday_status IS NULL OR holiday_status IN ('OPEN', 'CLOSED', 'UNKNOWN'));
