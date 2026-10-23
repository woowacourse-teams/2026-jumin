import '@testing-library/jest-dom';
import { cleanup, configure } from '@testing-library/react';

import { server } from './msw/server';
import { resetParkingLikes } from '../mocks/handlers/parkingLikeHandlers';

configure({ asyncUtilTimeout: 4_000 });

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetParkingLikes();

  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterAll(() => {
  server.close();
});
