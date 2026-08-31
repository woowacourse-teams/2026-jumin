import { format } from 'date-fns';

export const formatMonthDay = (date: Date) => {
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return `${month}월 ${day}일`;
};

export const formatOffsetDateTime = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm:ss'+09:00'");
