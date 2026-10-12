import { css } from '@emotion/css';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { GuideModal } from '../../../../shared/components/Modal/GuideModal';
import { useModal } from '../../../../shared/hooks/useModal';
import { FEEDBACK_URL, GUIDE_SEEN_KEY } from '../../../../shared/constants/help';
import {
  getInstallAvailability,
  initializeInstallPrompt,
  requestPwaInstall,
  subscribeToInstallAvailability,
} from '../../../../shared/pwa/installPrompt';
import { HelpButton } from './HelpButton';
import { HelpPopover } from './HelpPopover';

export const HelpMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const guideModal = useModal(() => localStorage.getItem(GUIDE_SEEN_KEY) !== 'true');
  const isInstallAvailable = useSyncExternalStore(
    subscribeToInstallAvailability,
    getInstallAvailability,
    () => false,
  );

  useEffect(() => {
    initializeInstallPrompt();
  }, []);

  const closeGuide = () => {
    localStorage.setItem(GUIDE_SEEN_KEY, 'true');
    guideModal.close();
  };

  return (
    <div className={menuStyle}>
      <HelpButton isOpen={isOpen} onClick={() => setIsOpen((open) => !open)} />
      {isOpen && (
        <HelpPopover
          onClose={() => setIsOpen(false)}
          onGuideClick={guideModal.open}
          onInstallClick={() => void requestPwaInstall()}
          onFeedbackClick={() => window.open(FEEDBACK_URL, '_blank', 'noopener,noreferrer')}
          isInstallAvailable={isInstallAvailable}
        />
      )}
      {guideModal.isOpen && <GuideModal onClose={closeGuide} />}
    </div>
  );
};

const menuStyle = css`
  position: relative;
  width: 54px;
  height: 54px;
`;
