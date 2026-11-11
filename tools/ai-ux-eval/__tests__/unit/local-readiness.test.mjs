import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForSafeHome } from '../../local-smoke.mjs';

const signal = new AbortController().signal;
const stats = {
  analyticsAttempts: 0,
  blockedRedirects: 0,
  blockedMethodOverrides: 0,
  viewportOk: 1,
  viewportFailed: 0,
};
const wrapper = 'http://wrapper.invalid';
const app = 'http://app.invalid';
const mainFrame = {};
function contextFor(mode) {
  if (mode === 'page') return { pages: () => [] };
  const frame = {
    parentFrame: () => mainFrame,
    url: () => app,
    evaluate: async () => {
      if (mode === 'read') throw Error('synthetic read failure');
      return { optOut: true, sdk: mode !== 'sdk' };
    },
    locator: () => ({ count: async () => 1 }),
    getByRole: (role) => ({
      isVisible: async () => (role === 'dialog' ? false : mode !== 'input'),
    }),
  };
  const page = {
    url: () => wrapper,
    mainFrame: () => mainFrame,
    frames: () => (mode === 'frame' ? [mainFrame] : [mainFrame, frame]),
  };
  return { pages: () => [page] };
}

test('페이지, 프레임, 상태 읽기 및 실제 SDK·입력란 미준비를 구분한다', async () => {
  for (const [mode, reason] of [
    ['page', 'app_page_unavailable'],
    ['frame', 'app_frame_unavailable'],
    ['read', 'frame_state_unavailable'],
    ['sdk', 'map_sdk_error'],
    ['input', 'search_input_unavailable'],
  ]) {
    const environment = {};
    await assert.rejects(
      waitForSafeHome(contextFor(mode), wrapper, app, stats, signal, 1, environment),
      { reason },
    );
    assert.equal(environment.appPageObserved, mode !== 'page');
    assert.equal(environment.appFrameObserved, !['page', 'frame'].includes(mode));
    assert.equal(environment.frameStateRead, ['sdk', 'input'].includes(mode));
    if (mode === 'sdk') assert.equal(environment.mapSdkAvailable, false);
    if (mode === 'input') assert.equal(environment.searchInputVisible, false);
    if (mode === 'input') assert.equal(environment.surveyDialogVisible, false);
  }
});
