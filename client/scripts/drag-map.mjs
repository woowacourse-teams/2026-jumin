import { chromium } from '@playwright/test';
import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

const baseUrl = 'http://localhost:3000/';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
});

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  serviceWorkers: 'block',
});

const page = await context.newPage();
const input = createInterface({
  input: process.stdin,
  output: process.stdout,
});

try {
  await page.goto(baseUrl);

  while (true) {
    const command = (await input.question('Enter: 경로 재생 / q: 종료 > ')).trim();
    if (command === 'q') break;
    if (command !== '') continue;

    await page.bringToFront();
    await sleep(2_000);

    await page.evaluate(() => {
      performance.clearMarks('drag:start');
      performance.clearMarks('drag:end');
      performance.clearMeasures('drag:measure');
      performance.mark('drag:start');
    });

    for (const direction of [-1, -1, -1, 1, 1, 1]) {
      const startX = direction === -1 ? 300 : 150;

      await page.mouse.move(startX, 450);
      await page.mouse.down();

      const startedAt = performance.now();

      for (let step = 1; step <= 30; step += 1) {
        await sleep(Math.max(0, startedAt + step * 30 - performance.now()));
        await page.mouse.move(startX + direction * step * 5, 450);
      }

      await sleep(100);
      await page.mouse.up();
      await sleep(1_500);
    }

    await sleep(2_000);
    await page.evaluate(() => {
      performance.mark('drag:end');
      performance.measure('drag:measure', 'drag:start', 'drag:end');
    });

    console.log('재생 완료. 녹화를 중지하세요.');
  }
} finally {
  input.close();
  await browser.close();
}
