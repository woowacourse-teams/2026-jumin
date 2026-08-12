/** 방문 날짜를 고르는 월 단위 캘린더 시트. 오늘 이전 날짜는 고를 수 없다. */

import { useState } from 'react';
import styled from '@emotion/styled';

import { colors, DialogSheet } from '../../components';
import { formatYearMonth, monthGrid, shiftMonth, todayInSeoul, yearMonthOf } from '../../domain';
import { useOverlay, useSearchSession } from '../../contexts';
import { closeOverlay } from '../../router';

const MonthBar = styled.div`
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  margin-bottom: 12px;
`;

const MonthButton = styled.button`
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: ${colors.text};
  font-size: 22px;

  &:disabled {
    color: #c4ccd8;
  }
`;

const MonthLabel = styled.strong`
  font-size: 16px;
  font-weight: 800;
  text-align: center;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
`;

const WeekdayCell = styled.span<{ weekend: boolean }>`
  padding: 6px 0;
  color: ${({ weekend }) => (weekend ? colors.muted : colors.text)};
  font-size: 12px;
  font-weight: 700;
  text-align: center;
`;

const DayButton = styled.button<{ selected: boolean; today: boolean }>`
  display: grid;
  min-height: 44px;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: ${({ selected }) => (selected ? colors.primary : 'transparent')};
  color: ${({ selected, today }) => (selected ? '#fff' : today ? colors.primary : colors.text)};
  font-size: 15px;
  font-weight: ${({ selected, today }) => (selected || today ? 800 : 600)};

  &:disabled {
    color: #cfd5e0;
    font-weight: 600;
  }
`;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const CalendarSheet = () => {
  const { session, setSession } = useSearchSession();
  const { closeDatePicker } = useOverlay();
  const draft = session.visitDraft!;
  const today = todayInSeoul();
  const [month, setMonth] = useState(() => yearMonthOf(draft.visitDate));

  const select = (date: string) => {
    setSession((value) =>
      value.visitDraft ? { ...value, visitDraft: { ...value.visitDraft, visitDate: date } } : value,
    );
    closeDatePicker();
  };

  return (
    <DialogSheet title="방문 날짜" onClose={closeOverlay}>
      <MonthBar>
        <MonthButton
          type="button"
          aria-label="이전 달"
          disabled={month <= yearMonthOf(today)}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ‹
        </MonthButton>
        <MonthLabel>{formatYearMonth(month)}</MonthLabel>
        <MonthButton type="button" aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}>
          ›
        </MonthButton>
      </MonthBar>
      <Grid role="grid">
        {WEEKDAYS.map((label, index) => (
          <WeekdayCell key={label} weekend={index === 0 || index === 6}>
            {label}
          </WeekdayCell>
        ))}
        {monthGrid(month).map((date, index) =>
          date ? (
            <DayButton
              key={date}
              type="button"
              selected={date === draft.visitDate}
              today={date === today}
              disabled={date < today}
              aria-current={date === draft.visitDate ? 'date' : undefined}
              onClick={() => select(date)}
            >
              {Number(date.slice(8))}
            </DayButton>
          ) : (
            <span key={`blank-${index}`} />
          ),
        )}
      </Grid>
    </DialogSheet>
  );
};
