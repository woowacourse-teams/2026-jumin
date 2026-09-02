import { BrowserRouter } from 'react-router';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initAnalytics } from './shared/analytics';
import { applyGlobalStyles } from './shared/styles/globalStyle';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

initAnalytics(__GA_MEASUREMENT_ID__);
applyGlobalStyles();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const renderApp = () => {
  createRoot(document.getElementById('root')!).render(
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
