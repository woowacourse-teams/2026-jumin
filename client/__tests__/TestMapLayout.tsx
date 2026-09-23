import { useState } from 'react';
import { Outlet } from 'react-router';

import type { RecommendView } from '../shared/types/navigation';

interface Props {
  initialRecommendView?: RecommendView | null;
}

export const TestMapLayout = ({ initialRecommendView = null }: Props) => {
  const [recommendView, setRecommendView] = useState<RecommendView | null>(initialRecommendView);

  return <Outlet context={{ map: null, recommendView, setRecommendView }} />;
};
