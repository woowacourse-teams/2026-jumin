import { useState } from 'react';

import { css } from '@emotion/css';
import { Navigate, useLocation, useNavigate } from 'react-router';

import { searchParkingLots } from '../../../api/parkingLots';
import BottomSheet from '../../../shared/components/BottomSheet';
import { SearchConditionBar } from '../../../shared/components/SearchConditionBar';
import { isSearchDestination } from '../../../shared/types/navigation';
import { TimePickerField } from './components/TimePickerField';
import { createSearchPeriod } from './model/searchCondition';
import {
  addOneHour,
  addThirtyMinutes,
  addTwoHours,
  createRoundedCurrentTime,
  DEFAULT_TIME,
  type TimeValue,
} from './model/time';

type ActiveTimeField = 'entry' | 'exit' | null;

const formatMonthDay = (date: Date) => {
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return `${month}월 ${day}일`;
};

interface NavigationState {
  destination?: unknown;
}

export const ParkingTimePage = () => {
  const navigate = useNavigate();

  const [activeField, setActiveField] = useState<ActiveTimeField>(null);

  const [entryTime, setEntryTime] = useState<TimeValue | null>(createRoundedCurrentTime());
  const [exitTime, setExitTime] = useState<TimeValue | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 목적지 데이터 가져오기
  const { state } = useLocation();
  const destinationCandidate = (state as NavigationState | null)?.destination;
  if (!isSearchDestination(destinationCandidate)) return <Navigate to="/search" replace />;
  const destination = destinationCandidate;

  const handleEntryClick = () => {
    setEntryTime((previousTime) => previousTime ?? createRoundedCurrentTime());

    setActiveField((previousField) => (previousField === 'entry' ? null : 'entry'));
  };

  const handleExitClick = () => {
    setExitTime((previousTime) => previousTime ?? { ...DEFAULT_TIME });

    setActiveField((previousField) => (previousField === 'exit' ? null : 'exit'));
  };

  const handleAddThirtyMinutes = () => {
    if (entryTime === null) return;

    if (exitTime === null) setExitTime(addThirtyMinutes(entryTime));
    else setExitTime(addThirtyMinutes(exitTime));
    setActiveField(null);
  };

  const handleAddOneHour = () => {
    if (entryTime === null) return;

    if (exitTime === null) setExitTime(addOneHour(entryTime));
    else setExitTime(addOneHour(exitTime));
    setActiveField(null);
  };

  const handleAddTwoHours = () => {
    if (entryTime === null) return;

    if (exitTime === null) setExitTime(addTwoHours(entryTime));
    else setExitTime(addTwoHours(exitTime));
    setActiveField(null);
  };

  const handleRecommend = async () => {
    if (entryTime === null || exitTime === null) {
      setErrorMessage('출차 시간을 선택해 주세요.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const { entryAt, exitAt } = createSearchPeriod(new Date(), entryTime, exitTime);

      const response = await searchParkingLots({
        destinationLatitude: destination.latitude,
        destinationLongitude: destination.longitude,
        entryAt,
        exitAt,
      });

      navigate('/parkingRecommendation', {
        state: {
          // 목적지 정보는 이전 페이지에서 넘어온 응답 데이터이고, 시간은 클라이언트에서 관리하는 항목
          // 조건이라는 객체로 묶어서 관리
          searchCondition: {
            destinationName: destination.name,
            destinationLatitude: destination.latitude,
            destinationLongitude: destination.longitude,
            entryAt,
            exitAt,
          },
          searchResult: response,
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '주차장을 조회하지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className={pageStyle}>
      <SearchConditionBar destinationName={destination.name} />

      <BottomSheet>
        <div className={sheetContentStyle}>
          <header className={headerStyle}>
            <h1 className={titleStyle}>언제 주차하세요?</h1>

            <time className={dateStyle} dateTime={new Date().toISOString().slice(0, 10)}>
              <CalendarIcon />
              {formatMonthDay(new Date())}
            </time>
          </header>

          <div className={timeFieldsStyle}>
            <TimePickerField
              label="입차"
              value={entryTime}
              isActive={activeField === 'entry'}
              onToggle={handleEntryClick}
              onChange={setEntryTime}
            />

            <TimePickerField
              label="출차"
              value={exitTime}
              isActive={activeField === 'exit'}
              onToggle={handleExitClick}
              onChange={setExitTime}
            />
          </div>

          <div className={quickButtonsStyle}>
            <button
              className={quickButtonStyle}
              type="button"
              disabled={entryTime === null}
              onClick={handleAddThirtyMinutes}
            >
              +30분
            </button>

            <button className={quickButtonStyle} type="button" disabled={entryTime === null} onClick={handleAddOneHour}>
              +1시간
            </button>

            <button
              className={quickButtonStyle}
              type="button"
              disabled={entryTime === null}
              onClick={handleAddTwoHours}
            >
              +2시간
            </button>
          </div>

          <button
            className={recommendButtonStyle}
            type="button"
            disabled={exitTime === null || isLoading}
            onClick={handleRecommend}
          >
            추천 받기
          </button>
        </div>
      </BottomSheet>

      {errorMessage && (
        <p
          role="alert"
          className={css`
            margin: 0;
            color: #e5484d;
            font-size: 14px;
          `}
        >
          {errorMessage}
        </p>
      )}
    </main>
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

const pageStyle = css`
  min-height: 100dvh;
`;

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

const dateStyle = css`
  display: inline-flex;
  align-items: center;
  gap: 8px;

  min-height: 44px;
  padding: 0 14px;

  color: #101b37;
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;

  background: #f5f6fb;
  border-radius: 14px;
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
`;
