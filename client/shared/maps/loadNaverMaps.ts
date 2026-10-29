// SDK 로딩 상태를 여러 호출이 공유하기 위한 변수
let naverMapsPromise: Promise<void> | null = null;

// 네이버 지도 SDK가 준비될 때까지 기다리는 함수
export const loadNaverMaps = (): Promise<void> => {
  // 전역 naver 객체가 존재하면 SDK가 이미 로드된 상태다.
  // 새 스크립트를 만들지 않고 즉시 완료된 Promise를 반환한다.
  if (typeof naver !== 'undefined') return Promise.resolve();

  // 다른 곳에서 이미 SDK를 로딩하고 있다면
  // 새 스크립트를 추가하지 않고 기존 Promise를 반환한다.
  if (naverMapsPromise) return naverMapsPromise;

  // 빌드할 때 Client ID가 전달되지 않았다면
  // 잘못된 SDK 요청을 보내지 않고 즉시 실패시킨다.
  if (!__NAVER_MAP_CLIENT_ID__) {
    return Promise.reject(new Error('네이버 지도 Client ID가 설정되지 않았습니다.'));
  }

  //SDK 로딩 결과를 기다릴 Promise를 생성한다.

  // 네이버 지도 SDK 주소에 발급받은 Client ID를 넣는다.
  // encodeURIComponent는 Client ID를 URL에 안전하게 포함시킨다.
  naverMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');

    // SDK를 받는 동안 나머지 HTML 렌더링을 막지 않는다.
    script.async = true;

    //네이버 지도 SDK 주소에 발급받은 Client ID를 넣는다.
    //encodeURIComponent는 Client ID를 URL에 안전하게 포함시킨다.
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(__NAVER_MAP_CLIENT_ID__)}`;

    script.onload = () => resolve();

    script.onerror = () => {
      // 실패한 <script> 요소를 문서에서 제거
      script.remove();

      // 다음 호출에서 다시 로딩을 시도할 수 있도록 초기화한다.
      naverMapsPromise = null;
      reject(new Error('네이버 지도 SDK를 불러오지 못했습니다.'));
    };
    // 생성한 <script>를 실제 HTML의 <head>에 추가한다.
    // 이 시점부터 브라우저가 네이버 지도 SDK 다운로드를 시작한다.
    document.head.appendChild(script);
  });
  return naverMapsPromise;
};
