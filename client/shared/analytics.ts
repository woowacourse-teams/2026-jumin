// GA 이벤트에 함께 전달할 파라미터 형태
type EventParameters = Record<string, string | number | boolean>;

// 기본 Window 타입에 없는 Google tag 속성을 선언한다.
type AnalyticsWindow = Window & {
  // Google tag가 로드되기 전에 실행된 명령을 임시로 저장하는 큐
  dataLayer?: unknown[];

  // GA 초기화와 이벤트 전송에 사용하는 함수
  gtag?: (...args: unknown[]) => void;
};

const analyticsWindow = window as AnalyticsWindow;

// Measurement ID가 없는 로컬 환경에서는 아무 작업도 하지 않는다.
// 애플리케이션이 시작될 때 한 번만 호출한다.
export const initAnalytics = (measurementId: string) => {
  if (!measurementId) return;

  // Google tag가 아직 로드되지 않았더라도 명령을 저장한다.
  const dataLayer = (analyticsWindow.dataLayer ??= []);

  // gtag 호출 내용을 dataLayer에 쌓는다.
  // Google tag가 로드되면 쌓여 있던 명령을 순서대로 처리한다.
  analyticsWindow.gtag = function () {
    // Google 공식 스니펫이 요구하는 Arguments 객체를 그대로 전달한다.
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };

  // GA 로드 시점과 사용할 Measurement ID를 등록한다.
  analyticsWindow.gtag('js', new Date());
  analyticsWindow.gtag('config', measurementId);

  // Google tag 스크립트를 비동기로 불러온다.
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;

  document.head.appendChild(script);
};

// GA가 초기화되지 않은 환경에서는 아무 작업도 하지 않는다.
export const trackEvent = (eventName: string, parameters?: EventParameters) => {
  analyticsWindow.gtag?.('event', eventName, parameters);
};
