type AddToHomeScreenDevice = 'IOS' | 'ANDROID' | 'DESKTOP';

interface AddToHomeScreenDeviceInfo {
  isStandAlone: boolean;
  canBeStandAlone: boolean;
  device: AddToHomeScreenDevice;
}

interface AddToHomeScreenInstance {
  show: (locale: string) => AddToHomeScreenDeviceInfo;
  clearModalDisplayCount: () => void;
  isStandAlone: () => boolean;
  closeModal: () => void;
  modalIsShowing: () => boolean;
}

interface AddToHomeScreenOptions {
  appName: string;
  appIconUrl: string;
  assetUrl: string;
  appNameDisplay?: 'standalone' | 'inline';
  maxModalDisplayCount?: number;
  displayOptions?: {
    showMobile: boolean;
    showDesktop: boolean;
  };
  allowClose?: boolean;
  showArrow?: boolean;
}

interface Window {
  AddToHomeScreen?: (options: AddToHomeScreenOptions) => AddToHomeScreenInstance;
}
