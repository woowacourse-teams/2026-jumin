import { TimeValue } from '../../src/pages/ParkingTimePage/model/time';

export const formatTimeValue = ({ hour, minute }: TimeValue) => {
  const formattedHour = String(hour).padStart(2, '0');
  const formattedMinute = String(minute).padStart(2, '0');

  return `${formattedHour}:${formattedMinute}`;
};

export const formatIsoTime = (isoDateTime: string) => {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(isoDateTime));
};
