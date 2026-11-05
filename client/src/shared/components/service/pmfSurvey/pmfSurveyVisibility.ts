const HIDDEN_UNTIL_KEY = 'pmfSurveyHiddenUntil';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1_000;

// shortcut: 같은 브라우저에서만 숨김 상태가 유지된다. 기기 간 동기화가 필요하면 서버에 저장한다.
export const shouldShowPmfSurvey = (now = Date.now()) => {
  try {
    const hiddenUntil = Number(localStorage.getItem(HIDDEN_UNTIL_KEY));
    return !Number.isFinite(hiddenUntil) || hiddenUntil <= now;
  } catch {
    return true;
  }
};

export const hidePmfSurveyForThreeDays = (now = Date.now()) => {
  try {
    localStorage.setItem(HIDDEN_UNTIL_KEY, String(now + THREE_DAYS_MS));
  } catch {
    // 저장소를 사용할 수 없어도 현재 모달은 닫을 수 있다.
  }
};
