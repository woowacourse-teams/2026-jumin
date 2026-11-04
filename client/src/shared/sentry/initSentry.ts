import * as Sentry from '@sentry/react';

export const initSentry = () => {
  if (!__SENTRY_DSN__) return;

  Sentry.init({
    dsn: __SENTRY_DSN__,
    environment: __SENTRY_ENVIRONMENT__,
  });
};
