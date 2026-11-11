import { chromium } from 'playwright';

// 실행기·MCP와 다른 프로세스에서 CDP로 같은 탭을 관찰한다.
const [endpoint, fixtureUrl] = process.argv.slice(2);
if (!endpoint || !fixtureUrl) throw new Error('검증에 필요한 CDP 주소와 화면 주소가 없습니다.');

const browser = await chromium.connectOverCDP(endpoint, { timeout: 10_000 });
try {
  const pages = browser
    .contexts()
    .flatMap((context) => context.pages())
    .filter((page) => page.url() === fixtureUrl);
  if (pages.length !== 1)
    throw new Error(`검증 대상 탭을 하나로 특정할 수 없습니다: ${pages.length}`);

  const status = await pages[0].getByRole('status').innerText({ timeout: 5_000 });
  console.log(JSON.stringify({ complete: status === '선택 완료: 다온 주차장' }));
} finally {
  await browser.close();
}
