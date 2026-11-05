import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReactModal from 'react-modal';

import { PmfSurveyModal } from '../../src/shared/components/service/pmfSurvey/PmfSurveyModal';
import {
  hidePmfSurveyForThreeDays,
  shouldShowPmfSurvey,
} from '../../src/shared/components/service/pmfSurvey/pmfSurveyVisibility';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1_000;

beforeAll(() => ReactModal.setAppElement(document.createElement('div')));

it('3일간 숨긴 뒤 만료 시각에 다시 표시한다', () => {
  const now = Date.now();
  expect(shouldShowPmfSurvey(now)).toBe(true);

  hidePmfSurveyForThreeDays(now);
  expect(shouldShowPmfSurvey(now + THREE_DAYS_MS - 1)).toBe(false);
  expect(shouldShowPmfSurvey(now + THREE_DAYS_MS)).toBe(true);
});

it('닫기는 현재 모달만 닫고, 3일간 보지 않기는 다음 진입도 숨긴다', async () => {
  const user = userEvent.setup();
  const first = render(<PmfSurveyModal />);

  expect(screen.getByRole('dialog', { name: '서비스 이용 경험 설문' })).toBeVisible();

  await user.click(screen.getByRole('button', { name: '서비스 이용 경험 설문 닫기' }));
  expect(screen.queryByRole('dialog', { name: '서비스 이용 경험 설문' })).not.toBeInTheDocument();
  first.unmount();

  const second = render(<PmfSurveyModal />);
  expect(screen.getByRole('dialog', { name: '서비스 이용 경험 설문' })).toBeVisible();

  await user.click(screen.getByRole('button', { name: '3일간 보지 않기' }));
  expect(screen.queryByRole('dialog', { name: '서비스 이용 경험 설문' })).not.toBeInTheDocument();
  second.unmount();

  render(<PmfSurveyModal />);
  expect(screen.queryByRole('dialog', { name: '서비스 이용 경험 설문' })).not.toBeInTheDocument();
});
