import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // 개인정보가 섞일 수 있는 화면 상태는 로그로 남기지 않는다.
  }

  render() {
    if (this.state.failed)
      return (
        <main
          style={{
            display: 'grid',
            minHeight: '100dvh',
            placeItems: 'center',
            padding: 24,
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            textAlign: 'center',
          }}
        >
          <div>
            <h1>다시 시도해주세요</h1>
            <button
              type="button"
              onClick={() => location.reload()}
              style={{
                minHeight: 48,
                padding: '0 24px',
                border: 0,
                borderRadius: 12,
                background: '#4356d8',
                color: '#fff',
              }}
            >
              다시 시도
            </button>
          </div>
        </main>
      );
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
