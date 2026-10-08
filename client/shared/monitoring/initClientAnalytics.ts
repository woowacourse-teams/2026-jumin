import { initAnalytics } from '../analytics';
import { initClarity } from '../clarity';
import { ANALYTICS_OPT_OUT_KEY } from './constants';

interface Props {
  gaMeasurementId: string;
  clarityId: string;
}

export const initClientAnalytics = ({ gaMeasurementId, clarityId }: Props) => {
  const url = new URL(window.location.href);
  const analyticsSetting = url.searchParams.get(ANALYTICS_OPT_OUT_KEY);

  if (analyticsSetting === 'on' || analyticsSetting === 'off') {
    localStorage.setItem(ANALYTICS_OPT_OUT_KEY, String(analyticsSetting === 'on'));

    url.searchParams.delete(ANALYTICS_OPT_OUT_KEY);
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  const isAnalyticsExcluded = localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === 'true';
  if (!isAnalyticsExcluded) {
    initAnalytics(gaMeasurementId);
    initClarity(clarityId);
  }
};
