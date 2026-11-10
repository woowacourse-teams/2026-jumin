/** 비교용 Figma 링크. 토큰 값을 가져오거나 Figma를 수정하지 않는다. */
export const figmaDesign = (nodeId: string) => ({
  design: {
    type: 'figma',
    // 파일명 경로가 있어야 애드온이 쿼리가 있는 주소를 임베드 주소로 변환한다.
    url: `https://www.figma.com/design/gb2er689PABLoKutY6Bi9p/주차의-민족-UI?node-id=${nodeId.replace(':', '-')}`,
  },
});
