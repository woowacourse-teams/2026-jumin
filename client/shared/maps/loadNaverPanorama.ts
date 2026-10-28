let naverPanoramaPromise: Promise<void> | null = null;

export const loadNaverPanorama = (): Promise<void> => {
  if (typeof naver.maps.Panorama !== 'undefined') return Promise.resolve();

  if (naverPanoramaPromise) return naverPanoramaPromise;

  naverPanoramaPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');

    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps-panorama.js`;
    script.onload = () => resolve();

    script.onerror = () => {
      script.remove();

      naverPanoramaPromise = null;
      reject(new Error('네이버 지도 SDK를 불러오지 못했습니다.'));
    };
    document.head.appendChild(script);
  });
  return naverPanoramaPromise;
};
