import { DayPicker } from '@daypicker/react';
import { ko } from '@daypicker/react/locale';

import '@daypicker/react/style.css';

interface Props {
  selectedDate: Date;
  onSelect: (date: Date) => void;
}

export const Calendar = ({ selectedDate, onSelect }: Props) => {
  // single: 날짜 하나
  return (
    <DayPicker
      mode="single"
      locale={ko}
      selected={selectedDate}
      onSelect={(date) => {
        if (date) {
          onSelect(date);
        }
      }}
      disabled={{ before: new Date() }}
    />
  );
};
