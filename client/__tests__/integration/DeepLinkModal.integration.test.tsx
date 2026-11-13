import { jest } from '@jest/globals';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReactModal from 'react-modal';
import { DeepLinkModal } from '../../src/shared/components/service/directions/DeepLinkModal';

// 위치 조회 결과에 따라 길찾기 모달이 버튼과 재시도 동작을 올바르게 바꾸는지 확인한다.
const destination = {
  name: '시계탑빌딩 주차장',
  location: { latitude: 37.498784, longitude: 127.027824 },
};

const currentPosition = {
  coords: {
    latitude: 37.4981,
    longitude: 127.0279,
    accuracy: 1,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: 1,
} as GeolocationPosition;

let appRoot: HTMLDivElement;
let originalGeolocation: PropertyDescriptor | undefined;

beforeEach(() => {
  appRoot = document.createElement('div');
  document.body.append(appRoot);
  ReactModal.setAppElement(appRoot);
  originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
});

afterEach(() => {
  appRoot.remove();
  if (originalGeolocation) Object.defineProperty(navigator, 'geolocation', originalGeolocation);
  else Reflect.deleteProperty(navigator, 'geolocation');
});

const setupGeolocation = () => {
  let onSuccess: PositionCallback | undefined;
  let onError: PositionErrorCallback | null | undefined;
  const getCurrentPosition = jest.fn(
    (success: PositionCallback, error?: PositionErrorCallback | null) => {
      onSuccess = success;
      onError = error;
    },
  );
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });

  return {
    getCurrentPosition,
    succeed: async () => {
      await act(async () => onSuccess!(currentPosition));
    },
    timeout: async () => {
      await act(async () =>
        onError!({
          code: 3,
          message: 'Timeout expired',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError),
      );
    },
  };
};

const renderModal = async () => {
  render(<DeepLinkModal destination={destination} onRequestClose={() => {}} />, {
    container: appRoot,
  });
  const dialog = await screen.findByRole('dialog', { name: '어떤 앱으로 갈까요?' });
  const naverMapButton = within(dialog).getByRole('button', { name: /네이버 지도/ });
  return { dialog, naverMapButton };
};

it('위치 조회 중에는 지도 앱 버튼을 비활성화하고 성공하면 활성화한다', async () => {
  const geolocation = setupGeolocation();
  const { naverMapButton } = await renderModal();

  await waitFor(() => expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1));
  expect(naverMapButton).toBeDisabled();
  expect(screen.getByText('현재 위치를 확인하고 있어요.')).toBeInTheDocument();

  await geolocation.succeed();
  expect(naverMapButton).toBeEnabled();
  expect(screen.queryByText('현재 위치를 확인하고 있어요.')).not.toBeInTheDocument();
});

it('위치 조회 시간 초과를 알리고 재시도에 성공하면 지도 앱 버튼을 활성화한다', async () => {
  const geolocation = setupGeolocation();
  const user = userEvent.setup();
  const { naverMapButton } = await renderModal();

  await waitFor(() => expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1));
  await geolocation.timeout();
  expect(screen.getByRole('alert')).toHaveTextContent('현재 위치를 가져오지 못했어요.');
  expect(naverMapButton).toBeDisabled();

  await user.click(screen.getByRole('button', { name: '다시 시도' }));
  await waitFor(() => expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(2));
  await geolocation.succeed();
  expect(naverMapButton).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
