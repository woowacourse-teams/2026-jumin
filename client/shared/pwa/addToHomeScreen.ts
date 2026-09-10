let installGuide: AddToHomeScreenInstance | null = null;
let initializedFactory: Window['AddToHomeScreen'] | null = null;

export const initializeInstallGuide = () => {
  if (typeof window.AddToHomeScreen !== 'function') return null;

  if (installGuide && initializedFactory === window.AddToHomeScreen) {
    return installGuide;
  }

  initializedFactory = window.AddToHomeScreen;
  installGuide = window.AddToHomeScreen({
    appName: '주차의민족',
    appNameDisplay: 'standalone',
    appIconUrl: '/icons/pwa-192.png',
    assetUrl: '/vendor/add-to-homescreen/assets/img/',
    maxModalDisplayCount: -1,
    displayOptions: {
      showMobile: true,
      showDesktop: true,
    },
    allowClose: true,
    showArrow: true,
  });

  return installGuide;
};

export const showInstallGuide = () => {
  initializeInstallGuide()?.show('ko');
};
