import { useEffect, useState, useSyncExternalStore } from 'react';

import { GuideModal } from '../../../../shared/components/Modal/GuideModal';
import {
  getInstallAvailability,
  initializeInstallPrompt,
  requestPwaInstall,
  subscribeToInstallAvailability,
} from '../../../../shared/pwa/installPrompt';
import { HelpButton } from './HelpButton';
import { HelpPopover } from './HelpPopover';

const FEEDBACK_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSc4g7zOPP50jMT7AIfBj93PW4w80NJURx91v7NXS3_-jDVcTg/viewform?usp=sharing&ouid=114559092958069426550';

export const HelpMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const isInstallAvailable = useSyncExternalStore(
    subscribeToInstallAvailability,
    getInstallAvailability,
    () => false,
  );

  useEffect(() => {
    initializeInstallPrompt();
  }, []);

  return (
    <>
      <HelpButton isOpen={isOpen} onClick={() => setIsOpen((open) => !open)} />
      {isOpen && (
        <HelpPopover
          onClose={() => setIsOpen(false)}
          onGuideClick={() => setIsGuideOpen(true)}
          onInstallClick={() => void requestPwaInstall()}
          onFeedbackClick={() => window.open(FEEDBACK_URL, '_blank', 'noopener,noreferrer')}
          isInstallAvailable={isInstallAvailable}
        />
      )}
      <GuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </>
  );
};
