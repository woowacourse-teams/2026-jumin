/**
 * position에 있는 마커가 지도 위에서 targetY 높이에 보이도록 지도 중심 좌표를 구한다.
 * targetY는 지도 상단을 0으로 하는 픽셀 값이며, 아래로 갈수록 커진다.
 * 홈과 추천 화면은 각자의 UI에 맞는 targetY를 정하고, 좌표 변환은 이 함수가 담당한다.
 * 이 함수는 중심 좌표만 반환하며, 실제 지도 이동은 호출한 화면에서 panTo로 실행한다.
 */
export const getMapCenterForMarkerY = (
  map: naver.maps.Map,
  position: naver.maps.LatLng,
  targetY: number,
) => {
  // 위·경도로는 화면에서 몇 픽셀 이동할지 계산하기 어려워 지도 내부의 픽셀 좌표로 바꾼다.
  const projection = map.getProjection();
  const positionOffset = projection.fromCoordToOffset(position);

  // 지도 중심을 아래로 옮기면 마커는 화면에서 위로 이동한다.
  // 따라서 현재 지도 중앙(height / 2)에 마커의 현재 Y와 목표 Y의 차이를 더한다.
  // 예: 높이 800, 마커 Y 350, 목표 Y 236이면 새 중심의 픽셀 Y는 400 + 350 - 236 = 514다.
  const centerOffset = new naver.maps.Point(
    // 새 중심의 X를 마커의 X로 맞춰 마커가 가로 방향으로는 지도 중앙에 오게 한다.
    positionOffset.x,
    map.getSize().height / 2 + positionOffset.y - targetY,
  );

  // panTo는 픽셀 좌표가 아닌 지도 좌표를 받으므로 계산한 중심을 다시 변환한다.
  return projection.fromOffsetToCoord(centerOffset);
};
