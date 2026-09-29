import { BrowserRouter } from 'react-router';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initAnalytics } from './shared/analytics';
import { initializeInstallGuide } from './shared/pwa/addToHomeScreen';
import { initializeInstallPrompt } from './shared/pwa/installPrompt';
import { applyGlobalStyles } from './shared/styles/globalStyle';
import {
  CancelledError,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { initClarity } from './shared/clarity';

import * as Sentry from '@sentry/react';
import { initSentry } from './shared/sentry/initSentry';

initSentry();
initAnalytics(__GA_MEASUREMENT_ID__);
initClarity(__CLARITY_PROJECT_ID__);
initializeInstallGuide();
initializeInstallPrompt();
applyGlobalStyles();

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError(error, query) {
      if (
        error instanceof CancelledError ||
        (error instanceof DOMException && error.name === 'AbortError')
      )
        return;

      Sentry.captureException(error, {
        tags: {
          feature: String(query.meta?.feature ?? 'unknown'),
          operation: String(query.meta?.operation ?? 'query'),
        },
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const renderApp = () => {
  createRoot(document.getElementById('root')!, {
    onUncaughtError(error, errorInfo) {
      Sentry.withScope((scope) => {
        scope.setTag('react_error_type', 'uncaught');
        scope.setLevel('fatal');

        Sentry.reactErrorHandler()(error, errorInfo);
      });
    },

    onRecoverableError(error, errorInfo) {
      Sentry.withScope((scope) => {
        scope.setTag('react_error_type', 'recoverable');
        scope.setLevel('warning');

        Sentry.reactErrorHandler()(error, errorInfo);
      });
    },
  }).render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>,
  );
};

const enableMocking = async () => {
  if (!__MSW_ENABLED__) return;

  const { worker } = await import('./mocks/browser');

  await worker.start({
    onUnhandledRequest(request, print) {
      if (new URL(request.url).pathname.startsWith('/api/')) {
        print.error();
      }
    },
  });
};

if (__PWA_ENABLED__ && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js');
  });
}

void enableMocking().then(renderApp);
