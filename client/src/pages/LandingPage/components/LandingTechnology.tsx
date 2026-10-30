import { css, cx } from '@emotion/css';

import parkingMarker from '../../../../assets/icons/markers/homeParkingMarker.svg';
import dotParkingMarker from '../../../../assets/icons/markers/dotParkingMarker.svg';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';
import { LandingCacheDemo } from './LandingCacheDemo';

export const LandingTechnology = () => (
  <section
    id="landing-technology"
    className={styles.section}
    aria-labelledby="landing-technology-title"
  >
    <div className={styles.content}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>03 / 기술 이야기</p>
        <h2 id="landing-technology-title">
          주차의 고민을 줄이는,
          <br />
          보이지 않는 기술.
        </h2>
        <p className={styles.introduction}>
          걸어갈 거리부터 머무를 시간까지.
          <br />
          주차장을 고르는 데 필요한 정보를 계산하고, 탐색이 이어지도록 만듭니다.
        </p>
      </header>

      <article className={styles.article} aria-labelledby="landing-technology-walking">
        <div className={styles.copy}>
          <p className={styles.number}>01 / WALKING DISTANCE</p>
          <h3 id="landing-technology-walking">
            걸어갈 길을 따라,
            <br />
            도보거리를 계산합니다.
          </h3>
          <p className={styles.description}>
            지도에서 가까워 보여도, 걸어서 돌아가야 할 수 있어요. OSM 보행망과 pgRouting으로 연결
            가능한 경로를 찾고, 반복되는 주차장 주변 연결점은 미리 계산해 둡니다.
          </p>
          <p className={styles.result}>목적지까지의 예상 도보거리로 주차장을 비교할 수 있어요.</p>
        </div>
        <figure className={styles.visual}>
          <div className={styles.visualHeading}>
            <span>주차장에서 목적지까지</span>
            <span className={styles.visualTag}>보행망 기반</span>
          </div>
          <svg className={styles.route} viewBox="0 0 440 220" fill="none" aria-hidden="true">
            <path
              d="M22 58H418M22 110H418M22 162H418M76 20V200M180 20V200M284 20V200M388 20V200"
              stroke="currentColor"
              strokeOpacity="0.12"
              strokeWidth="10"
            />
            <path
              d="M76 162L388 58"
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeDasharray="5 6"
            />
            <path
              d="M76 162V110H180V58H388"
              stroke={color.background.brand}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="180" cy="110" r="5" fill={color.background.brand} />
            <circle cx="180" cy="58" r="5" fill={color.background.brand} />
            <rect x="57" y="143" width="38" height="38" rx="12" fill={color.background.default} />
            <text
              x="76"
              y="169"
              textAnchor="middle"
              fill={color.text.brand}
              fontSize="21"
              fontWeight="800"
            >
              P
            </text>
            <circle cx="388" cy="58" r="16" fill={color.background.brand} />
            <circle cx="388" cy="58" r="6" fill={color.background.default} />
            <text x="76" y="204" textAnchor="middle" fill="currentColor" fontSize="13">
              주차장
            </text>
            <text x="388" y="96" textAnchor="middle" fill="currentColor" fontSize="13">
              목적지
            </text>
          </svg>
          <figcaption className={styles.legend}>
            <span>
              <i className={styles.dashedLine} />
              직선거리
            </span>
            <span>
              <i className={styles.blueLine} />
              보행망을 따라 계산한 예상 경로
            </span>
          </figcaption>
        </figure>
      </article>

      <article className={styles.article} aria-labelledby="landing-technology-fee">
        <div className={styles.copy}>
          <p className={styles.number}>02 / ESTIMATED FEE</p>
          <h3 id="landing-technology-fee">
            머무를 시간을,
            <br />
            예상 요금으로 바꿉니다.
          </h3>
          <p className={styles.description}>
            시간당 요금만으로는 실제 지출을 비교하기 어려워요. 무료시간을 제외한 이용시간에
            기본요금과 추가요금 단위를 계산하고, 일 최대요금을 반영합니다.
          </p>
          <p className={styles.result}>
            기본요금과 추가요금을 직접 계산하지 않고 예상 요금을 비교할 수 있어요.
          </p>
        </div>
        <figure className={styles.visual}>
          <div className={styles.visualHeading}>
            <span>내 이용시간에 맞춘 계산</span>
            <span className={styles.visualTag}>요금 규칙 반영</span>
          </div>
          <div className={styles.feeCalculation}>
            <div className={styles.duration}>
              <span>입차</span>
              <div className={styles.durationLine}>
                <span>이용시간</span>
              </div>
              <span>출차</span>
            </div>
            <div className={styles.feeParts}>
              <div>
                <span>무료시간</span>
                <strong>제외</strong>
              </div>
              <div>
                <span>기본요금</span>
                <strong>적용</strong>
              </div>
              <div>
                <span>추가요금</span>
                <strong>단위 계산</strong>
              </div>
            </div>
            <div className={styles.feeTotal}>
              <span>일 최대요금까지 반영한</span>
              <strong>예상 요금</strong>
            </div>
          </div>
          <figcaption className={styles.caption}>
            주차장별 요금 규칙을 같은 이용시간으로 비교해요.
          </figcaption>
        </figure>
      </article>

      <article className={styles.article} aria-labelledby="landing-technology-map">
        <div className={styles.copy}>
          <p className={styles.number}>03 / CONTINUOUS EXPLORATION</p>
          <h3 id="landing-technology-map">
            지도를 움직여도,
            <br />
            탐색은 이어지게.
          </h3>
          <p className={styles.description}>
            지도를 옮길 때마다 주차장이 사라지면 위치를 놓치기 쉬워요. 이동이 멈춘 뒤 보이는 범위를
            조회하고, 새 결과를 받는 동안 이전 결과를 유지합니다.
          </p>
          <p className={styles.result}>
            확대 수준에 맞춰 주차장 마커를 조절하고, 다른 후보도 점으로 표시해요.
          </p>
        </div>
        <figure className={styles.visual}>
          <div className={styles.visualHeading}>
            <span>새로운 범위를 불러오는 동안에도</span>
            <span className={styles.visualTag}>이전 결과 유지</span>
          </div>
          <div className={styles.map} aria-hidden="true">
            <span className={styles.mapArea}>지도로 주변 탐색</span>
            <img
              className={styles.mapMarker}
              src={parkingMarker}
              alt=""
              width={25}
              height={25}
              style={{ left: '22%', top: '48%' }}
            />
            <img
              className={styles.mapMarker}
              src={parkingMarker}
              alt=""
              width={25}
              height={25}
              style={{ left: '58%', top: '28%' }}
            />
            <img
              className={styles.mapMarker}
              src={parkingMarker}
              alt=""
              width={25}
              height={25}
              style={{ left: '72%', top: '64%' }}
            />
            <img
              className={styles.mapMarker}
              src={dotParkingMarker}
              alt=""
              width={40}
              height={40}
              style={{ left: '38%', top: '23%' }}
            />
            <img
              className={styles.mapMarker}
              src={dotParkingMarker}
              alt=""
              width={40}
              height={40}
              style={{ left: '44%', top: '73%' }}
            />
            <img
              className={styles.mapMarker}
              src={dotParkingMarker}
              alt=""
              width={40}
              height={40}
              style={{ left: '83%', top: '36%' }}
            />
            <span className={styles.mapStatus}>새 결과 요청 중 · 기존 후보 표시</span>
          </div>
          <figcaption className={styles.caption}>
            강조 마커와 점 마커 모두 주차장 후보예요.
          </figcaption>
        </figure>
      </article>
      <article
        className={cx(styles.article, styles.cacheArticle)}
        aria-labelledby="landing-technology-cache"
      >
        <div className={styles.copy}>
          <p className={styles.number}>04 / GRID CACHE</p>
          <h3 id="landing-technology-cache">
            다시 찾은 지역은,
            <br />
            저장해 둔 데이터로.
          </h3>
          <p className={styles.description}>
            지도를 조금 움직일 때마다 겹치는 지역까지 다시 조회할 필요가 있을까요? 지도를 고정된
            정사각형 칸으로 나누고, 칸 단위로 데이터를 저장하는 캐시의 원리를 직접 확인해 보세요.
          </p>
          <p className={styles.result}>
            겹치는 칸은 캐시에서 재사용하고, 처음 보는 칸만 DB에서 가져오는 과정을 보여줘요.
          </p>
          <div className={styles.demoNotice}>
            <span>교육용 시뮬레이션</span>
            <p>
              실제 서비스 UI가 아닌 교육용 데모입니다. 외부 라이브러리 추가나 서버 호출 없이
              브라우저 안에서만 동작하며, DB 조회도 메모리 안에서 재현합니다.
            </p>
            <p>
              실제 TTL 타이머나 자동 만료는 구현하지 않았습니다. ‘캐시 비우기’로 캐시가 빈 상황을
              재현하고, ‘처음 위치로’로 저장된 칸을 다시 방문해 보세요.
            </p>
          </div>
        </div>
        <LandingCacheDemo />
      </article>
    </div>
  </section>
);

const styles = {
  section: css`
    padding: 112px 48px 64px;
    scroll-margin-top: 20px;
    color: ${color.text.inverse};
    background: ${color.background.inverse};

    @media (max-width: 700px) {
      padding: 72px 24px 32px;
    }
  `,
  content: css`
    max-width: 1200px;
    margin: 0 auto;
  `,
  header: css`
    padding-bottom: 64px;

    h2 {
      margin: 20px 0 24px;
      font-size: clamp(34px, 4vw, 54px);
      font-weight: 800;
      line-height: 1.3;
      letter-spacing: -0.045em;
    }

    @media (max-width: 700px) {
      padding-bottom: 44px;
    }
  `,
  eyebrow: css`
    ${typography.label};
    padding-left: 12px;
    border-left: 3px solid ${color.border.brand};
    color: ${color.text.inverseSecondary};
    letter-spacing: 0.14em;
  `,
  introduction: css`
    ${typography.body};
    color: ${color.text.inverseSecondary};
    line-height: 1.8;
  `,
  article: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
    gap: 64px;
    padding: 56px 0;
    border-top: 1px solid rgb(255 255 255 / 18%);

    @media (max-width: 850px) {
      gap: 32px;
    }
    @media (max-width: 700px) {
      grid-template-columns: minmax(0, 1fr);
      padding: 40px 0;
    }
  `,
  copy: css`
    h3 {
      margin: 18px 0 20px;
      font-size: clamp(25px, 2.6vw, 34px);
      font-weight: 800;
      line-height: 1.4;
      letter-spacing: -0.035em;
    }
  `,
  cacheArticle: css`
    align-items: start;
    @media (max-width: 1000px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  demoNotice: css`
    margin-top: 32px;
    padding: 20px;
    border: 1px solid rgb(255 255 255 / 14%);
    border-radius: 12px;
    background: rgb(255 255 255 / 3%);
    span {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      background: rgb(255 255 255 / 8%);
      ${typography.caption};
      font-weight: 700;
    }
    p {
      margin-top: 12px;
      ${typography.bodySmall};
      color: ${color.text.inverseSecondary};
      line-height: 1.8;
    }
  `,
  number: css`
    ${typography.caption};
    color: ${color.text.inverseSecondary};
    font-weight: 700;
    letter-spacing: 0.1em;
  `,
  description: css`
    ${typography.body};
    color: ${color.text.inverseSecondary};
    line-height: 1.85;
  `,
  result: css`
    ${typography.bodySmallStrong};
    margin-top: 20px !important;
    padding-left: 14px;
    border-left: 2px solid ${color.border.brand};
    line-height: 1.75;
  `,
  visual: css`
    min-width: 0;
    margin: 0;
    padding: 24px;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 12%);
    border-radius: 16px;
    background: rgb(255 255 255 / 3%);

    @media (max-width: 400px) {
      padding: 20px 16px;
    }
  `,
  visualHeading: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    ${typography.caption};
    color: ${color.text.inverseSecondary};
  `,
  visualTag: css`
    padding: 4px 8px;
    border-radius: 4px;
    color: ${color.text.inverse};
    background: rgb(255 255 255 / 8%);
    white-space: nowrap;
  `,
  route: css`
    display: block;
    width: 100%;
    height: auto;
    margin: 16px 0;
  `,
  legend: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    ${typography.caption};
    color: ${color.text.inverseSecondary};

    span {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
  `,
  dashedLine: css`
    width: 20px;
    border-top: 1px dashed currentColor;
  `,
  blueLine: css`
    width: 20px;
    border-top: 3px solid ${color.border.brand};
  `,
  feeCalculation: css`
    padding: 28px 0 22px;
  `,
  duration: css`
    display: flex;
    align-items: center;
    gap: 12px;
    ${typography.caption};
    color: ${color.text.inverseSecondary};
  `,
  durationLine: css`
    flex: 1;
    border-top: 1px solid rgb(255 255 255 / 30%);
    text-align: center;

    span {
      position: relative;
      top: -10px;
      padding: 0 8px;
      color: ${color.text.inverse};
      background: ${color.background.inverse};
    }
  `,
  feeParts: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 20px 0;

    div {
      display: flex;
      flex-direction: column;
      gap: 9px;
      padding: 20px 8px;
      border: 1px solid rgb(255 255 255 / 16%);
      border-radius: 8px;
      text-align: center;
    }
    span {
      ${typography.caption};
      color: ${color.text.inverseSecondary};
    }
    strong {
      ${typography.bodySmallStrong};
    }
  `,
  feeTotal: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 17px 16px;
    border-radius: 8px;
    background: ${color.background.brand};

    span {
      ${typography.caption};
    }
    strong {
      ${typography.bodyStrong};
    }
  `,
  caption: css`
    ${typography.caption};
    color: ${color.text.inverseSecondary};
  `,
  map: css`
    position: relative;
    height: 224px;
    margin: 20px 0 16px;
    overflow: hidden;
    border-radius: 8px;
    background-color: rgb(255 255 255 / 3%);
    background-image:
      linear-gradient(rgb(255 255 255 / 6%) 7px, transparent 7px),
      linear-gradient(90deg, rgb(255 255 255 / 6%) 7px, transparent 7px);
    background-position: 20px 20px;
    background-size: 64px 64px;
  `,
  mapArea: css`
    position: absolute;
    top: 12px;
    left: 12px;
    ${typography.caption};
    color: ${color.text.inverseSecondary};
  `,
  mapMarker: css`
    position: absolute;
  `,
  mapStatus: css`
    position: absolute;
    right: 12px;
    bottom: 12px;
    left: 12px;
    padding: 10px 12px;
    border: 1px solid rgb(255 255 255 / 14%);
    border-radius: 6px;
    ${typography.caption};
    background: ${color.background.inverse};
    text-align: center;
  `,
};
