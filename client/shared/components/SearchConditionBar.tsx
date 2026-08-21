import { css } from '@emotion/css';
import backIcon from '../../assets/icons/backIcon.svg';
import { formatIsoTime } from '../utils/formatTime';
import { useNavigate } from 'react-router';

interface Props {
  destinationName: string;
  entryAt?: string;
  exitAt?: string;
}

export const SearchConditionBar = ({ destinationName, entryAt, exitAt }: Props) => {
  const navigate = useNavigate(); // 뒤로가기 기능을 위한 navigate

  return (
    <header className={headerStyle} aria-label="검색 조건">
      <button className={backButtonStyle} type="button" aria-label="이전 화면으로 이동" onClick={() => navigate(-1)}>
        <img className={backIconStyle} src={backIcon} alt="" draggable={false} />
      </button>

      <div className={conditionStyle}>
        <h1 className={destinationStyle}>{destinationName}</h1>

        {entryAt && exitAt && (
          <p className={timeRangeStyle}>
            <time dateTime={entryAt}>{formatIsoTime(entryAt)}</time>
            <span aria-hidden="true"> – </span>
            <time dateTime={exitAt}>{formatIsoTime(exitAt)}</time>
          </p>
        )}
      </div>
    </header>
  );
};

const headerStyle = css`
  position: absolute;
  top: 16px;
  right: 16px;
  left: 16px;
  z-index: 10;

  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;

  min-height: 52px;
  padding: 20px 22px;

  background: #ffffff;
  border-radius: 24px;
  box-shadow: 0 8px 24px rgb(16 27 55 / 10%);
`;

const backButtonStyle = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 32px;
  height: 40px;
  padding: 0;

  background: transparent;
  border: 0;
  border-radius: 10px;
  cursor: pointer;

  &:hover {
    background: #f5f6fb;
  }

  &:focus-visible {
    outline: 2px solid #4356d8;
    outline-offset: 2px;
  }
`;

const backIconStyle = css`
  width: 8px;
  height: 16px;

  pointer-events: none;
  user-select: none;
`;

const conditionStyle = css`
  min-width: 0;
`;

const destinationStyle = css`
  margin: 0;
  overflow: hidden;

  color: #101b37;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.3;
  letter-spacing: -0.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const timeRangeStyle = css`
  margin: 2px 0 0;

  color: #697386;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.4;
`;
