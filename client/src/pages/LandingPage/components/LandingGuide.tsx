import { css } from '@emotion/css';

import home from '../../../../assets/landing/home.png';
import destination from '../../../../assets/landing/destination.png';
import recommend from '../../../../assets/landing/recommend.png';
import detail from '../../../../assets/landing/detail.png';
import { color } from '../../../theme/color';
import { fontSize, fontWeight, lineHeight } from '../../../theme/font';
import { typography } from '../../../theme/typography';

const steps = [
  {
    label: '찾기',
    title: ['주변을 둘러보거나,', '목적지를 검색하세요.'],
    description: '지도에서 주변 주차장을 찾아보세요. 무료·기계식 제외·공영 필터로 고를 수 있어요.',
    image: home,
    alt: '목적지 검색창과 무료 주차장, 기계식 제외, 공영 주차장 필터가 있는 홈 화면',
  },
  {
    label: '목적지 정하기',
    title: ['도착할 위치에', '핀을 맞춰주세요.'],
    description:
      '방문할 장소를 검색한 뒤 지도를 움직여 목적지를 정하세요. 위치를 확인하고 다음을 누르세요.',
    image: destination,
    alt: '지도에서 목적지 핀의 위치를 조정하고 선택한 목적지를 확인하는 화면',
  },
  {
    label: '비교하기',
    title: ['거리와 요금을 보고,', '내게 맞는 주차장으로.'],
    description:
      '1시간 기준 예상 요금과 도보 거리를 확인하고, 거리순·가격순·균형순으로 비교하세요.',
    image: recommend,
    alt: '목적지 주변 주차장의 예상 요금과 도보 거리를 거리순, 가격순, 균형순으로 비교하는 추천 화면',
  },
  {
    label: '확인하고 출발하기',
    title: ['주차 정보를 확인하고,', '익숙한 앱으로 출발.'],
    description:
      '운영시간·로드뷰·좋아요를 확인하고 다른 정보는 제보하세요. 네이버 지도·카카오맵·티맵으로 길을 안내받으세요.',
    image: detail,
    alt: '예상 요금과 운영시간, 길찾기, 로드뷰, 좋아요, 정보 제보가 있는 주차장 상세 화면',
  },
] as const;

export const LandingGuide = () => (
  <section id="landing-guide" className={styles.guide} aria-labelledby="landing-guide-title">
    <div className={styles.content}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>02 / 이용 방법</p>
        <h2 id="landing-guide-title">
          검색부터 길찾기까지,
          <br />
          이렇게 이용하세요.
        </h2>
      </header>

      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li className={styles.step} key={step.label}>
            <div className={styles.copy}>
              <p className={styles.label}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {step.label}
              </p>
              <h3>
                {step.title[0]}
                <br />
                {step.title[1]}
              </h3>
              <p className={styles.description}>{step.description}</p>
            </div>
            <div className={styles.phone}>
              <img
                src={step.image}
                alt={step.alt}
                width={430}
                height={844}
                decoding="async"
                loading="lazy"
              />
            </div>
          </li>
        ))}
      </ol>

      <p className={styles.note}>현재 서비스 화면이며, 표시된 주차장 정보와 요금은 예시입니다.</p>
    </div>
  </section>
);

const styles = {
  guide: css`
    padding: 104px 48px 80px;
    scroll-margin-top: 24px;
    background: ${color.background.subtle};

    @media (max-width: 600px) {
      padding: 72px 24px 56px;
    }
  `,
  content: css`
    max-width: 1200px;
    margin: 0 auto;
  `,
  heading: css`
    margin-bottom: 56px;

    h2 {
      margin: 18px 0 0;
      ${typography.titlePage};
      font-size: clamp(2rem, 3.6vw, 3rem);
      line-height: ${lineHeight[140]};
      letter-spacing: -1.8px;
    }

    @media (max-width: 600px) {
      margin-bottom: 40px;
      h2 {
        letter-spacing: -1.2px;
      }
    }
  `,
  eyebrow: css`
    margin: 0;
    ${typography.caption};
    color: ${color.text.brand};
    font-weight: ${fontWeight[800]};
    letter-spacing: 1.8px;
  `,
  steps: css`
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 28px;
    margin: 0;
    padding: 0;
    list-style: none;

    @media (max-width: 1000px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 48px 32px;
    }

    @media (max-width: 600px) {
      grid-template-columns: 1fr;
      gap: 48px;
    }
  `,
  step: css`
    display: flex;
    min-width: 0;
    flex-direction: column;
    padding-top: 20px;
    border-top: 1px solid ${color.border.brand};
  `,
  copy: css`
    min-height: 230px;
    padding-bottom: 28px;

    h3 {
      margin: 20px 0 14px;
      ${typography.titleSection};
      color: ${color.text.primary};
      letter-spacing: -0.8px;
    }

    @media (max-width: 1000px) {
      min-height: 205px;
    }

    @media (max-width: 600px) {
      min-height: 0;
      padding-bottom: 28px;
    }
  `,
  label: css`
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    ${typography.label};
    color: ${color.text.brand};

    span {
      font-size: ${fontSize[30]};
      font-weight: ${fontWeight[800]};
      line-height: 1;
      letter-spacing: -1px;
      font-variant-numeric: tabular-nums;
    }
  `,
  description: css`
    margin: 0;
    ${typography.bodySmall};
    color: ${color.text.secondary};
    word-break: keep-all;
  `,
  phone: css`
    width: min(100%, 230px);
    margin: 0 auto;
    padding: 6px;
    border: 1px solid ${color.border.default};
    border-radius: 28px;
    background: ${color.background.default};
    box-shadow: 0 18px 36px -18px rgb(16 27 55 / 28%);

    img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 430 / 844;
      border-radius: 21px;
    }
  `,
  note: css`
    margin: 36px 0 0;
    ${typography.caption};
    color: ${color.text.secondary};
    text-align: center;
  `,
};
