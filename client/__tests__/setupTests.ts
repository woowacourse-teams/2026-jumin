import '@testing-library/jest-dom';
import { cleanup, configure } from '@testing-library/react';
import ReactModal from 'react-modal';

import { server } from './msw/server';

configure({ asyncUtilTimeout: 4_000 });

const modalAppRoot = document.createElement('div');
modalAppRoot.id = 'root';
document.body.append(modalAppRoot);
ReactModal.setAppElement(modalAppRoot);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();

  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterAll(() => {
  server.close();
});

Object.defineProperties(HTMLElement.prototype, {
  scrollTo: {
    configurable: true,
    value: () => undefined,
  },
  scrollBy: {
    configurable: true,
    value: () => undefined,
  },
});
