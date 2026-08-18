import { BrowserRouter } from 'react-router';
import { createRoot } from 'react-dom/client';
import App from './App';

const renderApp = () => {
  createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
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

void enableMocking().then(renderApp);
