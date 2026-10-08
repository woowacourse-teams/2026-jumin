import { initAnalytics } from '../analytics';
import { initClarity } from '../clarity';

interface Props {
  gaMeasurementId: string;
  clarityId: string;
}

export const initClientAnalytics = ({ gaMeasurementId, clarityId }: Props) => {
  const url = new URL(window.location.href);
  const analyticsSetting = url.searchParams.get('analytics_opt_out');

  if (analyticsSetting === 'on' || analyticsSetting === 'off') {
    localStorage.setItem('analytics_opt_out', String(analyticsSetting === 'on'));

    url.searchParams.delete('analytics_opt_out');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  const isAnalyticsExcluded = localStorage.getItem('analytics_opt_out') === 'true';
  if (!isAnalyticsExcluded) {
    initAnalytics(gaMeasurementId);
    initClarity(clarityId);
  }
};
