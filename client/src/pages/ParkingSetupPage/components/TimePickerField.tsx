import { css } from '@emotion/css';

import { WheelColumn } from './WheelColumn';
import { set as setDate } from 'date-fns';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = [0, 10, 20, 30, 40, 50];

interface TimePickerFieldProps {
  label: string;
  date: Date | null;
  isActive: boolean;
  onToggle: () => void;
  onChange: (value: Date) => void;
}

export function TimePickerField({
  label,
  date,
  isActive,
  onToggle,
  onChange,
}: TimePickerFieldProps) {
  const hourText = date === null ? '--' : String(date.getHours()).padStart(2, '0');
  const minuteText = date === null ? '--' : String(date.getMinutes()).padStart(2, '0');

  return (
    <section className={timeFieldStyle(isActive)}>
      <button type="button" className={labelButtonStyle(isActive)} onClick={onToggle}>
        {label}
      </button>

      {isActive && date !== null ? (
        <div className={timeControlStyle}>
          <WheelColumn
            ariaLabel={`${label} 시간`}
            options={HOURS}
            value={date.getHours()}
            onChange={(hour) =>
              onChange(
                setDate(date, {
                  hours: hour,
                  seconds: 0,
                  milliseconds: 0,
                }),
              )
            }
          />

          <span className={colonStyle}>:</span>

          <WheelColumn
            ariaLabel={`${label} 분`}
            options={MINUTES}
            value={date.getMinutes()}
            onChange={(minute) =>
              onChange(
                setDate(date, {
                  minutes: minute,
                  seconds: 0,
                  milliseconds: 0,
                }),
              )
            }
          />
        </div>
      ) : (
        <button
          type="button"
          className={[timeControlStyle, timeDisplayButtonStyle].join(' ')}
          onClick={onToggle}
        >
          <span>{hourText}</span>
          <span className={colonStyle}>:</span>
          <span>{minuteText}</span>
        </button>
      )}
    </section>
  );
}

const timeFieldStyle = (isActive: boolean) => css`
  display: grid;
  grid-template-columns: minmax(40px, 1fr) 180px;
  align-items: center;
  justify-content: space-between;

  width: 100%;
  min-height: 96px;

  padding: 0 22px;
  box-sizing: border-box;

  border: 2px solid ${isActive ? '#7185f2' : 'transparent'};
  border-radius: 22px;

  background-color: ${isActive ? '#f0f2ff' : '#f5f6ff'};

  transition:
    border-color 150ms ease,
    background-color 150ms ease;
`;

const labelButtonStyle = (isActive: boolean) => css`
  align-self: stretch;

  border: 0;
  padding: 0;

  color: #${isActive ? '435ed8' : '70798f'};
  font-family: inherit;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;

  background: transparent;
  cursor: pointer;
`;

const timeControlStyle = css`
  display: grid;
  grid-template-columns: 64px 12px 64px;
  align-items: center;
  justify-content: center;

  width: 180px;

  color: #101b37;
  font-family: inherit;
  font-size: 34px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -1px;
  text-align: center;
  font-variant-numeric: tabular-nums;

  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
`;

const timeDisplayButtonStyle = css`
  border: 0;
  padding: 0;
  appearance: none;

  background: transparent;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 25%);
    outline-offset: 2px;
  }
`;

const colonStyle = css`
  display: flex;
  align-items: center;
  justify-content: center;

  width: 100%;

  color: #101b37;
  font: inherit;
`;
