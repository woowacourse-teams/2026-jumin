import { css } from '@emotion/css';

import type { TimeValue } from '../model/time';
import { WheelColumn } from './WheelColumn';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = [0, 10, 20, 30, 40, 50];

interface TimePickerFieldProps {
  label: string;
  value: TimeValue | null;
  isActive: boolean;
  onToggle: () => void;
  onChange: (value: TimeValue) => void;
}

export function TimePickerField({ label, value, isActive, onToggle, onChange }: TimePickerFieldProps) {
  const hourText = value === null ? '--' : String(value.hour).padStart(2, '0');
  const minuteText = value === null ? '--' : String(value.minute).padStart(2, '0');

  return (
    <section className={timeFieldStyle(isActive)}>
      <button type="button" className={labelButtonStyle(isActive)} onClick={onToggle}>
        {label}
      </button>

      {isActive && value !== null ? (
        <div className={timeControlStyle}>
          <WheelColumn
            ariaLabel={`${label} 시간`}
            options={HOURS}
            value={value.hour}
            onChange={(hour) => onChange({ ...value, hour })}
          />

          <span className={colonStyle}>:</span>

          <WheelColumn
            ariaLabel={`${label} 분`}
            options={MINUTES}
            value={value.minute}
            onChange={(minute) => onChange({ ...value, minute })}
          />
        </div>
      ) : (
        <button type="button" className={[timeControlStyle, timeDisplayButtonStyle].join(' ')} onClick={onToggle}>
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
