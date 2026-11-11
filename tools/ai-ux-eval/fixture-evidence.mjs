// Only fixed, synthetic fixture labels are allowed into comparison reports.
const elements = [
  { label: '목적지 입력란', pattern: /textbox "목적지"[^\n]*/, selectors: ['#destination'] },
  {
    label: '주차장 검색 버튼',
    pattern: /button "주차장 검색"[^\n]*/,
    selectors: ['button:has-text("주차장 검색")'],
  },
  {
    label: '가람 주차장 선택 버튼',
    pattern: /button "가람 주차장 선택"[^\n]*/,
    selectors: ['button:has-text("가람 주차장 선택")'],
  },
  {
    label: '다온 주차장 선택 버튼',
    pattern: /button "다온 주차장 선택"[^\n]*/,
    selectors: ['button:has-text("다온 주차장 선택")'],
  },
  { label: '검색 화면으로 이동 링크', pattern: /link "검색 화면으로 이동"[^\n]*/, selectors: [] },
];

export function fixtureState(snapshot) {
  if (typeof snapshot !== 'string') return { screen: 'unavailable', observed: [] };
  const observed = [];
  if (/textbox "목적지"[^\n]*:\s*가상역(?:\s|$)/.test(snapshot))
    observed.push('목적지 입력란: 가상역');
  if (/목적지: 가상역/.test(snapshot)) observed.push('검색 목적지: 가상역');
  if (/선택 완료: 가람 주차장/.test(snapshot)) observed.push('가람 주차장 선택 표시');
  if (/선택 완료: 다온 주차장/.test(snapshot)) observed.push('다온 주차장 선택 표시');
  if (/아직 선택하지 않았습니다/.test(snapshot)) observed.push('미선택 표시');
  const screen = /button "주차장 검색"/.test(snapshot)
    ? 'search'
    : /button "(?:가람|다온) 주차장 선택"/.test(snapshot)
      ? 'results'
      : /검색 기록이 없습니다|입력한 목적지의 검색 결과가 없습니다/.test(snapshot)
        ? 'no_results'
        : 'unavailable';
  return { screen, observed };
}

export function fixtureAction(name, args, snapshot, turn) {
  const state = fixtureState(snapshot);
  let target = 'unavailable';
  for (const item of elements) {
    const line = snapshot?.match(item.pattern)?.[0];
    const ref = line?.match(/\[ref=([^\]]+)\]/)?.[1];
    if (line && (args.target === ref || item.selectors.includes(args.target))) {
      target = item.label;
      break;
    }
  }
  return {
    turn,
    tool: name,
    before: state,
    target,
    input:
      name === 'browser_type' ? (args.text === '가상역' ? '가상역' : 'other_or_unavailable') : null,
    outcome: 'unavailable',
    after: { screen: 'unavailable', observed: [] },
  };
}
