import { useState } from 'react';
import { css, cx } from '@emotion/css';
import ReactModal from 'react-modal';
import { BackIcon } from '../../ui/icons';

import guide1Image from '../../../../assets/guideImage/guide1.webp';
import guide2Image from '../../../../assets/guideImage/guide2.webp';
import guide3Image from '../../../../assets/guideImage/guide3.webp';
import { color } from '../../../../src/theme/color';
import { fontSize } from '../../../../src/theme/font';
import { typography } from '../../../../src/theme/typography';

interface Props {
  onClose: () => void;
}

const slides = [
  {
    image: guide1Image,
    imageDescription: '지도 위 목적지 검색창 예시',
    title: '어디에 주차할지 고민하지 마세요',
    description: '목적지를 검색하면 주변 주차장을 비교해 드려요.',
  },
  {
    image: guide2Image,
    imageDescription: '입차·출차 시간을 설정하는 화면 예시',
    title: '언제 들어가고 나오는지만 입력하세요',
    description: '입차·출차 시간을 기준으로 이용 가능한 주차장을 찾아요.',
  },
  {
    image: guide3Image,
    imageDescription: '지도와 카드에 추천 주차장이 표시된 화면 예시',
    title: '조건에 맞는 주차장을 확인하세요',
    description: '거리와 요금을 비교하고 원하는 주차장으로 길찾기를 시작하세요.',
  },
];

export const GuideModal = ({ onClose }: Props) => {
  const [step, setStep] = useState(0);
  const slide = slides[step]!;
  const isLast = step === slides.length - 1;

  return (
    <ReactModal
      isOpen
      onRequestClose={onClose}
      contentLabel="주차의민족 이용 가이드"
      overlayClassName={overlayStyle}
      className={modalStyle}
      shouldCloseOnOverlayClick
    >
      <div className={topStyle}>
        <button className={skipButtonStyle} type="button" onClick={onClose}>
          건너뛰기
        </button>
      </div>

      <div className={imageFrameStyle}>
        <img className={imageStyle} src={slide.image} alt={slide.imageDescription} />
      </div>

      <div className={copyStyle}>
        <h2 className={titleStyle}>{slide.title}</h2>
        <p className={descriptionStyle}>{slide.description}</p>
      </div>

      <div className={paginationStyle} role="status" aria-live="polite">
        <span className={screenReaderOnlyStyle}>
          총 {slides.length}단계 중 {step + 1}단계
        </span>
        {slides.map((_, index) => (
          <span
            key={index}
            className={cx(dotStyle, index === step && activeDotStyle)}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className={actionsStyle}>
        <button
          className={previousButtonStyle}
          type="button"
          aria-label="이전 단계"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          <BackIcon size={24} aria-hidden="true" />
        </button>
        <button
          className={nextButtonStyle}
          type="button"
          onClick={isLast ? onClose : () => setStep(step + 1)}
        >
          {isLast ? '주차장 찾아보기' : '다음'}
        </button>
      </div>
    </ReactModal>
  );
};

const overlayStyle = css`
  position: fixed;
  inset: 0;
  z-index: 2000;

  display: grid;
  place-items: center;
  padding: max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px));

  background: ${color.overlay.scrim};
`;

const modalStyle = css`
  width: min(100%, 360px);
  max-height: 100%;
  padding: 8px 18px 18px;
  overflow-y: auto;

  color: ${color.text.primary};
  background: ${color.background.default};
  border-radius: 24px;
  box-shadow: 0 24px 64px rgb(16 27 55 / 24%);
  outline: none;

  @media (max-width: 360px) {
    padding-right: 14px;
    padding-left: 14px;
  }
`;

const topStyle = css`
  display: flex;
  justify-content: flex-end;
`;

const skipButtonStyle = css`
  min-width: 64px;
  min-height: 44px;
  padding: 0 4px;

  ${typography.bodySmall};
  color: ${color.text.secondary};
  font-family: inherit;
  background: none;
  border: 0;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${color.focus.ring};
    outline-offset: 2px;
  }
`;

const imageFrameStyle = css`
  display: grid;
  width: 100%;
  min-height: 0;
  place-items: center;
`;

const imageStyle = css`
  display: block;
  max-width: 100%;
  max-height: min(44dvh, 393px);
  width: auto;
  height: auto;

  border-radius: 16px;
  object-fit: contain;
`;

const copyStyle = css`
  min-height: 88px;
  padding-top: 18px;
`;

const titleStyle = css`
  margin: 0;

  ${typography.titleCard};
  color: ${color.text.primary};
  font-size: clamp(${fontSize[16]}, 4.4vw, ${fontSize[18]});
  word-break: keep-all;
`;

const descriptionStyle = css`
  margin: 8px 0 0;

  ${typography.bodySmall};
  color: ${color.text.secondary};
  word-break: keep-all;
`;

const paginationStyle = css`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 28px;
`;

const screenReaderOnlyStyle = css`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

const dotStyle = css`
  width: 6px;
  height: 6px;
  background: ${color.background.muted};
  border-radius: 999px;
`;

const activeDotStyle = css`
  width: 18px;
  background: ${color.background.selected};
`;

const actionsStyle = css`
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 10px;
`;

const previousButtonStyle = css`
  display: grid;
  min-height: 52px;
  place-items: center;

  color: ${color.icon.default};
  background: ${color.background.default};
  border: 1px solid ${color.border.default};
  border-radius: 14px;
  cursor: pointer;

  &:disabled {
    color: ${color.text.disabled};
    border-color: ${color.border.default};
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid ${color.focus.ring};
    outline-offset: 2px;
  }
`;

const nextButtonStyle = css`
  min-height: 52px;
  padding: 0 12px;

  ${typography.label};
  color: ${color.text.inverse};
  font-family: inherit;
  background: ${color.background.brand};
  border: 0;
  border-radius: 14px;
  cursor: pointer;

  &:hover {
    background: ${color.background.brandHovered};
  }

  &:active {
    background: ${color.background.brandPressed};
  }

  &:focus-visible {
    outline: 2px solid ${color.focus.ring};
    outline-offset: 2px;
  }
`;
