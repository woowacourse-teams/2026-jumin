import { showInstallGuide } from './addToHomeScreen';

type InstallOutcome = 'accepted' | 'dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: InstallOutcome;
    platform: string;
  }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let isInitialized = false;

const availabilityListeners = new Set<() => void>();

const notifyAvailabilityChange = () => {
  availabilityListeners.forEach((listener) => listener());
};

const isAndroid = () => /Android/i.test(window.navigator.userAgent);

export const initializeInstallPrompt = () => {
  if (isInitialized) return;

  isInitialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    notifyAvailabilityChange();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    notifyAvailabilityChange();
  });
};

export const subscribeToInstallAvailability = (listener: () => void) => {
  availabilityListeners.add(listener);

  return () => {
    availabilityListeners.delete(listener);
  };
};

export const getInstallAvailability = () => !isAndroid() || deferredInstallPrompt !== null;

export const requestPwaInstall = async () => {
  if (!deferredInstallPrompt) {
    if (!isAndroid()) {
      showInstallGuide();
    }

    return 'unavailable' as const;
  }

  const installPrompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  notifyAvailabilityChange();

  await installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;

  return outcome;
};
