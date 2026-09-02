import { useNavigate } from 'react-router';
import { css } from '@emotion/css';

interface Props {
  parkingLotName: string;
}

export const ParkingLotHeader = ({ parkingLotName }: Props) => {
  const navigate = useNavigate();
  return (
    <header className={headerStyle}>
      <button
        className={backButtonStyle}
        type="button"
        aria-label="이전 화면으로 이동"
        onClick={() => navigate(-1)}
      >
        <BackIcon />
      </button>

      <h1 className={parkingNameStyle}>{parkingLotName}</h1>
    </header>
  );
};

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

const headerStyle = css`
  position: relative;

  pointer-events: auto;

  z-index: 2;

  display: flex;

  align-items: center;

  height: calc(88px + env(safe-area-inset-top, 0px));

  padding: calc(24px + env(safe-area-inset-top, 0px)) 18px 0;

  box-sizing: border-box;

  background: #fff;
`;

const backButtonStyle = css`
  display: grid;

  flex: 0 0 40px;

  place-items: center;

  width: 40px;

  height: 40px;

  padding: 0;

  color: #62708a;

  background: transparent;

  border: 0;

  border-radius: 12px;

  cursor: pointer;

  svg {
    width: 22px;

    height: 22px;

    stroke: currentColor;

    stroke-width: 2;

    stroke-linecap: round;

    stroke-linejoin: round;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 25%);
  }
`;

const parkingNameStyle = css`
  min-width: 0;

  margin: 0;

  overflow: hidden;

  color: #18233d;

  font-size: 16px;

  font-weight: 800;

  line-height: 1.4;

  letter-spacing: -0.3px;

  text-overflow: ellipsis;

  white-space: nowrap;
`;
