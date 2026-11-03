import { useEffect, useState } from 'react';

import { showInstallGuide } from '../pwa/addToHomeScreen';
import {
  getInstallAvailability,
  initializeInstallPrompt,
  requestPwaInstall,
} from '../pwa/installPrompt';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches === true ||
  ('standalone' in navigator && navigator.standalone === true);

export const usePwaInstall = () => {
  const [isInstalled, setIsInstalled] = useState(isStandalone);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState('');

  useEffect(() => {
    initializeInstallPrompt();

    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallMessage('');
    };
    window.addEventListener('appinstalled', handleInstalled);

    return () => window.removeEventListener('appinstalled', handleInstalled);
  }, []);

  const handleInstall = async () => {
    setInstallMessage('');
    setIsInstalling(true);

    try {
      if (!getInstallAvailability()) {
        await showInstallGuide();
        return;
      }

      const outcome = await requestPwaInstall();
      if (outcome === 'accepted') {
        setInstallMessage('설치가 끝나면 홈 화면에서 주차의민족을 열 수 있어요.');
      }
    } catch {
      setInstallMessage('설치창을 열지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsInstalling(false);
    }
  };

  return { isInstalled, isInstalling, installMessage, handleInstall };
};
