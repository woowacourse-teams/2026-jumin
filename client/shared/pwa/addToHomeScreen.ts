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

export const showInstallGuide = async () => {
  await Promise.all([loadInstallGuideScript(), loadInstallGuideStyle()]);

  const guide = initializeInstallGuide();

  if (!guide) {
    throw new Error('설치 안내를 초기화하지 못했어요.');
  }

  guide.show('ko');
};

let installGuideScriptPromise: Promise<void> | null = null;

const loadInstallGuideScript = (): Promise<void> => {
  if (typeof window.AddToHomeScreen === 'function') {
    return Promise.resolve();
  }

  if (installGuideScriptPromise) {
    return installGuideScriptPromise;
  }

  installGuideScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');

    script.src = '/vendor/add-to-homescreen/add-to-homescreen.min.js';

    script.onload = () => resolve();

    script.onerror = () => {
      script.remove();
      installGuideScriptPromise = null;
      reject(new Error('설치 안내 스크립트를 불러오지 못했어요.'));
    };

    document.head.appendChild(script);
  });

  return installGuideScriptPromise;
};

let installGuideStylePromise: Promise<void> | null = null;

const loadInstallGuideStyle = (): Promise<void> => {
  if (installGuideStylePromise) {
    return installGuideStylePromise;
  }

  installGuideStylePromise = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');

    link.rel = 'stylesheet';
    link.href = '/vendor/add-to-homescreen/add-to-homescreen.min.css';

    link.onload = () => resolve();

    link.onerror = () => {
      link.remove();
      installGuideStylePromise = null;
      reject(new Error('설치 안내 스타일을 불러오지 못했어요.'));
    };

    document.head.appendChild(link);
  });

  return installGuideStylePromise;
};
