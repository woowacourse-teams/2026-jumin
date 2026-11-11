import { chromium } from 'playwright';
import { classifyObservation } from './verifier-logic.mjs';

// 모델과 분리된 프로세스가 같은 CDP 세션에서 화면 및 저장소 증거를 확인한다.
const [endpoint, origin, scenario] = process.argv.slice(2);
if (!endpoint || !origin || !scenario) throw new Error('검증에 필요한 정보가 없습니다.');

const browser = await chromium.connectOverCDP(endpoint, { timeout: 10_000 });
try {
  const pages = browser
    .contexts()
    .flatMap((context) => context.pages())
    .filter((page) => {
      try {
        return new URL(page.url()).origin === origin;
      } catch {
        return false;
      }
    });
  let observation = null;
  if (pages.length === 1) {
    const [page] = pages;
    const destination = await page.evaluate(() => sessionStorage.getItem('destination'));
    const status = page.getByRole('status');
    const statusVisible = await status.isVisible();
    observation = {
      path: new URL(page.url()).pathname,
      destinationKnown: true,
      destination,
      searchVisible: await page.locator('#search-view').isVisible(),
      missingVisible: await page.locator('#missing-view').isVisible(),
      resultsVisible: await page.locator('#results-view').isVisible(),
      destinationVisible: await page.getByText('목적지: 가상역', { exact: true }).isVisible(),
      listVisible: await page.getByRole('heading', { name: '다온 주차장' }).isVisible(),
      statusVisible,
      statusText: statusVisible ? await status.innerText() : null,
    };
  }
  console.log(JSON.stringify(classifyObservation(scenario, observation)));
} finally {
  await browser.close();
}
