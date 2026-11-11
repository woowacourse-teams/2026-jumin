import { chromium } from 'playwright';

const [endpoint, wrapperOrigin, appOrigin] = process.argv.slice(2);
if (!endpoint || !wrapperOrigin || !appOrigin) throw new Error('검증 설정을 확인해주세요.');
const browser = await chromium.connectOverCDP(endpoint, { timeout: 10_000 });
try {
  const pages = browser
    .contexts()
    .flatMap((context) => context.pages())
    .filter((page) => {
      try {
        return new URL(page.url()).origin === wrapperOrigin;
      } catch {
        return false;
      }
    });
  let result = {
    verification: 'unavailable',
    verificationReason: 'insufficient_evidence',
    analyticsOptOut: false,
    mapSdkAvailable: false,
    searchInputVisible: null,
    searchInputPresent: null,
    surveyDialogVisible: null,
  };
  if (pages.length === 1) {
    const frames = pages[0].frames().filter((frame) => {
      try {
        return (
          frame.parentFrame() === pages[0].mainFrame() && new URL(frame.url()).origin === appOrigin
        );
      } catch {
        return false;
      }
    });
    if (frames.length === 1) {
      const frame = frames[0];
      const pagePath = new URL(frame.url()).pathname;
      const inputVisible = await frame.getByRole('textbox', { name: '목적지 검색' }).isVisible();
      const inputPresent = (await frame.locator('input[aria-label="목적지 검색"]').count()) === 1;
      const surveyVisible = await frame
        .getByRole('dialog', { name: '서비스 이용 경험 설문' })
        .isVisible();
      const flags = await frame.evaluate(() => ({
        analyticsOptOut: localStorage.getItem('analytics_opt_out') === 'true',
        mapSdkAvailable: typeof window.naver?.maps?.Map === 'function',
      }));
      result = {
        ...result,
        ...flags,
        searchInputVisible: inputVisible,
        searchInputPresent: inputPresent,
        surveyDialogVisible: surveyVisible,
      };
      if (pagePath === '/search' && inputVisible) {
        result.verification = 'passed';
        result.verificationReason = 'search_screen_observed';
      } else if (pagePath === '/' && (inputVisible || (inputPresent && surveyVisible))) {
        result.verification = 'not_met';
        result.verificationReason = 'home_screen_observed';
      }
    }
  }
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
