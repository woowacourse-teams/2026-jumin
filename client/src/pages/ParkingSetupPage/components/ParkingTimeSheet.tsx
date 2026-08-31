import { useState } from 'react';

import { css } from '@emotion/css';

import { ParkingPeriod } from '../model/time';
import { formatMonthDay } from '../utils/timeFormat';
import { TimePickerField } from './TimePickerField';

import { addDays, addMinutes, format, set, set as setDate } from 'date-fns';

import { validatePeriod } from '../utils/validate';
import { Calendar } from './Calendar';
import { useModal } from '../../../../shared/hooks/useModal';
import { Modal } from '../../../../shared/components/Modal/Modal';

interface Props {
  period: ParkingPeriod;
  onEntryAtChange: (entryAt: Date) => void;
  onExitAtChange: (exitAt: Date) => void;
  onSubmit: () => void;
}

// 입출차 중 선택된 필드 인터페이스
type ActiveTimeField = 'entry' | 'exit' | null;

export const ParkingTimeSheet = ({ period, onEntryAtChange, onExitAtChange, onSubmit }: Props) => {
  const [activeField, setActiveField] = useState<ActiveTimeField>(null);

  const modal = useModal();

  // 입차 영역 클릭
  const handleEntryClick = () => {
    setActiveField((previousField) => (previousField === 'entry' ? null : 'entry'));
  };

  // 출차 영역 클릭
  const handleExitClick = () => {
    // 출차 시간은 null일 수 있으므로, 최초 클릭 시 (입차시간 + 30분)으로 초기화
    onExitAtChange(period.exitAt ?? addMinutes(period.entryAt, 30));

    setActiveField((previousField) => (previousField === 'exit' ? null : 'exit'));
  };

  // 출차의 경우 보정을 해야 하기 때문에, 핸들러를 묶는 핸들러 구성
  const handleExitTimeChange = (selectedTime: Date) => {
    // 출차 휠에서 선택한 시·분을 입차 날짜에 적용
    const exitAt = setDate(period.entryAt, {
      hours: selectedTime.getHours(),
      minutes: selectedTime.getMinutes(),
      seconds: 0,
      milliseconds: 0,
    });

    // 선택한 출차 시각이 입차보다 이르면 다음 날로 보정
    const normalizedExitAt = exitAt < period.entryAt ? addDays(exitAt, 1) : exitAt;

    onExitAtChange(normalizedExitAt);
  };

  // 날짜 선택 핸들러
  const handleEntryDateChange = (selectedDate: Date) => {
    const entryAt = set(selectedDate, {
      hours: period.entryAt.getHours(),
      minutes: period.entryAt.getMinutes(),
      seconds: 0,
      milliseconds: 0,
    });

    onEntryAtChange(entryAt);

    if (period.exitAt !== null) {
      const exitAt = set(selectedDate, {
        hours: period.exitAt.getHours(),
        minutes: period.exitAt.getMinutes(),
        seconds: 0,
        milliseconds: 0,
      });

      const normalizedExitAt = exitAt < entryAt ? addDays(exitAt, 1) : exitAt;
      onExitAtChange(normalizedExitAt);
    }
  };

  // 30분, 1시간, 2시간 추가 메서드
  const handleAddThirtyMinutes = () => {
    onExitAtChange(period.exitAt ? addMinutes(period.exitAt, 30) : addMinutes(period.entryAt, 30));

    setActiveField(null);
  };
  const handleAddOneHour = () => {
    onExitAtChange(period.exitAt ? addMinutes(period.exitAt, 60) : addMinutes(period.entryAt, 60));

    setActiveField(null);
  };
  const handleAddTwoHours = () => {
    onExitAtChange(
      period.exitAt ? addMinutes(period.exitAt, 120) : addMinutes(period.entryAt, 120),
    );

    setActiveField(null);
  };

  const isValidPeriod = validatePeriod(period);

  return (
    <div className={sheetContentStyle}>
      <header className={headerStyle}>
        <h1 className={titleStyle}>언제 주차하세요?</h1>

        <button
          type="button"
          className={calendarButtonStyle}
          aria-label="입차 날짜 선택"
          onClick={modal.open}
        >
          <CalendarIcon />
          <time className={dateStyle} dateTime={format(period.entryAt, 'yyyy-MM-dd')}>
            {formatMonthDay(period.entryAt)}
          </time>
        </button>
      </header>

      <div className={timeFieldsStyle}>
        <TimePickerField
          label="입차"
          date={period.entryAt}
          isActive={activeField === 'entry'}
          onToggle={handleEntryClick}
          onChange={onEntryAtChange}
        />

        <TimePickerField
          label="출차"
          date={period.exitAt}
          isActive={activeField === 'exit'}
          onToggle={handleExitClick}
          onChange={handleExitTimeChange}
        />
      </div>

      <div className={quickButtonsStyle}>
        <button
          className={quickButtonStyle}
          type="button"
          disabled={period.entryAt === null}
          onClick={handleAddThirtyMinutes}
        >
          +30분
        </button>

        <button
          className={quickButtonStyle}
          type="button"
          disabled={period.entryAt === null}
          onClick={handleAddOneHour}
        >
          +1시간
        </button>

        <button
          className={quickButtonStyle}
          type="button"
          disabled={period.entryAt === null}
          onClick={handleAddTwoHours}
        >
          +2시간
        </button>
      </div>

      <button
        className={recommendButtonStyle}
        type="button"
        disabled={!isValidPeriod}
        onClick={onSubmit}
      >
        추천 받기
      </button>

      {modal.isOpen && (
        <Modal isOpen={modal.isOpen} onClose={modal.close} label="주차할 날짜를 선택하세요">
          <Calendar selectedDate={period.entryAt} onSelect={handleEntryDateChange} />
        </Modal>
      )}
    </div>
  );
};

function CalendarIcon() {
  return (
    <svg className={calendarIconStyle} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4 9h16" />
      <rect x="4" y="5" width="16" height="16" rx="3" />
    </svg>
  );
}

const sheetContentStyle = css`
  display: flex;
  flex-direction: column;
  gap: 16px;

  height: 100%;
`;

const headerStyle = css`
  display: flex;
  align-items: center;
  justify-content: space-between;

  margin-bottom: 12px;
`;

const titleStyle = css`
  margin: 0;

  color: #101b37;
  font-family: inherit;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: -1.2px;
`;

const calendarButtonStyle = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  min-height: 44px;
  margin: 0;
  padding: 0 14px;

  color: #ffffff;
  font-family: inherit;

  background: #4356d8;
  border: 0;
  border-radius: 14px;
  cursor: pointer;

  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    color 150ms ease,
    background-color 150ms ease,
    box-shadow 150ms ease,
    transform 100ms ease;

  &:hover {
    background: #3b4dcc;
    box-shadow: 0 4px 12px rgb(67 86 216 / 20%);
  }

  &:active {
    background: #3548c8;
    transform: translateY(1px);
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 2px;
  }
`;

const dateStyle = css`
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
`;

const calendarIconStyle = css`
  width: 20px;
  height: 20px;

  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
`;

const timeFieldsStyle = css`
  display: flex;
  flex-direction: column;
  gap: 12px;

  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
`;

const quickButtonsStyle = css`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
`;

const quickButtonStyle = css`
  min-height: 52px;

  border: 0;
  border-radius: 14px;

  color: #435ed8;
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;

  background: #f5f6ff;
  cursor: pointer;

  &:active:not(:disabled) {
    background: #e9edff;
  }

  &:disabled {
    color: #a8afc9;
    cursor: not-allowed;
  }
`;

const recommendButtonStyle = css`
  width: 100%;
  min-height: 58px;
  margin-top: 10px;

  border: 0;
  border-radius: 16px;

  color: #fff;
  font-family: inherit;
  font-size: 18px;
  font-weight: 700;

  background: #4356d8;
  cursor: pointer;

  &:active {
    background: #3548c8;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 3px;
  }

  &:disabled {
    color: #929bb3;
    background: #dce0ec;
    cursor: not-allowed;
  }
`;
