//buildDirectionsUrl이 지도별 URL을 제대로 만드는지 자동 확인하는 테스트

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDirectionsUrl } from './deepLink.ts';

const start = { latitude: 37.4979, longitude: 127.0276 };
const destination = {
  name: '역삼문화공원 제1호 공영주차장',
  location: { latitude: 37.499, longitude: 127.029 },
};

test('모든 지도 딥링크에 출발지와 목적지 좌표를 담는다', () => {
  const naver = new URL(buildDirectionsUrl({ provider: 'NAVER', start, destination, appName: 'jumin' }));
  const kakao = new URL(buildDirectionsUrl({ provider: 'KAKAO', start, destination, appName: 'jumin' }));
  const tmap = new URL(buildDirectionsUrl({ provider: 'TMAP', start, destination, appName: 'jumin' }));

  assert.equal(naver.searchParams.get('slat'), String(start.latitude));
  assert.equal(naver.searchParams.get('dlat'), String(destination.location.latitude));
  assert.equal(kakao.searchParams.get('sp'), `${start.latitude},${start.longitude}`);
  assert.equal(kakao.searchParams.get('ep'), `${destination.location.latitude},${destination.location.longitude}`);
  assert.equal(tmap.searchParams.get('rStX'), String(start.longitude));
  assert.equal(tmap.searchParams.get('rGoX'), String(destination.location.longitude));
});
