import { jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';

import { LandingGuide } from '../../src/pages/LandingPage/components/LandingGuide';

const originalObserver = window.IntersectionObserver;
const originalMatchMedia = window.matchMedia;
const observer = { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() };
const createObserver = jest.fn();
const motion = {
  matches: false,
  addEventListener: jest.fn<(event: string, listener: () => void) => void>(),
  removeEventListener: jest.fn(),
};
let notify: IntersectionObserverCallback;
let notifyMotion: () => void;
const sections = () => Array.from(document.querySelectorAll('[data-guide-step]'));

const updateVisibility = (target: Element, ratio: number) =>
  act(() =>
    notify(
      [
        {
          target,
          isIntersecting: ratio > 0,
          intersectionRatio: ratio,
        } as IntersectionObserverEntry,
      ],
      observer as unknown as IntersectionObserver,
    ),
  );

beforeEach(() => {
  motion.matches = false;
  notifyMotion = () => undefined;
  motion.addEventListener.mockImplementation((_event, listener) => {
    notifyMotion = listener;
  });
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
        createObserver();
      }
      observe = observer.observe;
      unobserve = observer.unobserve;
      disconnect = observer.disconnect;
    },
  });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => motion });
});

afterEach(() => {
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: originalObserver,
  });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
  jest.useRealTimers();
});

it('실제 화면 네 장과 설명을 서비스 이용 순서대로 모두 렌더링한다', () => {
  render(<LandingGuide />);
  expect(screen.getAllByRole('img').map((image) => image.getAttribute('alt'))).toEqual([
    '검색창과 주변 주차장이 표시된 실제 홈 화면',
    '양재시민의숲에 목적지 핀을 맞춘 실제 목적지 설정 화면',
    '목적지 주변 지도와 예상 요금, 도보 거리를 보여주는 실제 추천 화면',
    '예상 요금, 운영시간과 길찾기 버튼이 표시된 실제 주차장 상세 화면',
  ]);
  expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
    '어디에 가세요?검색부터 시작하세요.',
    '가고 싶은 곳에핀을 맞춰주세요.',
    '거리와 요금을 비교해내게 맞는 주차장으로.',
    '주차 정보를 확인하고,길찾기로 출발하세요.',
  ]);
  expect(sections()).toHaveLength(4);
});

it('자동 전환 타이머와 단계 선택 버튼 없이 시간이 지나도 네 화면을 유지한다', () => {
  jest.useFakeTimers();
  render(<LandingGuide />);
  const images = screen.getAllByRole('img');
  expect(jest.getTimerCount()).toBe(0);
  act(() => jest.advanceTimersByTime(20_000));
  expect(screen.getAllByRole('img')).toEqual(images);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

it('각 단계를 독립적으로 감시하고 충분히 화면에 들어온 단계만 표시한다', () => {
  render(<LandingGuide />);
  const steps = sections();
  expect(observer.observe).toHaveBeenCalledTimes(4);
  for (const step of steps) expect(step).toHaveAttribute('data-reveal', 'pending');

  updateVisibility(steps[0]!, 0.05);
  expect(steps[0]).toHaveAttribute('data-reveal', 'pending');
  updateVisibility(steps[0]!, 0.2);
  expect(steps[0]).toHaveAttribute('data-reveal', 'visible');
  expect(observer.unobserve).toHaveBeenCalledWith(steps[0]);
  for (const step of steps.slice(1)) expect(step).toHaveAttribute('data-reveal', 'pending');

  for (const step of steps.slice(1)) {
    updateVisibility(step, 0.2);
    expect(step).toHaveAttribute('data-reveal', 'visible');
  }
  expect(observer.unobserve).toHaveBeenCalledTimes(4);
});

it('한 번 나타난 단계는 스크롤로 벗어나도 다시 숨기지 않는다', () => {
  render(<LandingGuide />);
  const first = sections()[0]!;
  updateVisibility(first, 0.2);
  updateVisibility(first, 0);
  expect(first).toHaveAttribute('data-reveal', 'visible');
});

it('동작 줄이기 설정에서는 감시나 숨김 처리 없이 네 단계를 표시한다', () => {
  motion.matches = true;
  render(<LandingGuide />);
  expect(createObserver).not.toHaveBeenCalled();
  for (const step of sections()) expect(step).not.toHaveAttribute('data-reveal');
  for (const image of screen.getAllByRole('img')) expect(image).toBeVisible();
});

it('사용 중 동작 줄이기를 켜면 아직 나타나지 않은 단계도 모두 표시한다', () => {
  render(<LandingGuide />);
  motion.matches = true;
  act(() => notifyMotion());
  for (const step of sections()) expect(step).toHaveAttribute('data-reveal', 'visible');
  expect(observer.disconnect).toHaveBeenCalled();
});

it('IntersectionObserver를 지원하지 않으면 네 단계를 숨기지 않는다', () => {
  Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: undefined });
  render(<LandingGuide />);
  for (const step of sections()) expect(step).not.toHaveAttribute('data-reveal');
  for (const image of screen.getAllByRole('img')) expect(image).toBeVisible();
});

it('언마운트할 때 감시와 동작 줄이기 이벤트 구독을 해제한다', () => {
  const { unmount } = render(<LandingGuide />);
  unmount();
  expect(observer.disconnect).toHaveBeenCalled();
  expect(motion.removeEventListener).toHaveBeenCalledWith('change', notifyMotion);
});
