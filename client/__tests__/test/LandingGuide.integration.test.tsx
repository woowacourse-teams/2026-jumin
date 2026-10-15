import { jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { LandingGuide } from '../../src/pages/LandingPage/components/LandingGuide';

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const currentStep = () => document.querySelector('[aria-current="step"]');

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('한 화면을 5초 동안 보여준 뒤 다음 단계로 전환하고 마지막 단계에서 처음으로 돌아온다', () => {
  render(<LandingGuide />);
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(currentStep()).toHaveTextContent('목적지 검색');
  advance(4_999);
  expect(currentStep()).toHaveTextContent('목적지 검색');
  advance(1);
  expect(currentStep()).toHaveTextContent('목적지 정하기');
  advance(5_000);
  expect(currentStep()).toHaveTextContent('주차장 추천받기');
  advance(5_000);
  expect(currentStep()).toHaveTextContent('상세정보 · 길찾기');
  advance(5_000);
  expect(currentStep()).toHaveTextContent('목적지 검색');
});

it('단계 선택 시 이미지와 설명을 함께 바꾸고 타이머를 다시 시작한다', () => {
  render(<LandingGuide />);
  advance(4_000);
  fireEvent.click(screen.getByRole('button', { name: /03 주차장 추천받기/ }));
  expect(screen.getByRole('heading')).toHaveTextContent('거리와 요금을 비교해');
  expect(screen.getByRole('img')).toHaveAccessibleName(/실제 추천 화면/);
  advance(4_999);
  expect(currentStep()).toHaveTextContent('주차장 추천받기');
  advance(1);
  expect(currentStep()).toHaveTextContent('상세정보 · 길찾기');
});

it('하단 단계 숫자, 재생 제어 버튼과 자동 전환 안내 문구는 표시하지 않는다', () => {
  render(<LandingGuide />);
  expect(screen.getAllByRole('button')).toHaveLength(4);
  expect(screen.queryByText(/\/ 04/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /자동 재생/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/5초마다 다음 화면/)).not.toBeInTheDocument();
});

it('마우스를 올리거나 키보드로 조작하는 동안에는 자동으로 전환하지 않는다', () => {
  render(<LandingGuide />);
  const guide = screen.getByRole('region', { name: '주차의민족 이용 방법' });
  fireEvent.mouseEnter(guide);
  advance(10_000);
  expect(currentStep()).toHaveTextContent('목적지 검색');
  fireEvent.mouseLeave(guide);
  const button = screen.getByRole('button', { name: /02 목적지 정하기/ });
  fireEvent.focus(button);
  advance(10_000);
  expect(currentStep()).toHaveTextContent('목적지 검색');
  fireEvent.blur(button, { relatedTarget: null });
  advance(5_000);
  expect(currentStep()).toHaveTextContent('목적지 정하기');
});

it('숨겨진 탭에서는 멈추고 다시 보이면 5초를 새로 센다', () => {
  render(<LandingGuide />);
  jest.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  fireEvent(document, new Event('visibilitychange'));
  advance(10_000);
  expect(currentStep()).toHaveTextContent('목적지 검색');
  jest.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  fireEvent(document, new Event('visibilitychange'));
  advance(5_000);
  expect(currentStep()).toHaveTextContent('목적지 정하기');
});

it('동작 줄이기 설정에서는 자동 전환 없이 직접 단계를 선택한다', () => {
  const original = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
  });
  try {
    render(<LandingGuide />);
    advance(10_000);
    expect(currentStep()).toHaveTextContent('목적지 검색');
    fireEvent.click(screen.getByRole('button', { name: /04 상세정보/ }));
    expect(currentStep()).toHaveTextContent('상세정보 · 길찾기');
  } finally {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: original });
  }
});

it('이용 안내가 화면에 보일 때부터 5초 전환을 시작하고 벗어나면 멈춘다', () => {
  const original = window.IntersectionObserver;
  let notify: IntersectionObserverCallback = () => undefined;
  const observer = {
    observe: jest.fn(),
    disconnect: jest.fn(),
  };
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe = observer.observe;
      disconnect = observer.disconnect;
    },
  });
  const updateVisibility = (visible: boolean) =>
    act(() =>
      notify(
        [
          {
            isIntersecting: visible,
            intersectionRatio: visible ? 1 : 0,
          } as IntersectionObserverEntry,
        ],
        observer as unknown as IntersectionObserver,
      ),
    );
  try {
    const { unmount } = render(<LandingGuide />);
    advance(10_000);
    expect(currentStep()).toHaveTextContent('목적지 검색');
    updateVisibility(true);
    advance(5_000);
    expect(currentStep()).toHaveTextContent('목적지 정하기');
    updateVisibility(false);
    advance(10_000);
    expect(currentStep()).toHaveTextContent('목적지 정하기');
    unmount();
    expect(observer.disconnect).toHaveBeenCalled();
  } finally {
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: original });
  }
});
