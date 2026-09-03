import { useNavigate } from 'react-router';
import { css } from '@emotion/css';

import brandMark from '../../../assets/icons/brandMark_gray.svg';
import searchIcon from '../../../assets/icons/searchIcon.svg';
import { HomeQuickNav } from './components/HomeQuickNav';
import { InstallAppButton } from './components/InstallAppButton';

export const HomePage = () => {
  const navigate = useNavigate();

  return (
    <main className={pageStyle}>
      <header className={brandStyle}>
        <img className={logoStyle} src={brandMark} alt="" draggable={false} />
      </header>

      <div className={contentStyle}>
        <section className={heroStyle} aria-labelledby="home-title">
          <div className={introStyle}>
            <h1 className={titleStyle} id="home-title">
              어디로 가세요?
            </h1>
            <p className={descriptionStyle}>목적지만 검색하면, 주차장 추천을 해줘요.</p>
          </div>

          <button className={searchButtonStyle} type="button" onClick={() => navigate('/search')}>
            <img className={searchIconStyle} src={searchIcon} alt="" draggable={false} />
            <span>목적지 검색하기</span>
            <span className={chevronStyle} aria-hidden="true">
              ›
            </span>
          </button>

          <HomeQuickNav />
          <InstallAppButton />
        </section>
      </div>
    </main>
  );
};

const pageStyle = css`
  position: relative;

  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  overflow: hidden;

  color: #101b37;
  background: #fff;
`;

const contentStyle = css`
  width: 100%;
  padding: clamp(32px, 6.5vh, 52px) 24px 32px;
  flex: 1;
  overflow-y: auto;

  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const brandStyle = css`
  display: flex;
  align-items: center;
  gap: 12px;

  padding: calc(20px + env(safe-area-inset-top, 0px)) 20px 20px;
  min-height: 42px;

  color: white;
`;

const logoStyle = css`
  width: 26px;
  height: 28px;
  object-fit: contain;

  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
`;

const heroStyle = css`
  display: flex;
  flex-direction: column;
  gap: 10px;

  margin-top: clamp(24px, 8vh, 50px);
`;

const introStyle = css`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const titleStyle = css`
  margin: 0;

  color: #101b37;
  font-size: clamp(34px, 9vw, 42px);
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -1.8px;
`;

const descriptionStyle = css`
  margin: 0;

  color: #69758b;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.5;
  letter-spacing: -0.4px;
`;

const searchButtonStyle = css`
  display: grid;
  grid-template-columns: 26px 1fr 24px;
  align-items: center;
  gap: 14px;

  width: 100%;
  min-height: 60px;
  margin-top: 26px;
  padding: 0 18px;

  color: #c4c4c4;
  font-family: inherit;
  font-size: 18px;
  font-weight: 700;
  text-align: left;

  background: #ffffff;
  border: 1.5px solid #4356d8;
  border-radius: 16px;
  cursor: pointer;

  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 150ms ease,
    box-shadow 150ms ease,
    transform 100ms ease;

  &:hover {
    background: #f5f6ff;
    box-shadow: 0 6px 16px rgb(67 86 216 / 12%);
  }

  &:active {
    background: #eef0ff;
    transform: translateY(1px);
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 3px;
  }
`;

const searchIconStyle = css`
  width: 26px;
  height: 26px;

  pointer-events: none;
  user-select: none;
`;

const chevronStyle = css`
  justify-self: end;

  color: #8d97aa;
  font-size: 34px;
  font-weight: 300;
  line-height: 1;
`;
