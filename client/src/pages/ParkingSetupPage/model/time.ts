export interface TimeValue {
  hour: number;
  minute: number;
}

export const DEFAULT_TIME: TimeValue = {
  hour: 0,
  minute: 0,
};

export const createRoundedCurrentTime = (now = new Date()): TimeValue => {
  const roundedDate = new Date(now);
  const minutesUntilNextSlot = 10 - (roundedDate.getMinutes() % 10);

  roundedDate.setMinutes(roundedDate.getMinutes() + minutesUntilNextSlot, 0, 0);

  return {
    hour: roundedDate.getHours(),
    minute: roundedDate.getMinutes(),
  };
};

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export const addMinutesToTime = (time: TimeValue, minutesToAdd: number): TimeValue => {
  const currentMinutes = time.hour * MINUTES_PER_HOUR + time.minute;
  const addedMinutes = (currentMinutes + minutesToAdd) % MINUTES_PER_DAY;

  return {
    hour: Math.floor(addedMinutes / MINUTES_PER_HOUR),
    minute: addedMinutes % MINUTES_PER_HOUR,
  };
};

export const addThirtyMinutes = (time: TimeValue) => addMinutesToTime(time, 30);
export const addOneHour = (time: TimeValue) => addMinutesToTime(time, 60);
export const addTwoHours = (time: TimeValue) => addMinutesToTime(time, 120);
