import { chromium } from 'playwright';
import { classifyParkingEvidence } from './local-parking-logic.mjs';
const [endpoint, wrapperOrigin, appOrigin, scenario = 'local-select-parking'] =
  process.argv.slice(2);
if (!['local-select-parking', 'local-one-hour-parking'].includes(scenario))
  throw Error('검증 설정 오류');
if (!endpoint || !wrapperOrigin || !appOrigin) throw Error('검증 설정 오류');
const browser = await chromium.connectOverCDP(endpoint, { timeout: 10000 });
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
  let facts = {};
  if (pages.length === 1) {
    const page = pages[0];
    const frames = page.frames().filter((frame) => {
      try {
        return (
          frame.parentFrame() === page.mainFrame() && new URL(frame.url()).origin === appOrigin
        );
      } catch {
        return false;
      }
    });
    if (frames.length === 1) {
      const frame = frames[0];
      facts = await frame.evaluate(() => {
        const path = location.pathname;
        const params = new URLSearchParams(location.search);
        const recommend = path === '/parkingRecommend';
        const unique = (key) => params.getAll(key).length === 1;
        const entry = params.get('entryAt'),
          exit = params.get('exitAt');
        const a = Date.parse(entry || ''),
          b = Date.parse(exit || '');
        const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
        const duration =
          unique('entryAt') &&
          unique('exitAt') &&
          timestamp.test(entry || '') &&
          timestamp.test(exit || '') &&
          Number.isFinite(a) &&
          Number.isFinite(b) &&
          b > a
            ? b - a === 7200000
              ? 'two_hours'
              : b - a === 3600000
                ? 'one_hour'
                : 'other'
            : 'unavailable';
        let searchSelection = null;
        let destinationMatch = null;
        let destinationNameMatch = null;
        let destinationAddressMatch = null;
        let destinationNameKind = 'unavailable';
        try {
          const recent = JSON.parse(localStorage.getItem('recentSearches') || 'null');
          const name = params.get('name');
          const lat = params.get('lat'),
            lng = params.get('lng');
          if (
            Array.isArray(recent) &&
            ['name', 'lat', 'lng'].every(unique) &&
            name &&
            lat &&
            lng &&
            Number.isFinite(Number(lat)) &&
            Number.isFinite(Number(lng))
          ) {
            const matches = recent.filter(
              (x) =>
                x &&
                x.name === name &&
                typeof x.latitude === 'number' &&
                typeof x.longitude === 'number' &&
                x.latitude === Number(lat) &&
                x.longitude === Number(lng),
            );
            searchSelection = matches.length > 1 ? null : matches.length === 1;
            if (matches.length === 1) {
              destinationNameMatch = name === '서울역';
              destinationNameKind = destinationNameMatch
                ? 'exact'
                : name.startsWith('서울역')
                  ? 'prefix'
                  : name.includes('서울역')
                    ? 'contains'
                    : 'different';
              const addresses = [matches[0].address, matches[0].roadAddress].filter(
                (address) => typeof address === 'string' && address.trim(),
              );
              if (addresses.length) {
                destinationAddressMatch = addresses.some(
                  (address) => /서울/.test(address) && /한강대로\s*405(?:\D|$)/.test(address),
                );
              }
              if (destinationNameMatch && destinationAddressMatch) destinationMatch = true;
            }
          }
        } catch {
          // 선택 이력을 읽지 못하면 목적지 근거는 미확인 상태로 유지한다.
        }
        const dialog = document.querySelector('[role="dialog"][aria-label="어떤 앱으로 갈까요?"]');
        const visible = Boolean(
          dialog &&
          dialog.getClientRects().length &&
          getComputedStyle(dialog).visibility !== 'hidden',
        );
        let selectedParking = null;
        let candidateComparison = null;
        if (recommend && visible) {
          const descriptions = [...dialog.querySelectorAll('p')]
            .map((x) => x.textContent?.trim() || '')
            .filter((x) => x.endsWith('까지 안내합니다.'));
          if (descriptions.length === 1) {
            const name = descriptions[0].slice(0, -'까지 안내합니다.'.length).trim();
            const detail = document.querySelectorAll('section[aria-label="주차장 상세정보"]');
            const cards = [
              ...document.querySelectorAll('section[aria-label="주차장 전체 목록"] article h3'),
            ];
            const titles =
              detail.length === 1
                ? [...document.querySelectorAll('header[aria-label="검색 조건"] h1')]
                : cards;
            const matches = titles.filter((x) => x.textContent?.trim() === name);
            if (name && matches.length === 1) selectedParking = true;
            // 범위는 이 시점의 전체 목록에 렌더링된 카드다. 실제 화면 값은 이 함수 밖으로 내보내지 않는다.
            const sections = document.querySelectorAll('section[aria-label="주차장 전체 목록"]');
            if (sections.length === 1) {
              const articles = [...sections[0].querySelectorAll('article')];
              const list = articles.map((article) => {
                const headings = article.querySelectorAll('h3');
                const label = headings.length === 1 ? headings[0].textContent.trim() : '';
                const fees = [...article.querySelectorAll('strong')]
                  .map((el) => el.textContent.trim())
                  .filter((text) => /^(?:[0-9,]+원|요금 정보 없음)$/.test(text));
                const distancePattern = /^(?:[0-9,]+m\([0-9,]+분\)|도보 정보 없음)$/;
                const distances = [...article.querySelectorAll('p')].flatMap((el) => {
                  const text = el.textContent.trim();
                  return distancePattern.test(text)
                    ? [text]
                    : [...el.querySelectorAll('span')]
                        .map((span) => span.textContent.trim())
                        .filter((value) => distancePattern.test(value));
                });
                const fee =
                  fees.length === 1 && /^[0-9,]+원$/.test(fees[0])
                    ? Number(fees[0].slice(0, -1).replaceAll(',', ''))
                    : null;
                const distance =
                  distances.length === 1 && /^[0-9,]+m\([0-9,]+분\)$/.test(distances[0])
                    ? Number(distances[0].split('m')[0].replaceAll(',', ''))
                    : null;
                return {
                  label,
                  fee: Number.isSafeInteger(fee) ? fee : null,
                  distance: Number.isSafeInteger(distance) ? distance : null,
                };
              });
              const uniqueNames =
                list.every((item) => item.label) &&
                new Set(list.map((item) => item.label)).size === list.length;
              const selected = list.filter((item) => item.label === name);
              const metrics = (key) => {
                const missing = list.filter((item) => item[key] === null).length;
                if (list.length < 2 || !uniqueNames || selected.length !== 1 || missing > 0)
                  return { result: 'unavailable', missing, minimumTies: null };
                const minimum = Math.min(...list.map((item) => item[key]));
                const minimumTies = list.filter((item) => item[key] === minimum).length;
                return {
                  result: selected[0][key] === minimum ? 'minimum' : 'not_minimum',
                  missing,
                  minimumTies,
                };
              };
              candidateComparison = {
                scope: 'rendered_full_list',
                count: list.length,
                selectedUnique: uniqueNames && selected.length === 1,
                fee: metrics('fee'),
                walking: metrics('distance'),
              };
            }
          }
        }
        return {
          knownEarlyScreen: ['/', '/search', '/parkingsetup'].includes(path),
          recommendScreen: recommend,
          duration,
          searchSelection,
          destinationMatch,
          destinationNameMatch,
          destinationAddressMatch,
          destinationNameKind,
          selectedParking,
          candidateComparison,
          directionsDialog: recommend ? visible : null,
        };
      });
    }
  }
  console.log(JSON.stringify(classifyParkingEvidence(facts, scenario)));
} finally {
  await browser.close();
}
